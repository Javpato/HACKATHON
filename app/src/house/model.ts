import { LIMITS, type Furniture, type FurnitureKind, type Position, type PublicHouse } from '../protocol/types';
import { type Rect, stepPosition } from '../world/model';

export const HOUSE_SPAWN: Position = { x: 384, y: 344, direction: 'up', moving: false };
export const HOUSE_BOUNDS: Rect = { x: 28, y: 72, w: 712, h: 334 };

/** The doorway at the bottom of every room, on the doormat. */
export const HOUSE_DOOR = { x: 384, y: 396 } as const;
const DOOR_REACH = 40;

/**
 * Whether the character is standing at the doorway. Leaving with E is only
 * allowed here, so a stray keypress in the middle of the room no longer ejects
 * the player to the village. Spawn (384,344) is deliberately out of reach.
 */
export function atHouseDoor(position: Position): boolean {
  return Math.abs(position.x - HOUSE_DOOR.x) <= DOOR_REACH && HOUSE_DOOR.y - position.y <= DOOR_REACH;
}
export const FURNITURE_KINDS: readonly FurnitureKind[] = ['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet'];
export const FURNITURE_LABELS: Record<FurnitureKind, string> = {
  desk: 'Escritorio', bookshelf: 'Librería', board: 'Pizarra', plant: 'Planta',
  table: 'Mesa', frame: 'Cuadro', cabinet: 'Armario',
};

export function furnitureRect(item: Furniture): Rect {
  const size: Record<FurnitureKind, [number, number]> = {
    desk: [69, 39], bookshelf: [45, 60], board: [66, 28], plant: [27, 27],
    table: [58, 42], frame: [34, 22], cabinet: [48, 45],
  };
  const [w, h] = size[item.kind];
  return { x: item.x, y: item.y, w, h };
}

export function clampFurniture(item: Furniture, x: number, y: number): Furniture {
  const rect = furnitureRect(item);
  return {
    ...item,
    x: Math.round(Math.max(HOUSE_BOUNDS.x, Math.min(LIMITS.worldWidth - 32, HOUSE_BOUNDS.x + HOUSE_BOUNDS.w - rect.w, x))),
    y: Math.round(Math.max(HOUSE_BOUNDS.y, Math.min(LIMITS.worldHeight - 32, HOUSE_BOUNDS.y + HOUSE_BOUNDS.h - rect.h, y))),
  };
}

export function canEditHouse(house: PublicHouse, fingerprint: string): boolean {
  return house.ownerId === fingerprint;
}

export function moveFurniture(house: PublicHouse, id: string, x: number, y: number, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const furniture = house.furniture.map((item) => item.id === id ? clampFurniture(item, x, y) : item);
  if (furniture.every((item, index) => item === house.furniture[index]
    || (item.x === house.furniture[index].x && item.y === house.furniture[index].y))) return house;
  return { ...house, revision: house.revision + 1, furniture };
}

export function addFurniture(house: PublicHouse, kind: FurnitureKind, fingerprint: string, id: string): PublicHouse {
  if (!canEditHouse(house, fingerprint) || house.furniture.length >= LIMITS.furniture || house.furniture.some((item) => item.id === id)) return house;
  const step = house.furniture.length % 5;
  const item: Furniture = { id, kind, x: 105 + step * 92, y: 145 + Math.floor(house.furniture.length / 5) * 48, publicAlias: '' };
  return { ...house, revision: house.revision + 1, furniture: [...house.furniture, clampFurniture(item, item.x, item.y)] };
}

export function deleteFurniture(house: PublicHouse, id: string, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const furniture = house.furniture.filter((item) => item.id !== id);
  return furniture.length === house.furniture.length ? house : { ...house, revision: house.revision + 1, furniture };
}

export function setFurnitureAlias(house: PublicHouse, id: string, alias: string, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const safeAlias = alias.trim().slice(0, 40);
  const furniture = house.furniture.map((item) => item.id === id ? { ...item, publicAlias: safeAlias } : item);
  return furniture.some((item, index) => item.publicAlias !== house.furniture[index].publicAlias)
    ? { ...house, revision: house.revision + 1, furniture }
    : house;
}

export function houseObstacles(house: PublicHouse): Rect[] {
  return house.furniture.filter((item) => item.kind !== 'frame' && item.kind !== 'board')
    .map((item) => furnitureRect(item));
}

export function stepHousePosition(from: Position, vector: { x: number; y: number }, dt: number, house: PublicHouse): Position {
  return stepPosition(from, vector, dt, houseObstacles(house), HOUSE_BOUNDS, 105);
}

export function hitFurniture(house: PublicHouse, x: number, y: number): Furniture | null {
  for (let i = house.furniture.length - 1; i >= 0; i--) {
    const item = house.furniture[i];
    const rect = furnitureRect(item);
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return item;
  }
  return null;
}
