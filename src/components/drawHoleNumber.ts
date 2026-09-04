export function drawHoleNumber(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
) {
  ctx.save();
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(27, 25, 21, 0.85)";
  ctx.fillStyle = "#fff";
  ctx.strokeText(label, x, y);
  ctx.fillText(label, x, y);
  ctx.restore();
}
