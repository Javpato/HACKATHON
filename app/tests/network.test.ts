import { afterEach, describe, expect, it } from 'vitest';
import { setTimeout as waitReal } from 'node:timers/promises';
import { generateIdentity, randomId } from '../src/identity';
import { houseSchema, parseWire, strokeSchema, type WireMessage } from '../src/protocol/schema';
import type { LocalIdentity, PublicHouse } from '../src/protocol/types';
import { BoardStore } from '../src/session/board';
import { VillageClient } from '../src/session/client';
import { STUN_ONLY_CONFIG } from '../src/signaling/peerjs';
import { BoundedChannel } from '../src/transport/bounded-channel';
import type { Clock, DataChannel, MediaCall, TransportEndpoint } from '../src/transport/types';

class ManualClock implements Clock {
  time = 0; wall = 1_800_000_000_000; sequence = 0;
  timers = new Map<number, { due: number; callback: () => void }>();
  now = () => this.time;
  wallNow = () => this.wall;
  setTimeout = (callback: () => void, milliseconds: number): ReturnType<typeof setTimeout> => { const id = ++this.sequence; this.timers.set(id, { due: this.time + milliseconds, callback }); return id as unknown as ReturnType<typeof setTimeout>; };
  clearTimeout = (handle: ReturnType<typeof setTimeout>) => { this.timers.delete(handle as unknown as number); };
  advance(milliseconds: number): void {
    this.time += milliseconds;
    for (const [id, timer] of [...this.timers]) if (timer.due <= this.time) { this.timers.delete(id); timer.callback(); }
  }
}
class FakeChannel implements DataChannel {
  open = false; bufferedAmount = 0; closed = false; other?: FakeChannel;
  opens = new Set<() => void>(); data = new Set<(data: unknown) => void>(); closes = new Set<() => void>();
  constructor(readonly endpoint: string, readonly local: string, readonly network: FakeNetwork) {}
  send(data: string): void {
    if (!this.open) throw new Error('Fake link closed');
    this.network.messages.push({ from: this.local, to: this.endpoint, message: JSON.parse(data) });
    if (this.network.drop?.(this.local, this.endpoint, JSON.parse(data))) return;
    queueMicrotask(() => { if (this.other?.open) for (const callback of this.other.data) callback(data); });
  }
  close(): void {
    if (this.closed) return; this.closed = true; this.open = false;
    for (const callback of [...this.closes]) callback();
    this.other?.close();
  }
  onOpen(callback: () => void): () => void { this.opens.add(callback); return () => this.opens.delete(callback); }
  onData(callback: (data: unknown) => void): () => void { this.data.add(callback); return () => this.data.delete(callback); }
  onClose(callback: () => void): () => void { this.closes.add(callback); return () => this.closes.delete(callback); }
}
class FakeEndpoint implements TransportEndpoint {
  connections = new Set<(channel: DataChannel) => void>(); calls = new Set<(call: MediaCall) => void>(); changes = new Set<(connected: boolean) => void>();
  constructor(readonly id: string, readonly network: FakeNetwork) {}
  connect(endpoint: string): DataChannel { return this.network.connect(this.id, endpoint); }
  call(): MediaCall { throw new Error('This fake transport does not test real media.'); }
  onConnection(callback: (channel: DataChannel) => void): () => void { this.connections.add(callback); return () => this.connections.delete(callback); }
  onCall(callback: (call: MediaCall) => void): () => void { this.calls.add(callback); return () => this.calls.delete(callback); }
  onSignalingChange(callback: (connected: boolean) => void): () => void { this.changes.add(callback); return () => this.changes.delete(callback); }
  destroy(): void { this.network.endpoints.delete(this.id); for (const channel of this.network.channels) if (channel.local === this.id) channel.close(); }
}
class FakeNetwork {
  endpoints = new Map<string, FakeEndpoint>(); channels: FakeChannel[] = [];
  messages: { from: string; to: string; message: WireMessage }[] = [];
  drop?: (from: string, to: string, message: WireMessage) => boolean;
  blocked = new Set<string>();
  create = async (): Promise<TransportEndpoint> => { const endpoint = new FakeEndpoint(`peer-${this.endpoints.size}-${randomId(8)}`, this); this.endpoints.set(endpoint.id, endpoint); return endpoint; };
  connect(from: string, to: string): FakeChannel {
    const a = new FakeChannel(to, from, this), b = new FakeChannel(from, to, this); a.other = b; b.other = a; this.channels.push(a, b);
    queueMicrotask(() => {
      const endpoint = this.endpoints.get(to);
      if (!endpoint || this.blocked.has(to) || this.blocked.has(from)) { a.close(); return; }
      for (const callback of endpoint.connections) callback(b);
      if (a.closed || b.closed) return;
      a.open = b.open = true; for (const callback of b.opens) callback(); for (const callback of a.opens) callback();
    });
    return a;
  }
  sever(endpoint: string): void { for (const channel of this.channels) if (channel.local === endpoint) channel.close(); }
  inject(from: string, to: string, message: unknown): void {
    const incoming = this.channels.find(channel => channel.local === to && channel.endpoint === from && channel.open);
    if (!incoming) throw new Error('No fake link to inject into');
    for (const callback of incoming.data) callback(JSON.stringify(message));
  }
}
async function until(predicate: () => boolean, label = 'condition'): Promise<void> {
  for (let i = 0; i < 500; i++) { if (predicate()) return; await waitReal(2); }
  throw new Error(`Fake integration timed out: ${label}`);
}
const clients: VillageClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.dispose(); });
const houseFor = (identity: LocalIdentity): PublicHouse => ({ ownerId: identity.public.fingerprint, revision: 1, name: `Casa ${identity.public.displayName}`, access: 'open', theme: 'mint', furniture: [] });
async function client(network: FakeNetwork, clock: ManualClock, name: string) {
  const identity = await generateIdentity(name, '#55aa88'); const house = houseFor(identity);
  const instance = new VillageClient(identity, house, { transportFactory: network.create, clock }); clients.push(instance);
  return { instance, identity, house };
}
async function admit(host: VillageClient, guest: VillageClient): Promise<void> {
  await guest.joinVillage(host.view.invite!);
  await until(() => host.view.pendingJoins.length > 0, 'manual admission request');
  host.decideJoin(host.view.pendingJoins[0].requestId, true);
  await until(() => guest.view.phase === 'JOINED', `guest admission (${guest.view.error})`);
  await until(() => host.view.houses.length === host.view.members.length, 'signed house publication');
}

