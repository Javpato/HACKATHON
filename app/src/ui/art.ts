import { getAvatarSheet } from '../assets/avatar-sheet';
import type { Position, PublicIdentity } from '../protocol/types';

/**
 * Shared pixel-art toolkit. See docs/VISUAL_DESIGN.md for the rules this
 * encodes: one art pixel equals two logical units, and light always comes
 * from the top-left.
 */

export const PALETTE = {
  moss: ['#24402f', '#2f5a3e', '#3f7a4f', '#58a05f', '#7cc077', '#a6dc98'],
  earth: ['#5a4028', '#7a5739', '#9c7349', '#c09a64', '#e0c08a'],
  ember: ['#8c3f2c', '#c25f3c', '#e8884f', '#f6b265', '#ffd79a'],
  tide: ['#1f4a4e', '#2f6f73', '#47989b', '#74c0bd'],
  paper: ['#1e3730', '#3c5a4c', '#f2e7cd', '#fbf4e2', '#fffdf5'],
} as const;

/** Original key names kept so existing imports keep compiling. */
export const COLORS = {
  ink: '#1e3730', forest: '#2f5a3e', deep: '#24402f', mint: '#74c0bd',
  grass: '#58a05f', grassDark: '#2f5a3e', cream: '#f2e7cd', paper: '#fbf4e2',
  sand: '#e0c08a', coral: '#c25f3c', peach: '#f6b265', shadow: '#24402f',
};

import { getAvatarCustomization } from '../assets/custom-assets';

export const UNIT = 1;

/** Snap to the virtual pixel grid so every edge lands on a sharp boundary. */
export function ipx(value: number): number {
  return Math.round(value / UNIT) * UNIT;
}

export function fill(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(ipx(x), ipx(y), Math.max(UNIT, ipx(w)), Math.max(UNIT, ipx(h)));
}

/** Unsnapped fill, for sub-pixel work like soft gradients and glow pools. */
export function fillRaw(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color = COLORS.ink, size = 11, align: CanvasTextAlign = 'center'): void {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(label, x, y, 200);
}

export function seed(x: number, y: number): number {
  let n = Math.imul(x + 33421, 1597334677) ^ Math.imul(y + 1699, 3812015801);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

/** Stable 0..1 hash from a string, used to desynchronise per-character motion. */
export function hash01(value: string): number {
  let n = 2166136261;
  for (let i = 0; i < value.length; i += 1) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return ((n >>> 0) % 10000) / 10000;
}

/**
 * Whether the viewer asked for reduced motion. Decorative canvas animation
 * (sway, drifting motes, flicker, smoke) is suppressed when this is true, to
 * match the CSS media query. Character walk cycles are kept: they convey
 * state rather than decoration.
 */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Soft elliptical contact shadow. Cheap: stacked rects, no shadowBlur. */
export function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, strength = 0.26): void {
  for (let i = 3; i >= 1; i -= 1) {
    const r = radius * (i / 3);
    ctx.fillStyle = `rgba(26,48,38,${(strength * (4 - i)) / 6})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, Math.max(1.4, r * 0.42), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Warm pool of light on the ground, for lamps and windows.
 * The gradient is rasterised once per tint into a small sprite and then blitted
 * scaled. Building a fresh radial gradient on every call cost a dropped frame
 * roughly every twenty, because a busy scene issues a dozen of these per frame.
 */
const GLOW_SIZE = 128;
const glowSprites = new Map<string, HTMLCanvasElement>();

function glowSprite(tint: string): HTMLCanvasElement | null {
  const cached = glowSprites.get(tint);
  if (cached) return cached;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = GLOW_SIZE;
  canvas.height = GLOW_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const r = GLOW_SIZE / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, `rgba(${tint},0.30)`);
  gradient.addColorStop(0.55, `rgba(${tint},0.12)`);
  gradient.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  glowSprites.set(tint, canvas);
  return canvas;
}

export function glowPool(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, tint = '255,196,110'): void {
  const sprite = glowSprite(tint);
  if (sprite) {
    ctx.drawImage(sprite, x - radius, y - radius * 0.5, radius * 2, radius);
    return;
  }
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${tint},0.30)`);
  gradient.addColorStop(0.55, `rgba(${tint},0.12)`);
  gradient.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Chamfered pixel plate used for signs and name plates. */
export function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, face: string, edge: string): void {
  fill(ctx, edge, x, y + 2, w, h - 4);
  fill(ctx, edge, x + 2, y, w - 4, h);
  fill(ctx, face, x + 2, y + 2, w - 4, h - 6);
  fill(ctx, face, x + 4, y + 2, w - 8, h - 4);
}

