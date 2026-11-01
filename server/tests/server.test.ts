import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateIdentity, randomId, sign } from '../../app/src/identity';
import type { LocalIdentity, PublicHouse, BoardStroke } from '../../app/src/protocol/types';
import { SERVER_PROTOCOL, SERVER_AUTHORITY, neighborhoodsFor, type ServerMessage } from '../../app/src/server/contracts';
import { startServer } from '../src/main';
import { Store } from '../src/store';

type Running = Awaited<ReturnType<typeof startServer>>;
const running: Running[] = []; const dirs: string[] = [];
afterEach(async () => { for (const r of running.splice(0)) await r.close(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function boot(dataDir = ':memory:', claimSecret = 'install-secret-0123456789'): Promise<Running> {
  const r = await startServer({ port: 0, host: '127.0.0.1', dataDir, name: 'Prueba', origins: ['*'], claimSecret, log: () => {} });
  running.push(r); return r;
}
function tempDir(): string { const d = mkdtempSync(join(tmpdir(), 'sv-server-')); dirs.push(d); return d; }

class TestClient {
  ws!: WebSocket; messages: ServerMessage[] = []; welcome: Extract<ServerMessage, { t: 'welcome' }> | null = null; denied: string | null = null;
  private waiters: { match: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  constructor(readonly identity: LocalIdentity) {}
  static async create(name: string): Promise<TestClient> { return new TestClient(await generateIdentity(name, '#336699')); }
  get id(): string { return this.identity.public.fingerprint; }
  async connect(port: number, options: { saved?: boolean; invite?: string; claim?: string } = {}): Promise<string> {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.onmessage = event => { const m = JSON.parse(String(event.data)) as ServerMessage; this.messages.push(m); for (const w of [...this.waiters]) if (w.match(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); } };
    await new Promise<void>((resolve, reject) => { this.ws.onopen = () => resolve(); this.ws.onerror = () => reject(new Error('socket')); });
    const challenge = this.next(m => m.t === 'challenge');
    this.ws.send(JSON.stringify({ t: 'hello', v: SERVER_PROTOCOL }));
    const c = await challenge as Extract<ServerMessage, { t: 'challenge' }>;
    const saved = options.saved ?? true;
    const signature = await sign(this.identity, 'server-auth', { worldId: c.worldId, nonce: c.nonce, fingerprint: this.id, saved });
    const outcome = this.next(m => m.t === 'welcome' || m.t === 'denied');
    this.ws.send(JSON.stringify({ t: 'auth', identity: this.identity.public, saved, signature, ...(options.invite ? { invite: options.invite } : {}), ...(options.claim ? { claim: options.claim } : {}) }));
    const result = await outcome;
    if (result.t === 'welcome') { this.welcome = result; return result.role; }
    this.denied = (result as { code: string }).code; return `denied:${this.denied}`;
  }
  next(match: (m: ServerMessage) => boolean, timeout = 5000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('timeout waiting')), timeout); this.waiters.push({ match, resolve: m => { clearTimeout(timer); resolve(m); } }); });
  }
  async request(body: unknown, id = randomId(12)): Promise<Extract<ServerMessage, { t: 'ack' }>> {
    const ack = this.next(m => m.t === 'ack' && m.id === id);
    this.ws.send(JSON.stringify({ t: 'req', id, body }));
    return await ack as Extract<ServerMessage, { t: 'ack' }>;
  }
  send(body: unknown): void { this.ws.send(JSON.stringify({ t: 'req', id: randomId(12), body })); }
  async signHouse(house: PublicHouse) { return { house, signature: await sign(this.identity, 'house', { sessionId: this.welcome!.scope, epoch: this.welcome!.epoch, house }) }; }
  async commit(boardId: string, strokes: BoardStroke[]) {
    const scope = { sessionId: this.welcome!.scope, epoch: this.welcome!.epoch };
    const documents = []; for (const stroke of strokes) documents.push({ stroke, signature: await sign(this.identity, 'board', { ...scope, stroke }) });
    const unsigned = { id: randomId(), boardId, documents };
    return { ...unsigned, signature: await sign(this.identity, 'board-commit', { ...scope, ...unsigned }) };
  }
  close(): Promise<void> { return new Promise(resolve => { if (this.ws.readyState === WebSocket.CLOSED) { resolve(); return; } this.ws.onclose = () => resolve(); this.ws.close(); }); }
}