describe('session integration using a FAKE in-memory transport, real WebCrypto (not two computers)', () => {
  it('does not connect at construction, requires manual admission, and creates authenticated mesh', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), b = await client(network, clock, 'B'), c = await client(network, clock, 'C');
    expect(network.endpoints.size).toBe(0);
    await host.instance.openVillage(); await b.instance.joinVillage(host.instance.view.invite!);
    await until(() => host.instance.view.pendingJoins.length === 1);
    await until(() => b.instance.view.phase === 'PENDING_APPROVAL');
    expect(b.instance.view.members).toHaveLength(0); expect(b.instance.view.houses).toHaveLength(0);
    expect(network.messages.some(item => item.to === [...network.endpoints.keys()][1] && item.message.kind === 'event' && item.message.payload.type === 'session.snapshot')).toBe(false);
    host.instance.decideJoin(host.instance.view.pendingJoins[0].requestId, true);
    await until(() => b.instance.view.phase === 'JOINED');
    await admit(host.instance, c.instance);
    await until(() => network.messages.some(item => item.message.kind === 'auth.hello' && item.message.intent === 'mesh'));
    await until(() => network.channels.filter(channel => channel.open).length === 6);
    expect(host.instance.view.members.map(member => member.slot)).toEqual([0, 1, 2]);
    expect(b.instance.view.members.map(member => member.slot)).toEqual([0, 1, 2]);
    expect(JSON.stringify(network.messages)).not.toMatch(/privateKey|filePath|sourceCode|sqlQuery/);
  });
  it('rotates invitations and rejects old generations without leaking roster', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const host = await client(network, clock, 'Host'), guest = await client(network, clock, 'Guest');
    await host.instance.openVillage(); const old = host.instance.view.invite!; host.instance.rotateInvite();
    expect(host.instance.view.invite).not.toBe(old);
    await guest.instance.joinVillage(old); await until(() => guest.instance.view.phase === 'NETWORK_FAILED');
    expect(host.instance.view.pendingJoins).toHaveLength(0); expect(guest.instance.view.members).toHaveLength(0);
  });
  it('rotation revokes a request already awaiting manual approval', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const host = await client(network, clock, 'Host'), guest = await client(network, clock, 'Guest');
    await host.instance.openVillage(); await guest.instance.joinVillage(host.instance.view.invite!);
    await until(() => host.instance.view.pendingJoins.length === 1); const request = host.instance.view.pendingJoins[0].requestId;
    host.instance.rotateInvite(); host.instance.decideJoin(request, true);
    await until(() => guest.instance.view.phase === 'DENIED');
    expect(host.instance.view.members).toHaveLength(1); expect(guest.instance.view.members).toHaveLength(0);
  });
  it('separates coordinator authority from house-owner visit approval and kicking', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B'), c = await client(network, clock, 'C');
    await a.instance.openVillage(); await admit(a.instance, b.instance); await admit(a.instance, c.instance);
    b.instance.publishHouse({ ...b.house, access: 'ask', revision: 2 });
    await until(() => a.instance.view.houses.find(house => house.ownerId === b.identity.public.fingerprint)?.access === 'ask');
    c.instance.visitHouse(b.identity.public.fingerprint);
    await until(() => b.instance.view.pendingVisits.length === 1);
    expect(a.instance.view.pendingVisits).toHaveLength(0);
    expect(c.instance.view.members.find(member => member.identity.fingerprint === c.identity.public.fingerprint)?.houseId).toBeNull();
    b.instance.decideVisit(b.instance.view.pendingVisits[0].requestId, true);
    await until(() => c.instance.view.members.find(member => member.identity.fingerprint === c.identity.public.fingerprint)?.houseId === b.identity.public.fingerprint);
    a.instance.kickVisitor(c.identity.public.fingerprint);
    expect(a.instance.view.members.find(member => member.identity.fingerprint === c.identity.public.fingerprint)?.houseId).toBe(b.identity.public.fingerprint);
    b.instance.kickVisitor(c.identity.public.fingerprint);
    await until(() => c.instance.view.members.find(member => member.identity.fingerprint === c.identity.public.fingerprint)?.houseId === null);
    b.instance.publishHouse({ ...a.house, revision: 3 });
    expect(b.instance.view.error).toContain('Solo puedes');
    expect(a.instance.view.houses.find(house => house.ownerId === a.identity.public.fingerprint)?.revision).toBe(1);
  });
  it('accepts at most six members, then reuses the first free slot on voluntary leave', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'); await a.instance.openVillage();
    const guests = [];
    for (let i = 0; i < 5; i++) { const guest = await client(network, clock, `G${i}`); guests.push(guest); await admit(a.instance, guest.instance); }
    expect(a.instance.view.members.map(member => member.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    const extra = await client(network, clock, 'Extra'); await extra.instance.joinVillage(a.instance.view.invite!);
    await until(() => a.instance.view.pendingJoins.length === 1);
    a.instance.decideJoin(a.instance.view.pendingJoins[0].requestId, true);
    await until(() => extra.instance.view.phase === 'DENIED'); expect(a.instance.view.members).toHaveLength(6);
    await guests[1].instance.leave();
    await until(() => a.instance.view.members.length === 5);
    await admit(a.instance, extra.instance);
    expect(a.instance.view.members.find(member => member.identity.fingerprint === extra.identity.public.fingerprint)?.slot).toBe(2);
  });
  it('bounds leave ACK wait even when every leave packet is dropped', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    network.drop = (_from, _to, message) => message.kind === 'event' && message.payload.type === 'session.leave';
    let complete = false; const leaving = b.instance.leave().then(() => { complete = true; });
    expect(complete).toBe(false); clock.advance(1499); await waitReal(2); expect(complete).toBe(false);
    clock.advance(1); await leaving; expect(b.instance.view.phase).toBe('CLOSED');
  });
  it('uses monotonic host grace and fresh signed authentication when links recover', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    const endpoint = a.instance.view.members[0].endpoint;
    const oldProofs = network.messages.filter(item => item.message.kind === 'auth.proof').length;
    network.sever(endpoint);
    expect(b.instance.view.phase).toBe('RECONNECTING'); expect(b.instance.view.hostGraceRemainingMs).toBe(60_000);
    clock.wall += 9_999_999_999; clock.advance(250);
    await until(() => b.instance.view.phase === 'JOINED', 'fresh recovery');
    expect(network.messages.filter(item => item.message.kind === 'auth.proof').length).toBeGreaterThan(oldProofs);
    expect(a.instance.view.members).toHaveLength(2); expect(b.instance.view.members[1].slot).toBe(1);
    network.blocked.add(endpoint); network.sever(endpoint);
    clock.advance(59_999); expect(b.instance.view.phase).toBe('RECONNECTING');
    clock.advance(1); expect(b.instance.view.phase).toBe('CLOSED');
  });
  it('keeps healthy P2P connections when only signaling is disconnected', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    for (const endpoint of network.endpoints.values()) for (const callback of endpoint.changes) callback(false);
    expect(a.instance.view.phase).toBe('JOINED'); expect(b.instance.view.phase).toBe('JOINED');
    expect(b.instance.view.hostGraceRemainingMs).toBeNull(); expect(network.channels.every(channel => channel.open)).toBe(true);
  });
  it('rejects spoofed sender identities and wrong-role session closing', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    const [host, guest] = a.instance.view.members;
    network.inject(guest.endpoint, host.endpoint, { v: 1, kind: 'event', sessionId: a.instance.view.sessionId, epoch: 1, sender: guest.identity.fingerprint, seq: 9999, payload: { type: 'session.closed' } });
    await until(() => !a.instance.view.members[1].connected);
    expect(a.instance.view.phase).toBe('JOINED'); expect(b.instance.view.phase).toBe('RECONNECTING');
    clock.advance(250); await until(() => b.instance.view.phase === 'JOINED');
    network.inject(guest.endpoint, host.endpoint, { v: 1, kind: 'event', sessionId: a.instance.view.sessionId, epoch: 1, sender: host.identity.fingerprint, seq: 9999, payload: { type: 'house.leave' } });
    await until(() => !a.instance.view.members[1].connected); expect(a.instance.view.members[0].connected).toBe(true);
  });
  it('lets players talk in the open village and opens private calls only by mutual choice', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await host.instance.openVillage(); await admit(host.instance, a.instance); await admit(host.instance, b.instance);
    await until(() => network.channels.filter(channel => channel.open).length === 6, 'full mesh');
    const audience = (who: typeof host) => who.instance.view.media.audience;
    // Outside any house, everyone is in one public room: the village.
    await until(() => audience(host).startsWith('La aldea · 2'), `village audience (${audience(host)})`);
    await until(() => audience(a).startsWith('La aldea · 2'), 'village audience for A');

    // A asks B. Until B agrees nothing changes for anyone's audio.
    a.instance.requestPrivate(b.identity.public.fingerprint);
    await until(() => b.instance.view.privateCall.incoming.includes(a.identity.public.fingerprint), 'B sees the request');
    expect(a.instance.view.privateCall).toMatchObject({ with: b.identity.public.fingerprint, active: false });
    expect(audience(a)).toMatch(/^La aldea · 2/);

    // B accepts: A and B hear only each other, and the host no longer hears either.
    b.instance.requestPrivate(a.identity.public.fingerprint);
    await until(() => a.instance.view.privateCall.active && b.instance.view.privateCall.active, 'call is mutual');
    await until(() => audience(a).startsWith('Privado con B · 1'), `A private audience (${audience(a)})`);
    await until(() => audience(b).startsWith('Privado con A · 1'), 'B private audience');
    await until(() => audience(host).startsWith('La aldea · 0'), `host loses both (${audience(host)})`);

    // Either side hanging up returns everyone to the public village.
    a.instance.requestPrivate(null);
    await until(() => audience(a).startsWith('La aldea · 2') && audience(host).startsWith('La aldea · 2'), 'back to public');
    expect(b.instance.view.privateCall.active).toBe(false);
  });

  it('keeps a house private from the village and refuses impossible private targets', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), a = await client(network, clock, 'A');
    await host.instance.openVillage(); await admit(host.instance, a.instance);
    await until(() => a.instance.view.media.audience.startsWith('La aldea · 1'), 'village');
    a.instance.visitHouse(a.identity.public.fingerprint);
    await until(() => a.instance.view.media.audience.startsWith('Casa: Casa A · 0'), `in own house (${a.instance.view.media.audience})`);
    await until(() => host.instance.view.media.audience.startsWith('La aldea · 0'), 'village no longer includes A');
    a.instance.requestPrivate(a.identity.public.fingerprint);
    expect(a.instance.view.privateCall.with).toBeNull();
    a.instance.requestPrivate('f'.repeat(64));
    expect(a.instance.view.privateCall.with).toBeNull();
  });

  it('synchronizes signed board strokes, deduplicates them, and preserves author tombstones', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    a.instance.visitHouse(a.identity.public.fingerprint); b.instance.visitHouse(a.identity.public.fingerprint);
    await until(() => b.instance.view.members.every(member => member.houseId === a.identity.public.fingerprint));
    const stroke = { id: 'stroke-one', boardId: a.identity.public.fingerprint, author: a.identity.public.fingerprint, seq: 1, color: '#112233', width: 3, tool: 'pen' as const, points: [{ x: 1, y: 1 }], deleted: false };
    a.instance.sendStroke(stroke); await until(() => b.instance.view.strokes.length === 1);
    a.instance.sendStroke(stroke); await waitReal(10); expect(b.instance.view.strokes).toHaveLength(1);
    b.instance.deleteStroke(stroke.id); await waitReal(10); expect(a.instance.view.strokes[0].deleted).toBe(false);
    a.instance.deleteStroke(stroke.id); await until(() => b.instance.view.strokes[0]?.deleted === true);
    a.instance.sendStroke({ ...stroke, seq: 100 }); await waitReal(10); expect(a.instance.view.strokes[0].deleted).toBe(true);
    const c = await client(network, clock, 'C'); await admit(a.instance, c.instance); c.instance.visitHouse(a.identity.public.fingerprint);
    await until(() => c.instance.view.strokes[0]?.deleted === true, 'late join board tombstone sync');
  });
  it('re-signs offline own drafts for a fresh session before synchronization', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    a.instance.sendStroke({ id: 'offline', boardId: a.identity.public.fingerprint, author: a.identity.public.fingerprint, seq: 1, color: '#112233', width: 3, tool: 'pen', points: [{ x: 4, y: 5 }], deleted: false });
    await until(() => a.instance.view.strokes.length === 1);
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    a.instance.visitHouse(a.identity.public.fingerprint); b.instance.visitHouse(a.identity.public.fingerprint);
    await until(() => b.instance.view.strokes[0]?.id === 'offline'); expect(b.instance.view.phase).toBe('JOINED');
  });
});