// ---------------------------------------------------------------------------
// Per-character animation state. Presentation only: it never feeds back into
// movement, collision or networking, it only decides what gets painted.
// ---------------------------------------------------------------------------

interface CharacterAnim {
  walk: number;
  idle: number;
  renderX: number;
  renderY: number;
  lastSeen: number;
  facing: Position['direction'];
  turn: number;
  sceneId?: string;
}

const anims = new Map<string, CharacterAnim>();
let frameClock = 0;

/** Advance all character animation by dt seconds. Called once per frame. */
export function advanceAnim(dt: number): void {
  frameClock += dt;
  for (const [key, state] of anims) {
    if (frameClock - state.lastSeen > 5) anims.delete(key);
  }
}

export function animClock(): number {
  return frameClock;
}

function animFor(id: string, position: Position): CharacterAnim {
  let state = anims.get(id);
  if (!state) {
    state = {
      walk: hash01(id) * 10,
      idle: hash01(id) * 6,
      renderX: position.x,
      renderY: position.y,
      lastSeen: frameClock,
      facing: position.direction,
      turn: 1,
    };
    anims.set(id, state);
  }
  return state;
}

/**
 * Update the drawn position for one character.
 * `smooth` interpolates toward the authoritative position, which is what
 * remote peers need because their updates arrive at roughly 12 Hz. The local
 * character passes smooth=false so input stays immediate.
 */
export function trackCharacter(id: string, position: Position, dt: number, smooth: boolean, sceneId = 'residential'): { x: number; y: number } {
  const state = animFor(id, position);
  state.lastSeen = frameClock;
  if (state.sceneId !== sceneId) { state.renderX = position.x; state.renderY = position.y; state.sceneId = sceneId; }

  if (smooth) {
    const blend = 1 - Math.pow(0.0015, dt);
    state.renderX += (position.x - state.renderX) * blend;
    state.renderY += (position.y - state.renderY) * blend;
    if (Math.hypot(position.x - state.renderX, position.y - state.renderY) > 96) {
      state.renderX = position.x;
      state.renderY = position.y;
    }
  } else {
    state.renderX = position.x;
    state.renderY = position.y;
  }

  if (position.direction !== state.facing) {
    state.facing = position.direction;
    state.turn = 0;
  }
  state.turn = Math.min(1, state.turn + dt * 9);

  if (position.moving) {
    state.walk += dt * 9.2;
    state.idle = 0;
  } else {
    // Ease the stride back to a neutral stance instead of freezing mid-step.
    const rest = Math.round(state.walk / Math.PI) * Math.PI;
    state.walk += (rest - state.walk) * Math.min(1, dt * 12);
    state.idle += dt;
  }
  return { x: state.renderX, y: state.renderY };
}

/**
 * Scene-change fade. The stage canvas is reused when moving between the
 * village and a house, so no CSS animation retriggers; this gives that switch
 * the same sense of travel without touching the view logic that owns the pane.
 * Returns progress from 0 to 1, where 1 means the transition has finished.
 */
const SCENE_MS = 300;
let sceneKey = '';
let sceneStart = -1;

export function sceneProgress(key: string): number {
  if (key !== sceneKey) {
    sceneKey = key;
    sceneStart = frameClock;
  }
  if (sceneStart < 0) return 1;
  if (reducedMotion()) return 1;
  return Math.min(1, (frameClock - sceneStart) / (SCENE_MS / 1000));
}

