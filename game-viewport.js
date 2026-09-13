// Keep the stage and its touch controls in the same visible viewport box.
// Safari's browser chrome can move that box without changing the layout viewport.
export function createGameViewport(shell, canvas, onResize = () => {}) {
  const view = shell.ownerDocument?.defaultView || window;
  const visibleViewport = view.visualViewport;
  let frame = null;
  let previous = null;
  let destroyed = false;
  const styleValues = new Map();

  const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const offset = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  const setSize = (name, value) => {
    const text = `${value}px`;
    if (styleValues.get(name) === text) return;
    shell.style.setProperty(name, text);
    styleValues.set(name, text);
  };

  function sync() {
    if (destroyed) return previous;
    const viewport = view.visualViewport;
    const width = Math.max(1, Math.round(positive(viewport?.width, positive(view.innerWidth, 1))));
    const height = Math.max(1, Math.round(positive(viewport?.height, positive(view.innerHeight, 1))));
    const left = offset(viewport?.offsetLeft);
    const top = offset(viewport?.offsetTop);
    setSize('--game-width', width);
    setSize('--game-height', height);
    setSize('--game-left', left);
    setSize('--game-top', top);

    // Read back the shared shell box after applying the CSS variables, rather
    // than sizing the canvas and overlays from separate viewport APIs.
    const measuredWidth = positive(shell.clientWidth, width);
    const measuredHeight = positive(shell.clientHeight, height);
    const dpr = Math.min(positive(view.devicePixelRatio, 1), 2);
    const pixelWidth = Math.max(1, Math.round(measuredWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(measuredHeight * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    const changed = !previous || previous.width !== measuredWidth || previous.height !== measuredHeight
      || previous.pixelWidth !== pixelWidth || previous.pixelHeight !== pixelHeight;
    previous = { width: measuredWidth, height: measuredHeight, left, top, dpr, pixelWidth, pixelHeight };
    if (changed) onResize(previous);
    return previous;
  }

  function schedule() {
    if (destroyed || frame !== null) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      sync();
    });
  }

  const targets = [view, visibleViewport].filter(Boolean);
  for (const target of targets) {
    target.addEventListener('resize', schedule, { passive: true });
    target.addEventListener('scroll', schedule, { passive: true });
  }

  function cleanup() {
    destroyed = true;
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
    for (const target of targets) {
      target.removeEventListener('resize', schedule);
      target.removeEventListener('scroll', schedule);
    }
  }

  return { sync, resize: sync, cleanup };
}
