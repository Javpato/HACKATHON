import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/protocol/types';
import { boardAtCapacity, canDeleteStroke, makeStroke, newestOwnStroke, nextSequence, visibleStrokes } from '../src/whiteboard/model';

const stroke = (author: string, boardId = 'room', seq = 1, id = `${author}-${seq}`) =>
  makeStroke(boardId, author, seq, 'pen', '#e88d79', 4, [{ x: -100, y: 500 }, { x: 100, y: 200 }], id);

describe('whiteboard layers', () => {
  it('allows author-only undo and local author visibility', () => {
    const own = stroke('own');
    const other = stroke('other');
    expect(canDeleteStroke(own, 'own', 'room')).toBe(true);
    expect(canDeleteStroke(other, 'own', 'room')).toBe(false);
    expect(newestOwnStroke([own, other], 'own', 'room')).toBe(own);
    expect(visibleStrokes([own, other], 'room', new Set(['other']))).toEqual([own]);
    expect(other.deleted).toBe(false);
  });

  it('caps points, coordinates, width and board operations', () => {
    const points = Array.from({ length: LIMITS.strokePoints + 10 }, () => ({ x: -1, y: 999 }));
    const normalized = makeStroke('room', 'own', 1, 'pen', '#123456', 100, points, 'bounded');
    expect(normalized.points).toHaveLength(LIMITS.strokePoints);
    expect(normalized.points[0]).toEqual({ x: 25, y: 397 });
    expect(normalized.width).toBe(12);
    expect(normalized.color).toBe('#123456');
    expect(boardAtCapacity(Array(LIMITS.boardOperations).fill(normalized), 'room')).toBe(true);
  });

  it('keeps author sequence within its board', () => {
    expect(nextSequence([stroke('own', 'room', 2), stroke('other', 'room', 20), stroke('own', 'elsewhere', 80)], 'own', 'room')).toBe(3);
  });
});
