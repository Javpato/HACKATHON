import type { Position, PublicIdentity } from '../protocol/types';

export const COLORS = {
  ink: '#234139', forest: '#2e6352', deep: '#244b43', mint: '#b8dbc3',
  grass: '#c4dfaf', grassDark: '#96c292', cream: '#f7f1df', paper: '#fffaf0',
  sand: '#e9d9b9', coral: '#e88d79', peach: '#f3bea5', shadow: '#61816b',
};

export function fill(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color = COLORS.ink, size = 11, align: CanvasTextAlign = 'center'): void {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = align;
  ctx.fillText(label, x, y, 180);
}

export function seed(x: number, y: number): number {
  let n = Math.imul(x + 33421, 1597334677) ^ Math.imul(y + 1699, 3812015801);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

export function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, identity: PublicIdentity, position: Position, isOwn = false): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  fill(ctx, '#56746366', -9, 4, 18, 5);
  fill(ctx, '#38564d', -5, 0, 4, 8);
  fill(ctx, '#38564d', 1, 0, 4, 8);
  fill(ctx, identity.color || COLORS.coral, -8, -15, 16, 16);
  fill(ctx, '#f5d4b4', -6, -23, 12, 10);
  fill(ctx, '#4e4237', -7, -25, 14, 5);
  if (position.direction !== 'up') {
    fill(ctx, '#3d463d', position.direction === 'left' ? -4 : -3, -18, 2, 2);
    fill(ctx, '#3d463d', position.direction === 'right' ? 3 : 2, -18, 2, 2);
  }
  if (isOwn) {
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 2;
    ctx.strokeRect(-10, -27, 20, 37);
  }
  ctx.restore();
  const name = identity.displayName.slice(0, 18);
  ctx.font = '700 10px ui-monospace, monospace';
  const width = Math.min(140, ctx.measureText(name).width + 12);
  fill(ctx, '#fffaf0e8', x - width / 2, y - 45, width, 14);
  text(ctx, name, x, y - 35, COLORS.ink, 10);
}

export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  fill(ctx, '#6b8562', -4, 1, 8, 14);
  fill(ctx, '#2f6b57', -15, -18, 30, 22);
  fill(ctx, '#46866c', -11, -25, 23, 17);
  fill(ctx, '#6fa481', -6, -30, 13, 8);
  fill(ctx, '#d5edbb', -11, -20, 4, 4);
  ctx.restore();
}