/** Paints the fade for a scene change. A no-op once the transition is done. */
export function paintSceneFade(ctx: CanvasRenderingContext2D, key: string, w: number, h: number, tint = '14,26,20'): void {
  const t = sceneProgress(key);
  if (t >= 1) return;
  // Ease-out so the scene is legible almost immediately and the tail is gentle.
  const alpha = Math.pow(1 - t, 2.2);
  ctx.fillStyle = `rgba(${tint},${alpha.toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
}

const SKIN = ['#8c5a3c', '#c98f63', '#f0c69a'];
const HAIR = ['#2a2018', '#3f3124', '#5a4530'];

/** Slightly shift a hex colour's brightness, for deriving shade/tint pairs. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, identity: PublicIdentity, position: Position, isOwn = false): void {
  const id = identity.fingerprint || identity.displayName;
  const state = anims.get(id);
  const custom = isOwn ? getAvatarCustomization() : null;
  const tone = hash01(id + 'skin');
  const skin = custom?.skinTone || SKIN[Math.floor(tone * SKIN.length) % SKIN.length];
  const hair = custom?.hairColor || HAIR[Math.floor(hash01(id + 'hair') * HAIR.length) % HAIR.length];
  const hairStyle = custom?.hairStyle || 'short';
  const accessory = custom?.accessory || 'none';
  const shirt = identity.color || COLORS.coral;
  const shirtLit = shade(shirt, 26);
  const shirtDark = shade(shirt, -42);

  const walk = state ? state.walk : 0;
  const idle = state ? state.idle : 0;
  const moving = position.moving;

  // Vertical bob: a short hop on each stride, or a slow breath when still.
  // The idle breath is decorative, so it stops under reduced motion; the
  // stride hop stays, because it communicates that the character is walking.
  const stride = Math.sin(walk);
  const breath = reducedMotion() ? 0 : Math.sin(idle * 1.9) * 0.7;
  const bob = moving ? -Math.abs(Math.sin(walk)) * 2 : breath;
  const squash = moving ? Math.abs(Math.cos(walk)) * 0.8 : 0;
  const facing = position.direction;

  const baseY = Math.round(y);
  contactShadow(ctx, Math.round(x), baseY + 5, 10 + squash, 0.32);

  ctx.save();
  ctx.translate(Math.round(x), baseY + Math.round(bob));
  // Slightly larger than the 9px collision radius so the character reads at
  // a glance. Presentation only: collision and movement are untouched.
  ctx.scale(1.16, 1.16);

  const avatarSheet = isOwn ? getAvatarSheet() : null;
  if (avatarSheet) {
    const row = { down: 0, left: 1, right: 2, up: 3 }[facing];
    const col = moving ? Math.floor(walk * 2) % 3 : 1;
    const sw = avatarSheet.naturalWidth / 3;
    const sh = avatarSheet.naturalHeight / 4;
    ctx.drawImage(avatarSheet, col * sw, row * sh, sw, sh, -14, -30, 28, 38);
  } else {
  // Legs swing in opposition; when idle they stand together.
  const swing = moving ? Math.round(stride * 2.4) : 0;
  if (facing === 'left' || facing === 'right') {
    const lead = facing === 'right' ? 1 : -1;
    fill(ctx, '#2c4238', -4 + swing * lead, 0, 4, 8 - Math.abs(swing) / 2);
    fill(ctx, '#38564d', 0 - swing * lead, 0, 4, 8 - Math.abs(swing) / 2);
  } else {
    fill(ctx, '#2c4238', -5, 0, 4, 8 - Math.abs(swing));
    fill(ctx, '#38564d', 1, 0, 4, 8 - Math.abs(swing));
  }

  // Torso with a lit top-left face and a shaded bottom-right edge.
  const torsoY = -15 - Math.round(squash);
  fill(ctx, shirtDark, -8, torsoY, 16, 16);
  fill(ctx, shirt, -8, torsoY, 14, 14);
  fill(ctx, shirtLit, -8, torsoY, 10, 4);

  // Arms track the opposite phase of the legs.
  if (facing === 'left' || facing === 'right') {
    const lead = facing === 'right' ? 1 : -1;
    fill(ctx, shirtDark, (facing === 'right' ? 5 : -9), torsoY + 3 - swing * lead, 4, 9);
  } else {
    fill(ctx, shirtDark, -11, torsoY + 3 + swing, 4, 9);
    fill(ctx, shirtDark, 7, torsoY + 3 - swing, 4, 9);
  }

  // Head, hair and a simple face.
  const headY = torsoY - 10;
  fill(ctx, shade(skin, -40), -7, headY, 14, 12);
  fill(ctx, skin, -7, headY, 12, 11);
  fill(ctx, shade(skin, 18), -7, headY + 2, 4, 5);
  if (facing === 'up') {
    // Facing away: the back of the head is all hair.
    fill(ctx, hair, -7, headY - 2, 14, hairStyle === 'long' ? 15 : 12);
    fill(ctx, shade(hair, 18), -7, headY - 2, 14, 3);
  } else {
    fill(ctx, hair, -8, headY - 3, 15, 6);
    fill(ctx, shade(hair, 16), -8, headY - 3, 15, 2);
    if (hairStyle === 'spiky') {
      fill(ctx, hair, -7, headY - 6, 3, 3);
      fill(ctx, hair, -2, headY - 7, 4, 4);
      fill(ctx, hair, 3, headY - 6, 3, 3);
    } else if (hairStyle === 'curly') {
      fill(ctx, hair, -9, headY - 4, 17, 6);
      fill(ctx, shade(hair, 20), -8, headY - 5, 5, 3);
      fill(ctx, shade(hair, 20), 1, headY - 5, 5, 3);
    } else if (hairStyle === 'beanie') {
      fill(ctx, '#c9604a', -8, headY - 5, 16, 6);
      fill(ctx, '#e2886f', -8, headY - 2, 16, 2);
      fill(ctx, '#f4efdd', -2, headY - 7, 4, 2);
    }
    if (facing === 'down') {
      const sideLen = hairStyle === 'long' ? 13 : 9;
      fill(ctx, hair, -8, headY - 3, 3, sideLen);
      fill(ctx, hair, 4, headY - 3, 3, sideLen);
      fill(ctx, '#2b2b26', -4, headY + 5, 2, 2);
      fill(ctx, '#2b2b26', 2, headY + 5, 2, 2);
      fill(ctx, shade(skin, -30), -1, headY + 8, 3, 1);
    } else if (facing === 'left') {
      fill(ctx, hair, -8, headY - 3, 4, hairStyle === 'long' ? 13 : 10);
      fill(ctx, '#2b2b26', -4, headY + 5, 2, 2);
    } else {
      fill(ctx, hair, 3, headY - 3, 4, hairStyle === 'long' ? 13 : 10);
      fill(ctx, '#2b2b26', 2, headY + 5, 2, 2);
    }
  }

  // Optional accessories
  if (accessory === 'glasses' && facing !== 'up') {
    fill(ctx, '#1e3028', -5, headY + 4, 4, 3);
    fill(ctx, '#1e3028', 1, headY + 4, 4, 3);
    fill(ctx, '#9cc8d2', -4, headY + 5, 2, 1);
    fill(ctx, '#9cc8d2', 2, headY + 5, 2, 1);
    fill(ctx, '#1e3028', -1, headY + 5, 2, 1);
  } else if (accessory === 'headphones') {
    fill(ctx, '#2d4b3e', -9, headY - 4, 18, 2);
    fill(ctx, '#cf6f3c', -10, headY + 1, 3, 6);
    fill(ctx, '#cf6f3c', 7, headY + 1, 3, 6);
  } else if (accessory === 'hat') {
    fill(ctx, '#5a3e28', -10, headY - 3, 20, 2);
    fill(ctx, '#7a563a', -7, headY - 7, 14, 4);
    fill(ctx, '#cf6f3c', -7, headY - 4, 14, 1);
  }

  }
  if (isOwn) {
    // A soft arc under the owner instead of a hard selection box.
    ctx.strokeStyle = 'rgba(255,240,200,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 7 - Math.round(bob), 11, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const name = identity.displayName.slice(0, 18);
  ctx.font = '700 9.5px Inter, ui-sans-serif, system-ui, sans-serif';
  const width = Math.min(145, Math.ceil(ctx.measureText(name).width) + 18);
  const plateY = baseY - 44;
  plate(ctx, x - width / 2, plateY, width, 15, 'rgba(251,244,226,0.96)', 'rgba(30,55,48,0.55)');
  fill(ctx, shirt, x - width / 2 + 5, plateY + 5, 5, 5);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(name, Math.round(x - width / 2 + 13), plateY + 11);
  ctx.textAlign = 'center';
}

/**
 * Leafy tree. The trunk sits on the 22x25 collision footprint from
 * world/model.ts; the canopy is allowed to overhang it, as real foliage does.
 * `variant` picks one of three silhouettes so a row of trees is not a stamp.
 */
export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, sway = 0, variant = 0): void {
  const [d0, d1, d2, d3, d4, d5] = PALETTE.moss;
  contactShadow(ctx, x, y + 10, 14 * scale, 0.36);
  ctx.save();
  ctx.translate(ipx(x), ipx(y));
  ctx.scale(scale, scale);

  fill(ctx, PALETTE.earth[0], -4, -4, 9, 16);
  fill(ctx, PALETTE.earth[1], -4, -4, 5, 16);
  fill(ctx, PALETTE.earth[2], -4, -4, 2, 13);
  fill(ctx, d0, -7, 8, 14, 4);

  ctx.translate(Math.round(sway), 0);
  if (variant === 1) {
    // Tall and narrow.
    fill(ctx, d0, -12, -30, 24, 30);
    fill(ctx, d1, -12, -33, 22, 29);
    fill(ctx, d2, -10, -38, 18, 27);
    fill(ctx, d3, -9, -41, 15, 19);
    fill(ctx, d4, -7, -42, 10, 10);
    fill(ctx, d5, -6, -41, 5, 4);
  } else if (variant === 2) {
    // Low and broad.
    fill(ctx, d0, -18, -20, 36, 22);
    fill(ctx, d1, -18, -23, 33, 21);
    fill(ctx, d2, -15, -27, 27, 20);
    fill(ctx, d3, -13, -29, 21, 15);
    fill(ctx, d4, -11, -30, 13, 9);
    fill(ctx, d5, -10, -29, 6, 4);
    fill(ctx, d1, 9, -15, 7, 9);
  } else {
    fill(ctx, d0, -15, -25, 31, 26);
    fill(ctx, d1, -15, -28, 28, 25);
    fill(ctx, d2, -13, -32, 23, 23);
    fill(ctx, d3, -12, -35, 19, 18);
    fill(ctx, d4, -10, -36, 13, 10);
    fill(ctx, d5, -9, -35, 6, 4);
    fill(ctx, d1, 7, -18, 7, 9);
  }
  fill(ctx, d0, -13, -7, 9, 7);
  ctx.restore();
}

/**
 * Small key prompt that floats above the character when an action is
 * available, such as "E · Entrar" at a door. It tells the player the key
 * works here, which matters now that E only acts at doorways.
 */
export function drawPrompt(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  const bob = reducedMotion() ? 0 : Math.round(Math.sin(frameClock * 4) * 1.5);
  ctx.font = '700 9.5px Inter, ui-sans-serif, system-ui, sans-serif';
  const w = Math.ceil(ctx.measureText(label).width) + 16;
  const px = Math.round(x - w / 2);
  const py = Math.round(y) + bob;
  plate(ctx, px, py, w, 16, 'rgba(255,215,154,0.97)', 'rgba(90,64,40,0.85)');
  fill(ctx, 'rgba(90,64,40,0.85)', x - 2, py + 15, 4, 3);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.paper[0];
  ctx.fillText(label, Math.round(x), py + 12);
}
