import test from 'node:test';
import assert from 'node:assert/strict';
import { drawMeleeArc } from './melee-effect.js';

class MockCanvasContext {
  constructor() {
    this.transform = [1, 0, 0, 1, 0, 0];
    this.strokeStyle = '#123456';
    this.lineWidth = 3;
    this.globalAlpha = .6;
    this.shadowColor = '#abcdef';
    this.shadowBlur = 4;
    this.stack = [];
    this.drawn = [];
    this.calls = [];
  }

  snapshot() {
    return {
      transform: [...this.transform],
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha,
      shadowColor: this.shadowColor,
      shadowBlur: this.shadowBlur,
    };
  }

  save() { this.calls.push('save'); this.stack.push(this.snapshot()); }
  restore() { this.calls.push('restore'); Object.assign(this, this.stack.pop()); }
  translate(x, y) {
    const [a, b, c, d, e, f] = this.transform;
    this.transform = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
  }
  scale(x, y) {
    const [a, b, c, d, e, f] = this.transform;
    this.transform = [a * x, b * x, c * y, d * y, e, f];
  }
  beginPath() { this.calls.push('beginPath'); this.path = null; }
  arc(x, y, radius, start, end, anticlockwise) {
    const [a, b, c, d, e, f] = this.transform;
    const points = Array.from({ length: 41 }, (_, i) => {
      const angle = start + (end - start) * i / 40;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      return { x: a * px + c * py + e, y: b * px + d * py + f };
    });
    this.path = { x, y, radius, start, end, anticlockwise, points };
  }
  stroke() { this.calls.push('stroke'); this.drawn.push({ ...this.path, ...this.snapshot() }); }
}

function fighter(overrides = {}) {
  return {
    x: 420, y: 260, width: 96, height: 114,
    facing: 1, color: '#65c6ff', comboStep: 1,
    attackDuration: .25, attackTimer: .125,
    ...overrides,
  };
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} versus ${expected}`);
}

for (const comboStep of [1, 2, 3]) {
  test(`combo ${comboStep}: the left slash exactly mirrors the right throughout the attack`, () => {
    for (const progress of [0, .1, .25, .5, .75, .99]) {
      const f = fighter({ comboStep, attackDuration: comboStep === 3 ? .38 : .25 });
      f.attackTimer = f.attackDuration * (1 - progress);
      const before = { ...f };
      const right = new MockCanvasContext();
      const left = new MockCanvasContext();
      drawMeleeArc(right, f);
      drawMeleeArc(left, { ...f, facing: -1 });
      const r = right.drawn[0];
      const l = left.drawn[0];
      assert.equal(right.drawn.length, 1);
      assert.equal(left.drawn.length, 1);
      r.points.forEach((point, i) => {
        close(l.points[i].x, 2 * (f.x + f.width / 2) - point.x, 'horizontal mirror');
        close(l.points[i].y, point.y, 'matching vertical position');
        assert.ok(point.x > f.x + f.width / 2, 'right slash stays ahead of fighter');
        assert.ok(l.points[i].x < f.x + f.width / 2, 'left slash stays ahead of fighter');
      });
      for (const effect of [r, l]) {
        assert.equal(effect.radius, 92 + comboStep * 9);
        assert.equal(effect.lineWidth, comboStep === 3 ? 24 : 15);
        assert.equal(effect.strokeStyle, comboStep === 3 ? '#ffffff' : f.color);
        assert.equal(effect.shadowColor, f.color);
        assert.equal(effect.shadowBlur, 34);
        close(effect.globalAlpha, .3 + Math.sin(progress * Math.PI) * .7, 'attack opacity');
      }
      assert.deepEqual(f, before, 'drawing must not alter fighter state');
    }
  });
}

test('turning during an attack uses the latest facing without leaving a stale slash', () => {
  const ctx = new MockCanvasContext();
  const f = fighter();
  const before = ctx.snapshot();
  drawMeleeArc(ctx, f);
  f.facing = -1;
  drawMeleeArc(ctx, f);
  f.facing = 1;
  drawMeleeArc(ctx, f);
  assert.equal(ctx.drawn.length, 3);
  const [first, turned, returned] = ctx.drawn;
  first.points.forEach((point, i) => {
    close(turned.points[i].x, 2 * (f.x + f.width / 2) - point.x, 'turned slash');
    close(turned.points[i].y, point.y, 'turned height');
  });
  assert.deepEqual(returned.points, first.points);
  assert.deepEqual(ctx.snapshot(), before);
});

test('save and restore preserve an existing world transform and all changed styles', () => {
  for (const facing of [1, -1]) {
    const ctx = new MockCanvasContext();
    ctx.transform = [1.4, .1, -.2, 1.2, 45, 28];
    const before = ctx.snapshot();
    drawMeleeArc(ctx, fighter({ facing }));
    assert.deepEqual(ctx.snapshot(), before);
    assert.equal(ctx.stack.length, 0);
    assert.deepEqual(ctx.calls, ['save', 'beginPath', 'stroke', 'restore']);
  }
});

test('an inactive or expired attack does not draw or change context state', () => {
  for (const attackTimer of [0, -.1]) {
    const ctx = new MockCanvasContext();
    const before = ctx.snapshot();
    drawMeleeArc(ctx, fighter({ attackTimer }));
    assert.deepEqual(ctx.snapshot(), before);
    assert.deepEqual(ctx.calls, []);
    assert.deepEqual(ctx.drawn, []);
  }
});

test('context is restored even if canvas drawing throws', () => {
  const ctx = new MockCanvasContext();
  const before = ctx.snapshot();
  ctx.arc = () => { throw new Error('draw failed'); };
  assert.throws(() => drawMeleeArc(ctx, fighter()), /draw failed/);
  assert.deepEqual(ctx.snapshot(), before);
  assert.equal(ctx.stack.length, 0);
});