const house = (owner: string, revision = 2): PublicHouse => ({ ownerId: owner, revision, name: 'Casa de prueba', access: 'open', theme: 'mint', furniture: [{ id: 'board', kind: 'board', x: 340, y: 95, publicAlias: 'Ideas' }] });
const stroke = (author: string, boardId: string, id = randomId(9), seq = 1): BoardStroke => ({ id, author, boardId, seq, color: '#336699', width: 4, tool: 'pen', points: [{ x: 1, y: 2 }, { x: 30, y: 40 }], deleted: false });
async function adminAndInvite(r: Running) {
  const admin = await TestClient.create('Admin');
  expect(await admin.connect(r.port, { claim: 'install-secret-0123456789' })).toBe('admin');
  const ack = await admin.request({ op: 'admin.invite.create', label: 'clase', uses: 30, hours: 24 });
  expect(ack.ok).toBe(true);
  return { admin, invite: (ack as { result: { code: string; id: string } }).result };
}

describe('neighbourhood capacity rule', () => {
  it('needs one neighbourhood per six people, never more than four', () => {
    expect([1, 6, 7, 10, 12, 13, 18, 19, 24, 99].map(neighborhoodsFor)).toEqual([1, 1, 2, 2, 2, 3, 3, 4, 4, 4]);
  });
});

