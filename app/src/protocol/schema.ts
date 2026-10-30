import { z } from 'zod';
import { LIMITS } from './types';

export const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const endpointSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const nonce = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const identitySchema = z.strictObject({
  fingerprint: fingerprintSchema, publicKey: z.string().min(100).max(256),
  displayName: z.string().trim().min(1).max(40), color,
});
export const positionSchema = z.strictObject({
  x: z.number().min(0).max(LIMITS.worldWidth), y: z.number().min(0).max(LIMITS.worldHeight),
  direction: z.enum(['up', 'down', 'left', 'right']), moving: z.boolean(),
});
export const houseSchema = z.strictObject({
  ownerId: fingerprintSchema, revision: integer, name: z.string().trim().min(1).max(60),
  access: z.enum(['open', 'ask', 'locked']), theme: z.enum(['mint', 'peach']),
  furniture: z.array(z.strictObject({
    id: idSchema, kind: z.enum(['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet']),
    x: z.number().min(0).max(736), y: z.number().min(0).max(400), publicAlias: z.string().max(60),
  })).max(LIMITS.furniture),
}).refine(house => new Set(house.furniture.map(item => item.id)).size === house.furniture.length);
export const memberSchema = z.strictObject({
  identity: identitySchema, endpoint: endpointSchema, slot: z.number().int().min(0).max(5),
  connected: z.boolean(), houseId: fingerprintSchema.nullable(), position: positionSchema,
});
const boardCoordinate = z.number().min(-LIMITS.boardExtent).max(LIMITS.boardExtent);
export const strokeSchema = z.strictObject({
  id: idSchema, author: fingerprintSchema, boardId: fingerprintSchema, seq: integer,
  color, width: z.number().min(1).max(32), tool: z.enum(['pen', 'line', 'rectangle', 'text']),
  points: z.array(z.strictObject({ x: boardCoordinate, y: boardCoordinate })).min(1).max(LIMITS.strokePoints),
  deleted: z.boolean(),
  // Only text notes carry text, and every text note must carry some.
  text: z.string().min(1).max(LIMITS.boardText).optional(),
}).refine((stroke) => (stroke.tool === 'text') === (stroke.text !== undefined), { message: 'text belongs to text notes only' });
const signature = z.string().regex(/^[A-Za-z0-9_-]{86}$/);
export const signedHouseSchema = z.strictObject({ house: houseSchema, signature });
export const signedStrokeSchema = z.strictObject({ stroke: strokeSchema, signature });
export const inviteSchema = z.strictObject({
  v: z.literal(1), sessionId: idSchema, epoch: integer.min(1), hostFingerprint: fingerprintSchema,
  endpoint: endpointSchema, generation: integer.min(1), secret: nonce, expiresAt: integer,
});
export type Invite = z.infer<typeof inviteSchema>;
export type SignedHouse = z.infer<typeof signedHouseSchema>;
export type SignedStroke = z.infer<typeof signedStrokeSchema>;
const intent = z.enum(['join', 'resume', 'mesh']);
export const helloSchema = z.strictObject({
  v: z.literal(1), kind: z.literal('auth.hello'), sessionId: idSchema, epoch: integer.min(1),
  intent, identity: identitySchema, from: endpointSchema, to: endpointSchema, nonce,
  generation: integer, secret: z.union([nonce, z.literal('')]),
});
export const transcriptSchema = z.strictObject({
  v: z.literal(1), sessionId: idSchema, epoch: integer.min(1), intent,
  initiator: fingerprintSchema, responder: fingerprintSchema, from: endpointSchema, to: endpointSchema,
  initiatorNonce: nonce, responderNonce: nonce, generation: integer, secret: z.union([nonce, z.literal('')]),
});
export type Hello = z.infer<typeof helloSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export const payloadSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('join.decision'), accepted: z.boolean() }),
  z.strictObject({ type: z.literal('session.snapshot'), revision: integer, members: z.array(memberSchema).min(1).max(6), houses: z.array(signedHouseSchema).max(6) }),
  z.strictObject({ type: z.literal('session.heartbeat'), reply: z.boolean() }),
  z.strictObject({ type: z.literal('session.leave'), requestId: idSchema }),
  z.strictObject({ type: z.literal('session.leaveAck'), requestId: idSchema }),
  z.strictObject({ type: z.literal('session.closed') }),
  z.strictObject({ type: z.literal('session.kick'), identityId: fingerprintSchema }),
  z.strictObject({ type: z.literal('house.publish'), document: signedHouseSchema }),
  z.strictObject({ type: z.literal('house.visit'), requestId: idSchema, ownerId: fingerprintSchema }),
  z.strictObject({ type: z.literal('house.visit.request'), requestId: idSchema, visitorId: fingerprintSchema, ownerId: fingerprintSchema }),
  z.strictObject({ type: z.literal('house.visit.decision'), requestId: idSchema, accepted: z.boolean() }),
  z.strictObject({ type: z.literal('house.visit.result'), requestId: idSchema, accepted: z.boolean() }),
  z.strictObject({ type: z.literal('house.leave') }),
  z.strictObject({ type: z.literal('house.kick'), identityId: fingerprintSchema }),
  z.strictObject({ type: z.literal('player.position'), position: positionSchema }),
  z.strictObject({ type: z.literal('player.relay'), identityId: fingerprintSchema, position: positionSchema }),
  z.strictObject({ type: z.literal('board.stroke'), document: signedStrokeSchema }),
  z.strictObject({ type: z.literal('board.sync.request'), boardId: fingerprintSchema, cursor: integer.max(2000) }),
  z.strictObject({ type: z.literal('board.sync.response'), boardId: fingerprintSchema, document: signedStrokeSchema.nullable(), next: integer.max(2000).nullable() }),
  z.strictObject({ type: z.literal('media.token'), token: nonce }),
  z.strictObject({ type: z.literal('media.received'), kind: z.enum(['audio', 'screen']) }),
]);
export type Payload = z.infer<typeof payloadSchema>;
export const eventSchema = z.strictObject({
  v: z.literal(1), kind: z.literal('event'), sessionId: idSchema, epoch: integer.min(1),
  sender: fingerprintSchema, seq: integer.min(1), payload: payloadSchema,
});
export const wireSchema = z.discriminatedUnion('kind', [
  helloSchema,
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.challenge'), identity: identitySchema, transcript: transcriptSchema, signature }),
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.proof'), signature }),
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.ok'), signature }),
  eventSchema,
]);
export type WireMessage = z.infer<typeof wireSchema>;
export const mediaMetadataSchema = z.strictObject({
  v: z.literal(1), kind: z.enum(['audio', 'screen']), sessionId: idSchema,
  epoch: integer.min(1), houseId: fingerprintSchema, identityId: fingerprintSchema, token: nonce,
});
export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;
export function parseWire(raw: unknown): WireMessage {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > LIMITS.messageBytes) throw new Error('Mensaje fuera de límites.');
  return wireSchema.parse(JSON.parse(raw));
}
