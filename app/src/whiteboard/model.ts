import { LIMITS, type BoardPoint, type BoardStroke } from '../protocol/types';

export type BoardTool = BoardStroke['tool'];
export const BOARD_COLORS = ['#315f51', '#df7e6c', '#3d78a2', '#c48b39', '#322f45'] as const;

export function clampBoardPoint(point: BoardPoint): BoardPoint {
  return { x: Math.round(Math.max(25, Math.min(743, point.x))), y: Math.round(Math.max(38, Math.min(397, point.y))) };
}

export function makeStroke(
  boardId: string, author: string, seq: number, tool: BoardTool,
  color: string, width: number, points: readonly BoardPoint[], id: string = crypto.randomUUID(),
): BoardStroke {
  const normalized = points.slice(0, LIMITS.strokePoints).map(clampBoardPoint);
  return {
    id, author, boardId, seq: Math.max(1, Math.floor(seq)), tool,
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : BOARD_COLORS[0],
    width: Math.max(1, Math.min(12, Math.round(width))), points: normalized, deleted: false,
  };
}

export function boardAtCapacity(strokes: readonly BoardStroke[], boardId: string): boolean {
  return strokes.filter((stroke) => stroke.boardId === boardId).length >= LIMITS.boardOperations;
}

export function visibleStrokes(strokes: readonly BoardStroke[], boardId: string, hiddenAuthors: ReadonlySet<string>): BoardStroke[] {
  return strokes.filter((stroke) => stroke.boardId === boardId && !stroke.deleted && !hiddenAuthors.has(stroke.author));
}

export function canDeleteStroke(stroke: BoardStroke, author: string, boardId: string): boolean {
  return stroke.author === author && stroke.boardId === boardId && !stroke.deleted;
}

export function newestOwnStroke(strokes: readonly BoardStroke[], author: string, boardId: string): BoardStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (canDeleteStroke(strokes[i], author, boardId)) return strokes[i];
  }
  return null;
}

export function nextSequence(strokes: readonly BoardStroke[], author: string, boardId: string): number {
  return 1 + strokes.reduce((max, stroke) => stroke.author === author && stroke.boardId === boardId ? Math.max(max, stroke.seq) : max, 0);
}