describe('self-hosted server', () => {
  it('reports compatibility over HTTP', async () => {
    const r = await boot();
    const info = await (await fetch(`http://127.0.0.1:${r.port}/health`)).json();
    expect(info).toMatchObject({ app: 'studyvillage-server', protocol: SERVER_PROTOCOL, maxOnline: 6, needsClaim: true });
  });

  it('claims administration once with the installation secret; knowing the URL grants nothing', async () => {
    const r = await boot();
    const stranger = await TestClient.create('Desconocido');
    expect(await stranger.connect(r.port)).toBe('denied:invite');
    const wrong = await TestClient.create('Intruso');
    expect(await wrong.connect(r.port, { claim: 'not-the-secret-000000' })).toBe('denied:claim');
    const temporary = await TestClient.create('Temporal');
    expect(await temporary.connect(r.port, { claim: 'install-secret-0123456789', saved: false })).toBe('denied:unsaved');
    const admin = await TestClient.create('Admin');
    expect(await admin.connect(r.port, { claim: 'install-secret-0123456789' })).toBe('admin');
    const second = await TestClient.create('Otro');
    expect(await second.connect(r.port, { claim: 'install-secret-0123456789' })).toBe('denied:claim');
    await admin.close();
  });

  it('rejects a forged signature', async () => {
    const r = await boot();
    const a = await TestClient.create('A'), b = await TestClient.create('B');
    const ws = new WebSocket(`ws://127.0.0.1:${r.port}/ws`);
    await new Promise(resolve => { ws.onopen = resolve; });
    const got: ServerMessage[] = []; ws.onmessage = e => got.push(JSON.parse(String(e.data)));
    ws.send(JSON.stringify({ t: 'hello', v: SERVER_PROTOCOL }));
    await new Promise(resolve => setTimeout(resolve, 100));
    const c = got[0] as Extract<ServerMessage, { t: 'challenge' }>;
    const signature = await sign(b.identity, 'server-auth', { worldId: c.worldId, nonce: c.nonce, fingerprint: a.id, saved: true });
    ws.send(JSON.stringify({ t: 'auth', identity: a.identity.public, saved: true, signature, claim: 'install-secret-0123456789' }));
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(got.at(-1)).toEqual({ t: 'denied', code: 'signature' });
  });

  it('admits invited people: saved identities become residents, temporary ones visit; revoked invites stop working', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const ana = await TestClient.create('Ana'), tmp = await TestClient.create('Temporal');
    expect(await ana.connect(r.port, { invite: invite.code })).toBe('resident');
    expect(await tmp.connect(r.port, { invite: invite.code, saved: false })).toBe('visitor');
    expect(r.store.resident(ana.id)?.plot).toBe(1);
    expect(r.store.resident(tmp.id)).toBeNull();
    // A visitor cannot keep a house on the server.
    const publish = await tmp.request({ op: 'house.publish', document: await tmp.signHouse(house(tmp.id)) });
    expect(publish).toMatchObject({ ok: false, code: 'unsaved' });
    expect((await admin.request({ op: 'admin.invite.revoke', id: invite.id })).ok).toBe(true);
    const late = await TestClient.create('Tarde');
    expect(await late.connect(r.port, { invite: invite.code })).toBe('denied:invite');
    // Accepted members come back without an invite and without the admin.
    await admin.close(); await ana.close();
    const again = new TestClient(ana.identity);
    expect(await again.connect(r.port)).toBe('resident');
    await again.close(); await tmp.close();
  });

  it('enforces capacity for new entries only and grows neighbourhoods up to four without deleting any', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const one = await TestClient.create('Uno');
    expect(await one.connect(r.port, { invite: invite.code })).toBe('resident');
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 2 })).ok).toBe(true);
    const three = await TestClient.create('Tres');
    expect(await three.connect(r.port, { invite: invite.code })).toBe('denied:full');
    expect(r.world.online).toBe(2);
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 1 })).ok).toBe(true);
    expect(r.world.online).toBe(2); // Lowering never kicks anyone.
    const ten = await admin.request({ op: 'admin.capacity', maxOnline: 10 });
    expect(ten).toMatchObject({ ok: true, result: { maxOnline: 10, neighborhoods: 2 } });
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 24 }) as { result: { neighborhoods: number } }).result.neighborhoods).toBe(4);
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 6 }) as { result: { neighborhoods: number } }).result.neighborhoods).toBe(4);
    expect(r.store.residents()).toHaveLength(2);
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 25 })).ok).toBe(false);
    await admin.close(); await one.close();
  });

  it('fills 24 connections across four neighbourhoods of six plots and refuses the 25th', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    await admin.request({ op: 'admin.capacity', maxOnline: 24 });
    const people: TestClient[] = [];
    for (let i = 0; i < 23; i++) { const p = await TestClient.create(`P${i}`); expect(await p.connect(r.port, { invite: invite.code })).toBe('resident'); people.push(p); }
    const counts = [0, 0, 0, 0]; for (const res of r.store.residents()) counts[res.neighborhood]++;
    expect(counts).toEqual([6, 6, 6, 6]);
    const extra = await TestClient.create('Extra');
    expect(await extra.connect(r.port, { invite: invite.code })).toBe('denied:full');
    for (const p of people) await p.close(); await admin.close();
  });

  it('persists houses and boards across a restart; guests continue when the admin leaves', async () => {
    const dir = tempDir();
    let r = await boot(dir);
    const { admin, invite } = await adminAndInvite(r);
    const bea = await TestClient.create('Bea');
    await bea.connect(r.port, { invite: invite.code });
    expect((await bea.request({ op: 'house.publish', document: await bea.signHouse(house(bea.id)) })).ok).toBe(true);
    const old = await bea.request({ op: 'house.publish', document: await bea.signHouse(house(bea.id, 1)) });
    expect(old).toMatchObject({ ok: true, result: { conflict: true, revision: 2 } });
    const ref = `house:${bea.id}:board`;
    bea.send({ op: 'presence', position: { areaId: 'residential', x: 100, y: 100, direction: 'down', moving: false }, houseId: bea.id });
    expect((await bea.request({ op: 'board.select', ref })).ok).toBe(true);
    const commit = await bea.commit(ref, [stroke(bea.id, ref, 'line-1')]);
    const requestId = randomId(12);
    expect(await bea.request({ op: 'board.commit', document: commit }, requestId)).toMatchObject({ ok: true, result: { applied: 1 } });
    // Retrying the same request id returns the stored answer, not a second write.
    expect(await bea.request({ op: 'board.commit', document: commit }, requestId)).toMatchObject({ ok: true, result: { applied: 1 } });
    await admin.close();
    // The admin is gone; Bea can still start an activity and is its organiser.
    const view = bea.next(m => m.t === 'app' && m.from === SERVER_AUTHORITY);
    bea.send({ op: 'app.send', channel: 'werewolves', to: SERVER_AUTHORITY, data: JSON.stringify({ t: 'hello' }) });
    expect(JSON.parse((await view as { data: string }).data)).toMatchObject({ t: 'view', lead: true });
    await bea.close(); await r.close(); running.splice(running.indexOf(r), 1);

    r = await boot(dir);
    const back = new TestClient(bea.identity);
    expect(await back.connect(r.port)).toBe('resident');
    expect(back.welcome!.scope).toBe(commit.boardId ? back.welcome!.scope : '');
    back.send({ op: 'presence', position: { areaId: 'residential', x: 100, y: 100, direction: 'down', moving: false }, houseId: back.id });
    const board = back.next(m => m.t === 'board');
    await back.request({ op: 'board.select', ref });
    expect((await board as { documents: { stroke: { id: string } }[] }).documents.map(d => d.stroke.id)).toEqual(['line-1']);
    expect((r.store.house(back.id)!.document as { house: PublicHouse }).house.name).toBe('Casa de prueba');
    await back.close();
  });

  it('keeps a room\'s own activities apart and only for people inside that room', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const carl = await TestClient.create('Carl');
    await carl.connect(r.port, { invite: invite.code });
    const scope = `room:${admin.id}:ground:r1`;
    // Carl is not in that room (it does not even exist): the server refuses its copy of the activity.
    expect(await carl.request({ op: 'app.send', channel: 'projects', to: SERVER_AUTHORITY, data: JSON.stringify({ t: 'hello', s: scope }) })).toMatchObject({ ok: false });
    expect(await carl.request({ op: 'app.send', channel: 'projects', to: SERVER_AUTHORITY, data: JSON.stringify({ t: 'hello', s: 'room:../../etc' }) })).toMatchObject({ ok: false });
    // The village-wide copy still answers, without a scope.
    const view = carl.next(m => m.t === 'app' && m.from === SERVER_AUTHORITY);
    carl.send({ op: 'app.send', channel: 'projects', to: SERVER_AUTHORITY, data: JSON.stringify({ t: 'hello' }) });
    const wire = JSON.parse((await view as { data: string }).data);
    expect(wire).toMatchObject({ t: 'view' });
    expect(wire.s).toBeUndefined();
    await carl.close(); await admin.close();
  });

  it('shares board changes with people at the same board and refuses foreign objects and forged commits', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const carl = await TestClient.create('Carl');
    await carl.connect(r.port, { invite: invite.code });
    const ref = 'area:community:main';
    const at = { areaId: 'community', x: 300, y: 200, direction: 'down', moving: false };
    for (const c of [admin, carl]) { c.send({ op: 'presence', position: at, houseId: null }); await c.request({ op: 'board.select', ref }); }
    const seen = carl.next(m => m.t === 'board' && !m.reset);
    expect((await admin.request({ op: 'board.commit', document: await admin.commit(ref, [stroke(admin.id, ref, 'mine')]) })).ok).toBe(true);
    expect((await seen as { documents: { stroke: { id: string } }[] }).documents[0].stroke.id).toBe('mine');
    // Carl may copy it, but cannot overwrite it under his own name.
    const stolen = await carl.request({ op: 'board.commit', document: await carl.commit(ref, [{ ...stroke(carl.id, ref, 'mine', 5) }]) });
    expect(stolen).toMatchObject({ ok: false, code: 'forbidden' });
    const forged = await carl.commit(ref, [stroke(carl.id, ref, 'x')]);
    forged.documents[0].stroke.points = [{ x: 9, y: 9 }];
    expect(await carl.request({ op: 'board.commit', document: forged })).toMatchObject({ ok: false, code: 'signature' });
    // Signals only reach people in the same scene.
    expect((await carl.request({ op: 'media.signal', to: admin.id, data: '{"kind":"offer"}' })).ok).toBe(true);
    carl.send({ op: 'presence', position: { ...at, areaId: 'study' }, houseId: null });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(await carl.request({ op: 'media.signal', to: admin.id, data: '{"kind":"offer"}' })).toMatchObject({ ok: false, code: 'forbidden' });
    await admin.close(); await carl.close();
  });

  it('lets a house owner change a guest\'s layer in that house only', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const guest = await TestClient.create('Invitada'); await guest.connect(r.port, { invite: invite.code });
    await admin.request({ op: 'house.publish', document: await admin.signHouse(house(admin.id)) });
    const ref = `house:${admin.id}:board`;
    for (const c of [admin, guest]) { c.send({ op: 'presence', position: { areaId: 'residential', x: 100, y: 100, direction: 'down', moving: false }, houseId: admin.id }); await c.request({ op: 'board.select', ref }); }
    const drawn = stroke(guest.id, ref, 'guest-line');
    expect((await guest.request({ op: 'board.commit', document: await guest.commit(ref, [drawn]) })).ok).toBe(true);
    expect((await admin.request({ op: 'board.commit', document: await admin.commit(ref, [{ ...drawn, seq: 2, deleted: true }]) })).ok).toBe(true);
    expect(r.store.stroke(ref, 'guest-line')!.stroke).toMatchObject({ author: guest.id, deleted: true });
    // The guest has no such power over the owner's objects.
    const owners = stroke(admin.id, ref, 'owner-line');
    await admin.request({ op: 'board.commit', document: await admin.commit(ref, [owners]) });
    expect(await guest.request({ op: 'board.commit', document: await guest.commit(ref, [{ ...owners, seq: 2, deleted: true }]) })).toMatchObject({ ok: false, code: 'forbidden' });
    await admin.close(); await guest.close();
  });

  it('asks the owner before a visit into an "ask" house and never lets anyone into a locked one', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const dora = await TestClient.create('Dora');
    await dora.connect(r.port, { invite: invite.code });
    await admin.request({ op: 'house.publish', document: await admin.signHouse({ ...house(admin.id), access: 'ask' }) });
    const pending = await dora.request({ op: 'house.visit', ownerId: admin.id }) as { result: { pending: boolean; requestId: string } };
    expect(pending.result.pending).toBe(true);
    const result = dora.next(m => m.t === 'visit.result');
    await admin.request({ op: 'house.decide', requestId: pending.result.requestId, accept: true });
    expect(await result).toMatchObject({ accepted: true, ownerId: admin.id });
    await admin.request({ op: 'house.publish', document: await admin.signHouse({ ...house(admin.id, 3), access: 'locked' }) });
    const eve = await TestClient.create('Eve'); await eve.connect(r.port, { invite: invite.code });
    expect(await eve.request({ op: 'house.visit', ownerId: admin.id })).toMatchObject({ ok: false, code: 'forbidden' });
    await admin.close(); await dora.close(); await eve.close();
  });

  it('imports my own house and boards in one transaction', async () => {
    const r = await boot();
    const { admin } = await adminAndInvite(r);
    const ref = `house:${admin.id}:board`;
    const boards = [await admin.commit(ref, [stroke(admin.id, ref, 'a'), stroke(admin.id, ref, 'b')])];
    const ack = await admin.request({ op: 'import', house: await admin.signHouse(house(admin.id, 7)), boards });
    expect(ack).toMatchObject({ ok: true, result: { house: 7, objects: 2 } });
    // Someone else's board cannot be smuggled into my import.
    const other = `house:${'a'.repeat(64)}:board`;
    const bad = await admin.request({ op: 'import', house: await admin.signHouse(house(admin.id, 8)), boards: [await admin.commit(other, [stroke(admin.id, other)])] });
    expect(bad).toMatchObject({ ok: false, code: 'forbidden' });
    expect(r.store.house(admin.id)!.revision).toBe(7);
    await admin.close();
  });

  it('backs up and restores the database', async () => {
    const dir = tempDir();
    const r = await boot(dir);
    const { admin } = await adminAndInvite(r);
    await admin.request({ op: 'house.publish', document: await admin.signHouse(house(admin.id, 4)) });
    r.store.backup(join(dir, 'backup.sqlite'));
    await admin.close();
    const copy = new Store(join(dir, 'backup.sqlite'));
    expect(copy.house(admin.id)!.revision).toBe(4);
    expect(copy.worldId).toBe(r.store.worldId);
    copy.close();
  });

  it('reports a disk failure instead of acknowledging a write it did not keep', async () => {
    const r = await boot();
    const { admin } = await adminAndInvite(r);
    const original = r.store.putHouse.bind(r.store);
    r.store.putHouse = () => { throw new Error('SQLITE_FULL: database or disk is full'); };
    expect(await admin.request({ op: 'house.publish', document: await admin.signHouse(house(admin.id, 5)) })).toMatchObject({ ok: false, code: 'storage' });
    r.store.putHouse = original;
    expect(r.store.house(admin.id)).toBeNull();
    await admin.close();
  });
});

