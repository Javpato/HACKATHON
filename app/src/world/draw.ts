import { type PublicIdentity, type Position } from '../protocol/types';
import { COLORS, drawAvatar, drawTree, fill, seed, text } from '../ui/art';
import { PARCELS, WORLD_TREES, type OccupiedParcel } from './model';

export interface DrawPerson { identity: PublicIdentity; position: Position; isOwn: boolean }

function drawEmptyParcel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, slot: number): void {
  fill(ctx, '#b9d8a1', x - 9, y - 6, w + 18, h + 18);
  fill(ctx, '#abd09b', x - 7, y - 4, w + 14, h + 14);
  ctx.strokeStyle = '#7eaf83';
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 3, y, w + 6, h + 4);
  ctx.setLineDash([]);
  fill(ctx, '#e8f0cf', x + w / 2 - 23, y + h / 2 - 9, 46, 18);
  text(ctx, `PARCELA ${slot + 1}`, x + w / 2, y + h / 2 + 3, '#537561', 8);
}

function drawHouse(ctx: CanvasRenderingContext2D, item: OccupiedParcel): void {
  const { x, y, w, h, slot } = item.parcel;
  const warm = item.house.theme === 'peach';
  const wall = warm ? '#f9d7b5' : '#e6e9cb';
  const roof = warm ? '#d87e6d' : '#40816b';
  const roofDark = warm ? '#a85c57' : '#2b6257';
  const sign = warm ? '#faeee0' : '#fff9e8';
  fill(ctx, '#8fb98b', x - 9, y + h - 3, w + 18, 19);
  fill(ctx, '#7ca879', x - 6, y + h + 8, w + 12, 5);
  fill(ctx, '#5b816b77', x + 7, y + 14, w - 5, h - 1);
  fill(ctx, wall, x + 7, y + 22, w - 14, h - 20);
  fill(ctx, '#fff5df', x + 12, y + 26, w - 24, 33);
  fill(ctx, roofDark, x, y + 15, w, 14);
  fill(ctx, roof, x + 7, y + 3, w - 14, 20);
  fill(ctx, roofDark, x + 16, y - 3, w - 32, 7);
  for (let i = 0; i < 7; i++) fill(ctx, roofDark, x + 9 + i * 15, y + 17, 10, 4);
  fill(ctx, '#8eb8a4', x + 17, y + 42, 21, 18);
  fill(ctx, '#d0f0d2', x + 19, y + 44, 17, 13);
  fill(ctx, '#6d9f83', x + 27, y + 44, 2, 14);
  fill(ctx, '#8eb8a4', x + w - 38, y + 42, 21, 18);
  fill(ctx, '#d0f0d2', x + w - 36, y + 44, 17, 13);
  fill(ctx, '#6d9f83', x + w - 28, y + 44, 2, 14);
  fill(ctx, '#7e654f', x + w / 2 - 11, y + 52, 22, h - 50);
  fill(ctx, '#b28b66', x + w / 2 - 8, y + 55, 16, h - 53);
  fill(ctx, '#efcc82', x + w / 2 + 4, y + 69, 3, 3);
  fill(ctx, sign, x + 10, y + 29, w - 20, 12);
  text(ctx, item.house.name.slice(0, 20), x + w / 2, y + 38, '#365c4d', 9);
  fill(ctx, '#7c9a76', item.parcel.doorX - 2, slot < 3 ? y + h : y - 9, 4, 12);
  text(ctx, item.isOwn ? 'TU CASA' : item.name.slice(0, 15), x + w / 2, slot < 3 ? y + h + 24 : y - 12, '#3c6354', 9);
}

export function drawWorld(ctx: CanvasRenderingContext2D, occupied: readonly OccupiedParcel[], people: readonly DrawPerson[]): void {
  ctx.imageSmoothingEnabled = false;
  fill(ctx, '#cbe4b5', 0, 0, 768, 432);
  for (let y = 0; y < 432; y += 16) {
    for (let x = 0; x < 768; x += 16) {
      const random = seed(x / 16, y / 16);
      if (random > 0.77) fill(ctx, random > 0.9 ? '#b0d99e' : '#bdddab', x + 3, y + 6, 7, 3);
      if (random < 0.06) {
        fill(ctx, '#f8e8bb', x + 7, y + 7, 3, 3);
        fill(ctx, '#f2a98f', x + 8, y + 5, 2, 2);
      }
    }
  }
  fill(ctx, '#ddcb9d', 0, 190, 768, 54);
  fill(ctx, '#f1dfb6', 0, 196, 768, 42);
  for (let x = 12; x < 768; x += 36) {
    fill(ctx, '#e2cfaa', x, 204 + (x % 3) * 8, 14, 3);
    fill(ctx, '#f9edcf', x + 14, 228, 9, 2);
  }
  for (const parcel of PARCELS) {
    fill(ctx, '#e2d3a8', parcel.doorX - 9, parcel.slot < 3 ? 118 : 244, 18, 72);
    fill(ctx, '#f2e1b5', parcel.doorX - 6, parcel.slot < 3 ? 118 : 244, 12, 72);
    if (!occupied.some((item) => item.parcel.slot === parcel.slot))
      drawEmptyParcel(ctx, parcel.x, parcel.y, parcel.w, parcel.h, parcel.slot);
  }
  for (const tree of WORLD_TREES) drawTree(ctx, tree.x, tree.y);
  for (const item of occupied) drawHouse(ctx, item);
  fill(ctx, '#315f51', 329, 177, 110, 20);
  fill(ctx, '#f7f0d7', 334, 179, 100, 16);
  text(ctx, 'PLAZA CENTRAL', 384, 191, '#315f51', 10);
  for (const person of [...people].sort((a, b) => a.position.y - b.position.y))
    drawAvatar(ctx, person.position.x, person.position.y, person.identity, person.position, person.isOwn);
}
