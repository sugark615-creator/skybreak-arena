/** Draw the same slash in fighter-local coordinates for either facing direction. */
export function drawMeleeArc(ctx, fighter) {
  if (fighter.attackTimer <= 0) return;

  const progress = 1 - fighter.attackTimer / fighter.attackDuration;
  const strength = Math.sin(progress * Math.PI);
  const start = -1.3;

  ctx.save();
  try {
    ctx.translate(fighter.x + fighter.width / 2, fighter.y + fighter.height / 2);
    ctx.scale(fighter.facing, 1);
    ctx.strokeStyle = fighter.comboStep === 3 ? '#ffffff' : fighter.color;
    ctx.lineWidth = fighter.comboStep === 3 ? 24 : 15;
    ctx.globalAlpha = .3 + strength * .7;
    ctx.shadowColor = fighter.color;
    ctx.shadowBlur = 34;
    ctx.beginPath();
    ctx.arc(38, 0, 92 + fighter.comboStep * 9, start, start + 1.1 + progress * 1.55, false);
    ctx.stroke();
  } finally {
    ctx.restore();
  }
}