it('keeps accepted calls and parties across neighborhoods and excludes unrelated location voice', async () => {
  const r = await boot();
  const { admin, invite } = await adminAndInvite(r);
  await admin.request({ op: 'admin.capacity', maxOnline: 12 });
  const guest = await TestClient.create('VoiceGuest'); await guest.connect(r.port, { invite: invite.code });
  const lastVoice = (c: TestClient) => c.messages.filter((m): m is Extract<ServerMessage, {t:'voice'}> => m.t === 'voice').at(-1)!;
  await admin.request({ op: 'voice', command: { action: 'create', name: 'Friends' } });
  const invitationEvent = guest.next(m => m.t === 'voice' && m.voice.invitations.length > 0);
  await admin.request({ op: 'voice', command: { action: 'invite', target: guest.id } });
  await invitationEvent;
  const invited = lastVoice(guest).voice.invitations[0]; expect(invited).toBeDefined();
  await guest.request({ op: 'voice', command: { action: 'respond', invitation: invited.id, accept: true } });
  const channel = lastVoice(guest).voice.selected!.id;
  const session = lastVoice(guest).session;
  expect((await guest.request({ op: 'travel', neighborhood: 1 })).ok).toBe(true);
  const offer = JSON.stringify({ k: 'offer', cid: 'test-call-001', meta: { kind: 'audio' }, sdp: 'test' });
  expect((await guest.request({ op: 'media.signal', to: admin.id, data: offer })).ok).toBe(true);
  expect(lastVoice(guest).voice.selected!.id).toBe(channel); expect(lastVoice(guest).session).toBe(session);
  await admin.request({ op: 'voice', command: { action: 'remove', target: guest.id } });
  expect(await guest.request({ op: 'media.signal', to: admin.id, data: offer })).toMatchObject({ ok: false, code: 'forbidden' });
  await admin.request({ op: 'voice', command: { action: 'call', target: guest.id } });
  expect(await guest.request({ op: 'media.signal', to: admin.id, data: offer })).toMatchObject({ ok: false, code: 'forbidden' });
  await guest.request({ op: 'voice', command: { action: 'call', target: admin.id } });
  expect((await guest.request({ op: 'media.signal', to: admin.id, data: offer })).ok).toBe(true);
  await admin.close(); await guest.close();
});

