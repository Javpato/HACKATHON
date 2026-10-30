import type { BoardPoint, BoardStroke } from '../protocol/types';
import { COLORS, fill, text } from '../ui/art';

function pathStroke(ctx: CanvasRenderingContext2D, stroke: BoardStroke): void {
  if (!stroke.points.length) return;
  const start = stroke.points[0];
  const end = stroke.points[stroke.points.length - 1];
  ctx.beginPath();
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  if (stroke.tool === 'pen') {
    ctx.moveTo(start.x, start.y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (stroke.points.length === 1) ctx.lineTo(start.x + 0.1, start.y + 0.1);
  } else if (stroke.tool === 'line') {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  } else {
    ctx.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(start.x - end.x), Math.abs(start.y - end.y));
  }
  ctx.stroke();
}

export function drawBoard(ctx: CanvasRenderingContext2D, strokes: readonly BoardStroke[], draft: { points: readonly BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number } | null = null): void {
  ctx.imageSmoothingEnabled = false;
  fill(ctx, '#e8dcc2', 0, 0, 768, 432);
  fill(ctx, '#715b48', 14, 20, 740, 391);
  fill(ctx, '#fffdf5', 22, 27, 724, 371);
  for (let x = 40; x < 744; x += 24) for (let y = 45; y < 397; y += 24) fill(ctx, '#e5e8d7', x, y, 2, 2);
  for (const stroke of strokes) if (!stroke.deleted) pathStroke(ctx, stroke);
  if (draft?.points.length) pathStroke(ctx, {
    id: '', author: '', boardId: '', seq: 0, deleted: false,
    points: [...draft.points], tool: draft.tool, color: draft.color, width: draft.width,
  });
  fill(ctx, '#b38a64', 14, 398, 740, 13);
  fill(ctx, '#f2d7a9', 605, 401, 60, 5);
  fill(ctx, '#e88d79', 676, 400, 28, 7);
  text(ctx, 'STUDYVILLAGE · PIZARRA', 35, 18, COLORS.ink, 9, 'left');
}
