// Keep each touch independent so one thumb can move while another attacks.
export function bindTouchControls({
  root,
  canMove = () => true,
  canAct = canMove,
  onHeld = () => {},
  onAction = () => {},
  onInputChange = () => {},
  haptic = () => {},
}) {
  const movePad = root.querySelector('.move-pad');
  const stickKnob = movePad?.querySelector('.stick-knob');
  const movement = new Map();
  const buttons = [...root.querySelectorAll('[data-action], [data-hold="guard"]')]
    .map(element => ({ element, name: element.dataset.action || 'guard', pointers: new Set() }));
  const held = { left: false, right: false, guard: false, attack: false };
  const stickDeadzone = .18;

  const preventGesture = event => { if (event.cancelable) event.preventDefault(); };
  const isPrimaryButton = event => event.button == null || event.button === 0;
  const capture = (element, id) => { try { element.setPointerCapture(id); } catch {} };
  const release = (element, id) => {
    try { if (!element.hasPointerCapture || element.hasPointerCapture(id)) element.releasePointerCapture(id); } catch {}
  };
  function updateHeld(values) {
    let changed = false;
    for (const [name, value] of Object.entries(values)) {
      if (held[name] === value) continue;
      held[name] = value;
      onHeld(name, value);
      changed = true;
    }
    if (changed) onInputChange();
  }
  function renderStick(x = 0, y = 0, active = false) {
    movePad?.style.setProperty('--stick-x', `${x}px`);
    movePad?.style.setProperty('--stick-y', `${y}px`);
    movePad?.classList.toggle('active', active);
  }
  function updateMovement() {
    const current = movement.values().next().value;
    let direction = '';
    let stickX = 0;
    let stickY = 0;
    if (current && canMove()) {
      const bounds = movePad.getBoundingClientRect();
      const baseSize = Math.min(bounds.width, bounds.height);
      const knobBounds = stickKnob?.getBoundingClientRect();
      const knobSize = knobBounds ? Math.max(knobBounds.width, knobBounds.height) : baseSize * .48;
      const baseRadius = baseSize / 2;
      const travel = Math.max(1, Math.min((baseSize - knobSize) / 2, baseRadius * .48));
      const deadzone = baseRadius * stickDeadzone;
      const offsetX = current.x - (bounds.left + bounds.width / 2);
      const offsetY = current.y - (bounds.top + bounds.height / 2);
      const distance = Math.hypot(offsetX, offsetY);
      const clamp = distance > travel ? travel / distance : 1;
      stickX = offsetX * clamp;
      stickY = offsetY * clamp;
      // Vertical stick movement is visual only: jumping stays on its own button.
      // Captured drags beyond the base remain active; only neutral/release stops them.
      if (distance > deadzone) {
        if (stickX < -deadzone) direction = 'left';
        else if (stickX > deadzone) direction = 'right';
      }
    }
    renderStick(stickX, stickY, !!current && canMove());
    updateHeld({ left: direction === 'left', right: direction === 'right' });
  }
  function clearMovement() {
    const ids = [...movement.keys()];
    movement.clear();
    updateMovement();
    for (const id of ids) release(movePad, id);
  }

  if (movePad) {
    movePad.addEventListener('pointerdown', event => {
      if (!isPrimaryButton(event)) return;
      preventGesture(event);
      // The first thumb owns the stick until released; an accidental second touch
      // never changes its direction or takes over when that first thumb lifts.
      if (!canMove() || movement.size > 0) return;
      movement.set(event.pointerId, { x: event.clientX, y: event.clientY });
      capture(movePad, event.pointerId);
      updateMovement();
      haptic(6);
    });
    movePad.addEventListener('pointermove', event => {
      const pointer = movement.get(event.pointerId);
      if (!pointer) return;
      preventGesture(event);
      if (!canMove()) { clearMovement(); return; }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      updateMovement();
    });
    const endMovement = event => {
      if (!movement.delete(event.pointerId)) return;
      preventGesture(event);
      updateMovement();
      release(movePad, event.pointerId);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) movePad.addEventListener(type, endMovement);
  }

  function updateButton(button) {
    const pressed = button.pointers.size > 0;
    button.element.classList.toggle('pressed', pressed);
    if (button.name === 'guard' || button.name === 'attack') updateHeld({ [button.name]: pressed });
  }
  for (const button of buttons) {
    const { element, name, pointers } = button;
    element.addEventListener('pointerdown', event => {
      if (!isPrimaryButton(event)) return;
      preventGesture(event);
      if (!(name === 'guard' ? canMove() : canAct()) || pointers.has(event.pointerId)) return;
      const firstPointer = pointers.size === 0;
      pointers.add(event.pointerId);
      capture(element, event.pointerId);
      updateButton(button);
      if (name !== 'guard' && (name !== 'attack' || firstPointer)) onAction(name);
      haptic(8);
    });
    const endButton = event => {
      if (!pointers.delete(event.pointerId)) return;
      preventGesture(event);
      updateButton(button);
      release(element, event.pointerId);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, endButton);
    // Native keyboard and assistive-technology activation does not create a held input.
    if (name !== 'guard') element.addEventListener('click', event => {
      if (event.detail !== 0 || !canAct()) return;
      preventGesture(event);
      onAction(name);
    });
  }
  root.addEventListener('touchmove', preventGesture, { passive: false });
  root.addEventListener('contextmenu', preventGesture);
  root.addEventListener('dragstart', preventGesture);

  return {
    clear() {
      // Remove tracked pointers before releasing capture: lostpointercapture can fire immediately.
      const movementIds = [...movement.keys()];
      const buttonIds = buttons.map(button => [...button.pointers]);
      movement.clear();
      for (const button of buttons) { button.pointers.clear(); button.element.classList.remove('pressed'); }
      renderStick();
      updateHeld({ left: false, right: false, guard: false, attack: false });
      for (const id of movementIds) release(movePad, id);
      buttons.forEach((button, index) => { for (const id of buttonIds[index]) release(button.element, id); });
    },
  };
}