it('authorizes each private entry, isolates room content and boards, and saves workspaces across restarts', async()=>{
 const dir=tempDir();let r=await boot(dir);const{admin,invite}=await adminAndInvite(r);
 const guest=await TestClient.create('RoomGuest');await guest.connect(r.port,{invite:invite.code});
 const home={...house(admin.id),floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math'},{id:'code',name:'Code'}]}]};
 await admin.request({op:'house.publish',document:await admin.signHouse(home)});
 const at={areaId:'residential',x:384,y:344,direction:'up',moving:false};
 for(const p of[admin,guest])p.send({op:'presence',position:at,houseId:admin.id});
 const corridor={floorId:'ground',roomId:null},room={floorId:'ground',roomId:'math'};
 const view=(p:TestClient)=>p.messages.filter((m):m is Extract<ServerMessage,{t:'workspace'}>=>m.t==='workspace').at(-1)!.workspace;
 expect((await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}})).ok).toBe(false);
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:corridor}});
 const floorRequest=view(admin).requests[0];expect(floorRequest.space).toEqual(corridor);
 await admin.request({op:'workspace',command:{action:'decide',request:floorRequest.id,accept:true}});
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}});
 await admin.request({op:'workspace',command:{action:'decide',request:view(admin).requests[0].id,accept:true}});
 await admin.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}});
 const doc=view(admin).document!;expect(doc.revision).toBe(0);
 await admin.request({op:'workspace',command:{action:'commit',base:0,document:{...doc,notes:[{id:'mathnote',title:'Math',text:'Room-only proof'}]}}});
 const ref=`house:${admin.id}:space:ground:math:board`;
 expect((await guest.request({op:'board.select',ref})).ok).toBe(true);
 // Equal floor/room ids in another house cannot be used to bypass its entry approval.
 await guest.request({op:'house.publish',document:await guest.signHouse({...house(guest.id),floors:home.floors})});
 guest.send({op:'presence',houseId:guest.id,position:{...at,space:room}});
 expect((await guest.request({op:'board.select',ref})).ok).toBe(true);
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:corridor}});
 expect((await guest.request({op:'board.select',ref})).ok).toBe(false);expect(view(guest).document).toBeNull();
 const deniedPosition=guest.next(m=>m.t==='state'&&m.present.some(p=>p.identity.fingerprint===guest.id&&p.position.space?.roomId===null));guest.send({op:'presence',houseId:admin.id,position:{...at,space:room}});await deniedPosition;
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}});expect(view(admin).requests).toHaveLength(1);
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:null}});
 expect((await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}})).ok).toBe(false);
 await admin.close();await guest.close();await r.close();running.splice(running.indexOf(r),1);
 r=await boot(dir);const again=new TestClient(admin.identity);await again.connect(r.port);again.send({op:'presence',houseId:again.id,position:at});await again.request({op:'workspace',command:{action:'enter',owner:again.id,space:room}});
 expect(view(again).document?.notes[0].text).toBe('Room-only proof');await again.close();
});

