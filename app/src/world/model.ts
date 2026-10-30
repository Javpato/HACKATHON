import { LIMITS, type AppView, type Position, type PublicHouse } from '../protocol/types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Parcel extends Rect { slot: number; doorX: number; doorY: number }
export interface OccupiedParcel { parcel: Parcel; house: PublicHouse; name: string; ownerId: string; isOwn: boolean }

export const PARCELS: readonly Parcel[] = [
  { slot: 0, x: 47, y: 34, w: 114, h: 83, doorX: 104, doorY: 117 },
  { slot: 1, x: 327, y: 34, w: 114, h: 83, doorX: 384, doorY: 117 },
  { slot: 2, x: 607, y: 34, w: 114, h: 83, doorX: 664, doorY: 117 },
  { slot: 3, x: 47, y: 293, w: 114, h: 83, doorX: 104, doorY: 293 },
  { slot: 4, x: 327, y: 293, w: 114, h: 83, doorX: 384, doorY: 293 },
  { slot: 5, x: 607, y: 293, w: 114, h: 83, doorX: 664, doorY: 293 },
];

export const WORLD_SPAWN: Position = { x: 384, y: 215, direction: 'down', moving: false };
export const WORLD_TREES = [
  { x: 13, y: 157 }, { x: 183, y: 156 }, { x: 294, y: 157 },
  { x: 462, y: 155 }, { x: 574, y: 157 }, { x: 750, y: 158 },
  { x: 15, y: 275 }, { x: 186, y: 275 }, { x: 295, y: 275 },
  { x: 460, y: 275 }, { x: 574, y: 275 }, { x: 750, y: 275 },
] as const;

export function occupiedParcels(view: AppView): OccupiedParcel[] {
  const { network, identity, ownHouse } = view;
  const byOwner = new Map(network.houses.map((house) => [house.ownerId, house]));
  byOwner.set(identity.fingerprint, ownHouse);
  const members = network.members.filter((member) => member.connected);
  const slots = members.length
    ? members.map((member) => ({ ownerId: member.identity.fingerprint, slot: member.slot, name: member.identity.displayName }))
    : [{ ownerId: identity.fingerprint, slot: 0, name: identity.displayName }];
  if (!slots.some((member) => member.ownerId === identity.fingerprint)) {
    slots.push({ ownerId: identity.fingerprint, slot: 0, name: identity.displayName });
  }
  const usedSlots = new Set<number>();
  return slots.flatMap(({ ownerId, slot, name }) => {
    const parcel = PARCELS[slot];
    const house = byOwner.get(ownerId);
    if (!parcel || !house || usedSlots.has(slot)) return [];
    usedSlots.add(slot);
    return [{ parcel, house, name, ownerId, isOwn: ownerId === identity.fingerprint }];
  });
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function circleHitsRect(x: number, y: number, radius: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2;
}

export function stepPosition(
  from: Position,
  vector: { x: number; y: number },
  dtSeconds: number,
  obstacles: readonly Rect[],
  bounds: Rect = { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
  speed = 110,
): Position {
  const xDir = Math.sign(vector.x);
  const yDir = Math.sign(vector.y);
  const moving = xDir !== 0 || yDir !== 0;
  if (!moving) return { ...from, moving: false };
  const direction: Position['direction'] = Math.abs(vector.x) >= Math.abs(vector.y)
    ? (xDir < 0 ? 'left' : 'right')
    : (yDir < 0 ? 'up' : 'down');
  const dt = Math.max(0, Math.min(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0.05));
  const length = Math.hypot(vector.x, vector.y) || 1;
  const radius = 9;
  const inside = (x: number, y: number) => x >= bounds.x + radius && x <= bounds.x + bounds.w - radius
    && y >= bounds.y + radius && y <= bounds.y + bounds.h - radius
    && !obstacles.some((rect) => circleHitsRect(x, y, radius, rect));
  let x = from.x;
  let y = from.y;
  const nextX = x + vector.x / length * speed * dt;
  if (inside(nextX, y)) x = nextX;
  const nextY = y + vector.y / length * speed * dt;
  if (inside(x, nextY)) y = nextY;
  return { x, y, direction, moving: x !== from.x || y !== from.y };
}

export function worldObstacles(occupied: readonly OccupiedParcel[]): Rect[] {
  return [
    ...occupied.map(({ parcel }) => ({ x: parcel.x - 2, y: parcel.y - 6, w: parcel.w + 4, h: parcel.h + 5 })),
    ...WORLD_TREES.map(({ x, y }) => ({ x: x - 11, y: y - 16, w: 22, h: 25 })),
  ];
}

export function closestDoor(position: Position, occupied: readonly OccupiedParcel[], maxDistance = 32): OccupiedParcel | null {
  let closest: OccupiedParcel | null = null;
  let distance = maxDistance;
  for (const item of occupied) {
    const next = Math.hypot(item.parcel.doorX - position.x, item.parcel.doorY - position.y);
    if (next < distance) { closest = item; distance = next; }
  }
  return closest;
}
