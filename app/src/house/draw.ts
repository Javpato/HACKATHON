import type { Furniture, PublicHouse } from '../protocol/types';
import { COLORS, drawAvatar, fill, text } from '../ui/art';
import type { DrawPerson } from '../world/draw';
import { furnitureRect } from './model';

function drawFurniture(ctx: CanvasRenderingContext2D, item: Furniture, selected: boolean): void {
  const { x, y, w, h } = furnitureRect(item);
  if (selected) {
    ctx.strokeStyle = '#e6846d';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
    ctx.setLineDash([]);
  }
  switch (item.kind) {
    case 'desk':
      fill(ctx, '#795d47', x + 5, y + 10, w - 10, h - 7);
      fill(ctx, '#b98a64', x, y + 8, w, 11);
      fill(ctx, '#debd8d', x + 3, y + 10, w - 6, 5);
      fill(ctx, '#526d63', x + 13, y + 1, 26, 15);
      fill(ctx, '#a7ddc5', x + 16, y + 3, 20, 9);
      fill(ctx, '#f1e9d1', x + 42, y + 3, 16, 5);
      break;
    case 'bookshelf':
      fill(ctx, '#76573f', x, y, w, h);
      fill(ctx, '#b28b62', x + 4, y + 4, w - 8, h - 8);
      for (let row = 0; row < 3; row++) {
        fill(ctx, '#73583f', x + 5, y + 18 + row * 16, w - 10, 4);
        for (let col = 0; col < 5; col++) fill(ctx, ['#e59a7d', '#6c9c88', '#eed4a4'][((row + col) % 3)], x + 7 + col * 7, y + 5 + row * 16, 5, 12);
      }
      break;
    case 'board':
      fill(ctx, '#6a5242', x, y, w, h);
      fill(ctx, '#fbf7e8', x + 4, y + 3, w - 8, h - 8);
      fill(ctx, '#a5d5bd', x + 9, y + 8, 27, 3);
      fill(ctx, '#e9a68d', x + 9, y + 14, 38, 3);
      fill(ctx, '#6a5242', x + 2, y + h - 5, w - 4, 4);
      break;
    case 'plant':
      fill(ctx, '#a76656', x + 6, y + 13, w - 12, h - 13);
      fill(ctx, '#d88b6a', x + 3, y + 11, w - 6, 5);
      fill(ctx, '#3f8165', x + 12, y, 5, 14);
      fill(ctx, '#5aa77c', x + 5, y + 2, 10, 8);
      fill(ctx, '#79ba86', x + 14, y - 2, 9, 9);
      break;
    case 'table':
      fill(ctx, '#86694b', x + 6, y + 13, w - 12, h - 10);
      fill(ctx, '#c49a6b', x, y + 7, w, 22);
      fill(ctx, '#dfb887', x + 4, y + 9, w - 8, 14);
      fill(ctx, '#fff2d8', x + 17, y + 13, 18, 8);
      break;
    case 'frame':
      fill(ctx, '#7a6049', x, y, w, h);
      fill(ctx, '#f9e3b9', x + 3, y + 3, w - 6, h - 6);
      fill(ctx, '#8fb79f', x + 5, y + 5, w - 10, h - 10);
      fill(ctx, '#f4d7a4', x + 13, y + 7, 6, 6);
      break;
    case 'cabinet':
      fill(ctx, '#6f543e', x, y, w, h);
      fill(ctx, '#ac845e', x + 3, y + 3, w - 6, h - 6);
      fill(ctx, '#ccab79', x + 6, y + 6, w / 2 - 8, h - 12);
      fill(ctx, '#ccab79', x + w / 2 + 2, y + 6, w / 2 - 8, h - 12);
      fill(ctx, '#66513e', x + w / 2 - 5, y + 21, 3, 4);
      fill(ctx, '#66513e', x + w / 2 + 2, y + 21, 3, 4);
  }
  if (item.publicAlias) {
    const label = item.publicAlias.slice(0, 24);
    ctx.font = '700 9px ui-monospace, monospace';
    const width = Math.min(135, ctx.measureText(label).width + 10);
    fill(ctx, '#fffaf0ee', x + w / 2 - width / 2, y + h + 3, width, 14);
    text(ctx, label, x + w / 2, y + h + 13, COLORS.ink, 9);
  }
}

export function drawHouseInterior(ctx: CanvasRenderingContext2D, house: PublicHouse, people: readonly DrawPerson[], selectedId: string | null): void {
  ctx.imageSmoothingEnabled = false;
  const peach = house.theme === 'peach';
  fill(ctx, peach ? '#d8ac93' : '#9ec4a6', 0, 0, 768, 432);
  fill(ctx, peach ? '#f5d8bb' : '#dfebcd', 15, 19, 738, 394);
  fill(ctx, peach ? '#dfb99c' : '#bcd6b8', 28, 71, 712, 335);
  for (let y = 79; y < 400; y += 25) {
    fill(ctx, peach ? '#e5c3a5' : '#c7dec0', 29, y, 710, 2);
    for (let x = 48 + ((y / 25) % 2) * 20; x < 735; x += 40)
      fill(ctx, peach ? '#cda98e' : '#afcfae', x, y + 1, 2, 24);
  }
  fill(ctx, peach ? '#f6e2ca' : '#eef2d7', 28, 27, 712, 45);
  fill(ctx, peach ? '#c98b74' : '#6a9d86', 28, 67, 712, 7);
  for (const x of [85, 630]) {
    fill(ctx, '#6b8f81', x, 32, 53, 30);
    fill(ctx, '#c9eadb', x + 4, 35, 45, 22);
    fill(ctx, '#a2ceb8', x + 25, 35, 3, 22);
    fill(ctx, '#a2ceb8', x + 4, 44, 45, 3);
  }
  fill(ctx, '#e7bb96', 286, 219, 196, 104);
  fill(ctx, '#f2d2ac', 296, 227, 176, 88);
  for (let y = 240; y < 304; y += 16) fill(ctx, '#f5dcbb', 309, y, 150, 3);
  fill(ctx, '#775e49', 344, 401, 80, 13);
  fill(ctx, '#e9caa1', 349, 403, 70, 11);
  fill(ctx, '#e8e2cc', 375, 384, 18, 20);
  fill(ctx, '#405d52', 303, 30, 162, 29);
  fill(ctx, '#fdf5dd', 307, 34, 154, 21);
  text(ctx, house.name.slice(0, 28), 384, 49, '#2d5c4c', 12);
  for (const item of house.furniture) drawFurniture(ctx, item, item.id === selectedId);
  for (const person of [...people].sort((a, b) => a.position.y - b.position.y))
    drawAvatar(ctx, person.position.x, person.position.y, person.identity, person.position, person.isOwn);
}