it('explicitly reports a protocol mismatch to older clients',async()=>{
 const r=await boot();const socket=new WebSocket(`ws://127.0.0.1:${r.port}/ws`);
 const message=await new Promise<ServerMessage>((resolve,reject)=>{socket.onopen=()=>socket.send(JSON.stringify({t:'hello',v:SERVER_PROTOCOL-1}));socket.onmessage=e=>resolve(JSON.parse(String(e.data)));socket.onerror=()=>reject(new Error('socket'));});
 expect(message).toEqual({t:'denied',code:'version'});socket.close();
});

it('keeps house and room friend access across a server restart with the owner offline, then revokes it',async()=>{
  const dir=tempDir();let r=await boot(dir);const{admin,invite}=await adminAndInvite(r);
  const houseFriend=await TestClient.create('House friend'),roomFriend=await TestClient.create('Room friend'),outsider=await TestClient.create('Room friend');
  for(const friend of [houseFriend,roomFriend,outsider])expect(await friend.connect(r.port,{invite:invite.code})).toBe('resident');
  const room={floorId:'ground',roomId:'math'};
  const layout:PublicHouse={...house(admin.id),doorPositions:{'lobby>ground:-':{x:600,y:320},'ground:->ground:math':{x:240,y:200}},access:'locked',allowlist:[houseFriend.id],floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math',allowlist:[roomFriend.id]},{id:'code',name:'Code'}]}]};
  expect((await admin.request({op:'house.publish',document:await admin.signHouse(layout)})).ok).toBe(true);
  await Promise.all([admin,houseFriend,roomFriend,outsider].map(c=>c.close()));await r.close();running.splice(running.indexOf(r),1);
  r=await boot(dir);
  for(const friend of [houseFriend,roomFriend,outsider])expect(await friend.connect(r.port)).toBe('resident');
  for(const friend of [houseFriend,roomFriend]){
    expect(await friend.request({op:'house.visit',ownerId:admin.id})).toMatchObject({ok:true,result:{accepted:true}});
    friend.send({op:'presence',houseId:admin.id,position:{x:384,y:344,direction:'up',moving:false}});
  }
  expect((await outsider.request({op:'house.visit',ownerId:admin.id})).ok).toBe(false);
  const state=[...roomFriend.messages].reverse().find(m=>m.t==='state');
  expect(state?.t==='state'&&state.residents.find(r=>r.fingerprint===admin.id)?.house?.house.doorPositions).toEqual(layout.doorPositions);
  expect((await roomFriend.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}})).ok).toBe(true);
  expect((await roomFriend.request({op:'board.select',ref:`house:${admin.id}:space:ground:math:board`})).ok).toBe(true);
  expect((await roomFriend.request({op:'workspace',command:{action:'enter',owner:admin.id,space:{floorId:'ground',roomId:'code'}}})).ok).toBe(false);
  expect((await houseFriend.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}})).ok).toBe(false);
  expect(await admin.connect(r.port)).toBe('admin');
  const revoked={...layout,revision:layout.revision+1,allowlist:[],floors:[{...layout.floors![0],rooms:layout.floors![0].rooms.map(r=>({...r,allowlist:[]}))}]};
  expect((await admin.request({op:'house.publish',document:await admin.signHouse(revoked)})).ok).toBe(true);
  expect((await roomFriend.request({op:'board.select',ref:`house:${admin.id}:space:ground:math:board`})).ok).toBe(false);
  for(const friend of [houseFriend,roomFriend])expect((await friend.request({op:'house.visit',ownerId:admin.id})).ok).toBe(false);
  await Promise.all([admin,houseFriend,roomFriend,outsider].map(c=>c.close()));
});