describe('bounded protocol and board unit tests', () => {
  it('has an explicit STUN-only configuration', () => {
    expect(JSON.stringify(STUN_ONLY_CONFIG)).not.toContain('turn:'); expect(STUN_ONLY_CONFIG.iceServers).toHaveLength(1);
    expect(STUN_ONLY_CONFIG.iceServers?.every(server => !server.username && !server.credential)).toBe(true);
  });
  it('rejects unknown keys, out-of-bounds layout, nonfinite coordinates, and oversized messages', () => {
    expect(() => parseWire('x'.repeat(65_537))).toThrow();
    expect(() => houseSchema.parse({ ownerId: 'a'.repeat(64), name: 'Home', revision: 1, theme: 'mint', access: 'open', furniture: [], privatePath: '/home/x' })).toThrow();
    expect(() => strokeSchema.parse({ id: 's', author: 'a'.repeat(64), boardId: 'b'.repeat(64), seq: 1, color: '#000000', width: 1, tool: 'pen', points: [{ x: Infinity, y: 0 }], deleted: false })).toThrow();
  });
  it('bounds outbound queues and coalesces ephemeral positions under pressure', () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const raw = new FakeChannel('other', 'self', network); raw.open = true; raw.bufferedAmount = 1_000_000;
    const errors: string[] = []; const channel = new BoundedChannel(raw, async () => {}, error => errors.push(error), clock);
    const message: WireMessage = { v: 1, kind: 'event', sessionId: 's', epoch: 1, sender: 'a'.repeat(64), seq: 1, payload: { type: 'session.heartbeat', reply: false } };
    for (let i = 0; i < 200; i++) channel.send({ ...message, seq: i + 1 }, 'position');
    expect(channel.pendingMessages).toBe(1);
    for (let i = 0; i < 200; i++) channel.send(message);
    expect(channel.pendingMessages).toBe(128); expect(channel.pendingBytes).toBeLessThanOrEqual(1_048_576); expect(errors.length).toBeGreaterThan(0); channel.close();
  });
  it('bounds the asynchronous input queue before expensive validation can complete', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const raw = new FakeChannel('other', 'self', network); raw.open = true;
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const errors: string[] = []; const channel = new BoundedChannel(raw, async () => gate, error => errors.push(error), clock);
    const data = JSON.stringify({ v: 1, kind: 'event', sessionId: 's', epoch: 1, sender: 'a'.repeat(64), seq: 1, payload: { type: 'session.heartbeat', reply: false } });
    for (let i = 0; i < 10000; i++) for (const callback of raw.data) callback(data);
    expect(raw.closed).toBe(true); expect(errors).toHaveLength(1); release(); await gate; channel.close();
  });
  it('caps board operations at 2000 and forbids deleting a different author', () => {
    const board = new BoardStore();
    const stroke = { id: 's', author: 'a'.repeat(64), boardId: 'b'.repeat(64), seq: 1, color: '#000000', width: 1, tool: 'pen' as const, points: [{ x: 1, y: 1 }], deleted: false };
    expect(board.apply({ stroke, signature: '' })).toBe('applied');
    expect(board.apply({ stroke: { ...stroke, author: 'c'.repeat(64), seq: 2, deleted: true }, signature: '' })).toBe('forbidden');
    for (let seq = 2; seq <= 2000; seq++) expect(board.apply({ stroke: { ...stroke, seq }, signature: '' })).toBe('applied');
    expect(board.apply({ stroke: { ...stroke, seq: 2001 }, signature: '' })).toBe('full');
    expect(board.documents(stroke.boardId)).toHaveLength(1);
  });
});
