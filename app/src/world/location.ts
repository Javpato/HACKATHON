import type { Member, Position } from '../protocol/types';

export type WorldAreaId = 'residential' | 'community' | 'study';
export const AREA_NAMES: Record<WorldAreaId, string> = {
  residential: 'La aldea', community: 'Plaza Comunitaria', study: 'Biblioteca y Estudio',
};
export function areaOf(position: Position): WorldAreaId { return position.areaId ?? 'residential'; }

/** House membership takes precedence over the outdoor area a visitor came from. */
export function isInScene(member: Member, area: WorldAreaId, houseId: string | null): boolean {
  return member.connected && member.houseId === houseId && (houseId !== null || areaOf(member.position) === area);
}
