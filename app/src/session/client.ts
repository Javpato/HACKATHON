import { canonical, randomId, sign, validatePublicIdentity, verify } from '../identity';
import { MediaManager, type MediaDevicesAdapter, type MediaPeer } from '../media/manager';
import { houseSchema, positionSchema, strokeSchema, type Hello, type Invite, type Payload, type SignedHouse, type SignedStroke, type Transcript, type WireMessage } from '../protocol/schema';
import { LIMITS, type BoardStroke, type LocalIdentity, type Member, type NetworkView, type Position, type PublicHouse, type PublicIdentity, type SessionPhase, type VillageActions, type VisitRequest } from '../protocol/types';
import { createInvite, encodeInvite, parseInvite } from '../signaling/invite';
import { createPeerEndpoint } from '../signaling/peerjs';
import { BoundedChannel } from '../transport/bounded-channel';
import { systemClock, type Clock, type DataChannel, type TransportEndpoint, type TransportFactory } from '../transport/types';
import { BoardStore } from './board';

/** The stages of opening or joining, in the order they run. */
type OpenStep = 'identity' | 'signaling' | 'session' | 'signing' | 'invite';

/** Error name only. Never the message, which can carry endpoints or paths. */
function errorName(error: unknown): string {
  if (error instanceof Error && error.name && error.name !== 'Error') return error.name;
  if (error instanceof Error && error.message) return error.message.slice(0, 80);
  return 'UnknownError';
}

function describeOpenFailure(step: OpenStep, error: unknown): string {
  const name = errorName(error);
  switch (step) {
    case 'identity':
      return `Tu identidad no se pudo verificar en este entorno (${name}). Falla la criptografía del navegador, no la red.`;
    case 'signaling':
      return `No se pudo abrir la señalización (${name}). Comprueba la red o vuelve a intentarlo; el servidor es gratuito y a veces rechaza conexiones.`;
    case 'signing':
      return `No se pudo firmar tu casa (${name}). Falla la criptografía del navegador, no la red.`;
    case 'invite':
      return `La señalización se abrió, pero no se pudo crear la invitación (${name}).`;
    default:
      return `La señalización se abrió, pero no se pudo preparar la sesión (${name}).`;
  }
}

function describeJoinFailure(step: OpenStep, error: unknown): string {
  const name = errorName(error);
  switch (step) {
    case 'identity':
      return `Tu identidad no se pudo verificar en este entorno (${name}). Falla la criptografía del navegador, no la red.`;
    case 'signaling':
      return `No se pudo abrir la señalización (${name}). Comprueba la red y vuelve a intentarlo.`;
    default:
      return `No se pudo conectar con quien te invitó (${name}). Comprueba la invitación; algunas redes impiden WebRTC directo.`;
  }
}

export interface VillageClientOptions { transportFactory?: TransportFactory; clock?: Clock; mediaDevices?: MediaDevicesAdapter }
type Intent = 'join' | 'resume' | 'mesh';
interface Link {
  raw: DataChannel; wire: BoundedChannel; initiator: boolean; intent?: Intent; expected?: PublicIdentity | string;
  hello?: Hello; transcript?: Transcript; identity?: PublicIdentity; step: 'hello' | 'challenge' | 'proof' | 'ok' | 'ready';
  authenticated: boolean; approved: boolean; closed: boolean; created: number; lastSeen: number; lastHeartbeat: number;
  sentSeq: number; receivedSeq: number; receiveToken: string; sendToken?: string; requestId?: string;
  syncRoom?: string; syncExpected?: number; syncExport?: { boardId: string; documents: SignedStroke[]; cursor: number };
  unsubscribe: (() => void)[];
}
interface PendingVisit extends VisitRequest { visitorId: string; created: number }
const initialPosition = (): Position => ({ x: 384, y: 240, direction: 'down', moving: false });
const activePhases: SessionPhase[] = ['SIGNALING', 'CONNECTING', 'AUTHENTICATING', 'PENDING_APPROVAL', 'JOINED', 'RECONNECTING'];

export class VillageClient implements VillageActions {
  private ownHouse: PublicHouse;
  private phase: SessionPhase = 'IDLE';
  private isHost = false;
  private sessionId: string | null = null;
  private epoch = 0;
  private hostId: string | null = null;
  private invite: Invite | null = null;
  private endpoint?: TransportEndpoint;
  private links = new Set<Link>();
  private members = new Map<string, Member>();
  private houses = new Map<string, SignedHouse>();
  private visits = new Map<string, PendingVisit>();
  private memberDeadlines = new Map<string, number>();
  private rosterRevision = 0;
  private hostDeadline: number | null = null;
  private lastReconnect = -Infinity;
  private error: string | null = null;
  private listeners = new Set<(view: NetworkView) => void>();
  private media: MediaManager;
  private board = new BoardStore();
  /** Who I want a private call with, and who every other member wants one with. */
  private privateWith: string | null = null;
  private privateOf = new Map<string, string | null>();
  private boardRetries = new Map<string, SignedStroke>();
  private clock: Clock;
  private factory: TransportFactory;
  private tickTimer?: ReturnType<typeof setTimeout>;
  private moveTimer?: ReturnType<typeof setTimeout>;
  private pendingPosition?: Position;
  private lastPositionSent = -Infinity;
  private endpointUnsubscribe: (() => void)[] = [];
  private generation = 0;
  private disposed = false;
  private leaving = false;
  private leaveResolve?: () => void;
  private leaveRequest?: string;
  private localJobs: (() => Promise<void>)[] = [];
  private runningJob = false;

  constructor(private identity: LocalIdentity, ownHouse: PublicHouse, options: VillageClientOptions = {}) {
    this.ownHouse = houseSchema.parse(ownHouse);
    if (ownHouse.ownerId !== identity.public.fingerprint) throw new Error('La casa debe pertenecer a la identidad local.');
    this.clock = options.clock ?? systemClock;
    this.factory = options.transportFactory ?? createPeerEndpoint;
    this.media = new MediaManager(() => this.notify(), options.mediaDevices, (id, kind) => { const link = this.linkFor(id); if (link) this.send(link, { type: 'media.received', kind }); });
  }
  get view(): NetworkView {
    const room = this.members.get(this.id)?.houseId ?? this.id;
    return {
      phase: this.phase, isHost: this.isHost, sessionId: this.sessionId,
      invite: this.isHost && this.invite ? encodeInvite(this.invite) : null,
      members: structuredClone([...this.members.values()].sort((a, b) => a.slot - b.slot)),
      houses: structuredClone([...this.houses.values()].map(item => item.house)),
      pendingJoins: [...this.links].filter(link => link.authenticated && !link.approved && !!link.requestId && !link.closed).map(link => ({ requestId: link.requestId!, identity: structuredClone(link.identity!) })),
      pendingVisits: [...this.visits.values()].filter(request => request.houseId === this.id).map(({ requestId, identity, houseId }) => ({ requestId, identity: structuredClone(identity), houseId })),
      strokes: structuredClone(this.board.documents(room).map(document => document.stroke)),
      hostGraceRemainingMs: this.hostDeadline === null ? null : Math.max(0, this.hostDeadline - this.clock.now()),
      error: this.error, media: this.media.view,
      privateCall: {
        with: this.privateWith,
        active: !!this.privateWith && this.partnerOf(this.id) === this.privateWith,
        incoming: [...this.privateOf].filter(([from, to]) => to === this.id && this.members.get(from)?.connected && this.privateWith !== from).map(([from]) => from),
      },
    };
  }
  private get id(): string { return this.identity.public.fingerprint; }
  subscribe(listener: (view: NetworkView) => void): () => void { this.listeners.add(listener); listener(this.view); return () => this.listeners.delete(listener); }
  private notify(): void {
    if (this.disposed) return;
    const view = this.view;
    for (const listener of this.listeners) { try { listener(view); } catch { /* A view must not disrupt the protocol. */ } }
  }
  private setError(message: string): void { this.error = message; this.notify(); }
  private setPhase(phase: SessionPhase): void { this.phase = phase; this.notify(); }
  private queue(job: () => Promise<void>): void {
    if (this.disposed) return;
    if (this.localJobs.length >= LIMITS.queueMessages) { this.setError('Hay demasiados cambios pendientes. Espera antes de continuar.'); return; }
    this.localJobs.push(job); void this.runJobs();
  }
  private async runJobs(): Promise<void> {
    if (this.runningJob) return;
    this.runningJob = true;
    try { while (this.localJobs.length && !this.disposed) { const job = this.localJobs.shift()!; try { await job(); } catch { this.setError('No se pudo aplicar el cambio local.'); } } }
    finally { this.runningJob = false; }
  }
  async openVillage(): Promise<void> {
    if (this.disposed || activePhases.includes(this.phase)) { this.setError('Sal del vecindario actual antes de abrir otro.'); return; }
    this.reset(); const generation = this.generation;
    this.isHost = true; this.hostId = this.id; this.sessionId = randomId(); this.epoch = 1;
    this.setPhase('SIGNALING');
    // Each step is tagged so a failure names the step that actually broke.
    // A single catch here used to blame "la señalización o WebRTC" for any of
    // four unrelated failures, including WebCrypto, which made a working
    // network look like a dead one.
    let step: OpenStep = 'identity';
    try {
      await validatePublicIdentity(this.identity.public);
      if (generation !== this.generation || this.disposed) return;
      step = 'signaling';
      const endpoint = await this.factory();
      if (generation !== this.generation || this.disposed) { endpoint.destroy(); return; }
      step = 'session';
      this.attachEndpoint(endpoint);
      this.members.set(this.id, { identity: structuredClone(this.identity.public), endpoint: endpoint.id, slot: 0, connected: true, houseId: null, position: initialPosition() });
      step = 'signing';
      const ownDocument = await this.signHouse(this.ownHouse);
      if (generation !== this.generation) return;
      step = 'invite';
      this.houses.set(this.id, ownDocument);
      this.invite = createInvite(this.id, endpoint.id, this.sessionId!, this.epoch, 1, this.clock.wallNow());
      this.rosterRevision = 1; this.setPhase('JOINED'); this.startTick();
    } catch (error) {
      if (generation === this.generation) this.finish('NETWORK_FAILED', describeOpenFailure(step, error));
    }
  }
  async joinVillage(encodedInvite: string): Promise<void> {
    if (this.disposed || activePhases.includes(this.phase)) { this.setError('Sal del vecindario actual antes de unirte a otro.'); return; }
    this.reset(); const generation = this.generation;
    try { this.invite = parseInvite(encodedInvite, this.clock.wallNow()); }
    catch (error) { this.setPhase(error instanceof Error && error.message === 'EXPIRED_INVITE' ? 'EXPIRED_INVITE' : 'NETWORK_FAILED'); this.setError('La invitación no es válida o ha caducado.'); return; }
    if (this.invite.hostFingerprint === this.id) { this.finish('NETWORK_FAILED', 'No puedes unirte a tu propia identidad.'); return; }
    this.hostId = this.invite.hostFingerprint; this.sessionId = this.invite.sessionId; this.epoch = this.invite.epoch;
    this.setPhase('SIGNALING');
    let step: OpenStep = 'identity';
    try {
      await validatePublicIdentity(this.identity.public);
      if (generation !== this.generation || this.disposed) return;
      step = 'signaling';
      const endpoint = await this.factory();
      if (generation !== this.generation || this.disposed) { endpoint.destroy(); return; }
      step = 'session';
      this.attachEndpoint(endpoint); this.setPhase('CONNECTING'); this.startTick();
      this.connect(this.invite.endpoint, 'join', this.hostId);
    } catch (error) {
      if (generation === this.generation) this.finish('NETWORK_FAILED', describeJoinFailure(step, error));
    }
  }
  private attachEndpoint(endpoint: TransportEndpoint): void {
    this.endpoint = endpoint; this.media.attach(endpoint);
    this.endpointUnsubscribe.push(endpoint.onConnection(raw => this.attach(raw, false)), endpoint.onCall(call => this.media.receive(call)), endpoint.onSignalingChange(connected => {
      if (!connected && this.phase === 'JOINED') this.setError('Se perdió la señalización; las conexiones P2P existentes siguen activas.');
    }));
  }
  private connect(endpoint: string, intent: Intent, expected: PublicIdentity | string): void {
    if (!this.endpoint || [...this.links].some(link => !link.closed && link.raw.endpoint === endpoint)) return;
    try { this.attach(this.endpoint.connect(endpoint), true, intent, expected); }
    catch { this.setError('No se pudo establecer una conexión directa.'); }
  }
  private attach(raw: DataChannel, initiator: boolean, intent?: Intent, expected?: PublicIdentity | string): void {
    if (!this.endpoint || !this.sessionId || this.links.size >= (this.isHost ? 17 : 7) || this.leaving) { raw.close(); return; }
    const now = this.clock.now();
    const link: Link = { raw, wire: undefined as unknown as BoundedChannel, initiator, intent, expected, step: initiator ? 'challenge' : 'hello', authenticated: false, approved: false, closed: false, created: now, lastSeen: now, lastHeartbeat: now, sentSeq: 0, receivedSeq: 0, receiveToken: randomId(32), unsubscribe: [] };
    link.wire = new BoundedChannel(raw, message => this.receive(link, message), reason => this.setError(reason), this.clock);
    this.links.add(link);
    link.unsubscribe.push(raw.onClose(() => this.linkClosed(link)));
    if (initiator) {
      const start = () => {
        if (link.closed || link.hello || !this.endpoint || !this.sessionId) return;
        link.hello = {
          v: 1, kind: 'auth.hello', sessionId: this.sessionId, epoch: this.epoch, intent: intent!,
          identity: structuredClone(this.identity.public), from: this.endpoint.id, to: raw.endpoint, nonce: randomId(32),
          generation: intent === 'join' ? this.invite!.generation : 0, secret: intent === 'join' ? this.invite!.secret : '',
        };
        link.wire.send(link.hello);
        if (intent === 'join') this.setPhase('AUTHENTICATING');
      };
      link.unsubscribe.push(raw.onOpen(start)); if (raw.open) start();
    }
  }
  private active(link: Link): boolean { return !link.closed && this.links.has(link) && !!this.endpoint && !this.disposed; }
  private async receive(link: Link, message: WireMessage): Promise<void> {
    if (!this.active(link)) return;
    link.lastSeen = this.clock.now();
    if (message.kind === 'auth.hello') {
      if (link.step !== 'hello' || !this.endpoint || message.sessionId !== this.sessionId || message.epoch !== this.epoch || message.from !== link.raw.endpoint || message.to !== this.endpoint.id || message.identity.fingerprint === this.id) throw new Error('Unexpected hello');
      if ([...this.links].some(other => other !== link && !other.closed && other.identity?.fingerprint === message.identity.fingerprint)) throw new Error('Duplicate identity');
      if (message.intent === 'join') {
        if (!this.isHost || this.phase !== 'JOINED' || !this.invite || this.invite.expiresAt <= this.clock.wallNow() || message.generation !== this.invite.generation || message.secret !== this.invite.secret || this.members.has(message.identity.fingerprint) || [...this.links].filter(item => !item.approved).length > 12) throw new Error('Invalid invitation');
      } else {
        const member = this.members.get(message.identity.fingerprint);
        if (!member || member.endpoint !== message.from || member.identity.publicKey !== message.identity.publicKey || message.secret !== '' || message.generation !== 0) throw new Error('Not in roster');
        if (message.intent === 'resume' && (!this.isHost || !this.memberDeadlines.has(member.identity.fingerprint))) throw new Error('Invalid resume');
        if (message.intent === 'mesh' && (!member.connected || this.phase !== 'JOINED')) throw new Error('Invalid mesh');
      }
      link.identity = await validatePublicIdentity(message.identity);
      if (!this.active(link)) return;
      link.intent = message.intent; link.hello = message;
      link.transcript = { v: 1, sessionId: message.sessionId, epoch: message.epoch, intent: message.intent, initiator: message.identity.fingerprint, responder: this.id, from: message.from, to: message.to, initiatorNonce: message.nonce, responderNonce: randomId(32), generation: message.generation, secret: message.secret };
      link.step = 'proof';
      const signature = await sign(this.identity, 'auth-responder', link.transcript);
      if (this.active(link)) link.wire.send({ v: 1, kind: 'auth.challenge', identity: structuredClone(this.identity.public), transcript: link.transcript, signature });
      return;
    }
    if (message.kind === 'auth.challenge') {
      if (link.step !== 'challenge' || !link.hello) throw new Error('Unexpected challenge');
      const identity = await validatePublicIdentity(message.identity);
      const expected = typeof link.expected === 'string' ? link.expected : link.expected?.fingerprint;
      if (identity.fingerprint !== expected || (typeof link.expected !== 'string' && identity.publicKey !== link.expected?.publicKey)) throw new Error('Wrong identity');
      const expectedTranscript: Transcript = { v: 1, sessionId: link.hello.sessionId, epoch: link.hello.epoch, intent: link.hello.intent, initiator: this.id, responder: identity.fingerprint, from: link.hello.from, to: link.hello.to, initiatorNonce: link.hello.nonce, responderNonce: message.transcript.responderNonce, generation: link.hello.generation, secret: link.hello.secret };
      if (canonical(message.transcript) !== canonical(expectedTranscript) || !await verify(identity, 'auth-responder', message.transcript, message.signature)) throw new Error('Invalid challenge signature');
      if (!this.active(link)) return;
      link.identity = identity; link.transcript = message.transcript; link.step = 'ok';
      const signature = await sign(this.identity, 'auth-initiator', link.transcript);
      if (this.active(link)) link.wire.send({ v: 1, kind: 'auth.proof', signature });
      return;
    }
    if (message.kind === 'auth.proof') {
      if (link.step !== 'proof' || !link.identity || !link.transcript || !await verify(link.identity, 'auth-initiator', link.transcript, message.signature)) throw new Error('Invalid proof');
      const signature = await sign(this.identity, 'auth-accepted', link.transcript);
      if (!this.active(link)) return;
      link.wire.send({ v: 1, kind: 'auth.ok', signature }); this.authenticated(link); return;
    }
    if (message.kind === 'auth.ok') {
      if (link.step !== 'ok' || !link.identity || !link.transcript || !await verify(link.identity, 'auth-accepted', link.transcript, message.signature)) throw new Error('Invalid acknowledgement');
      if (this.active(link)) this.authenticated(link); return;
    }
    if (!link.authenticated || !link.identity || message.sender !== link.identity.fingerprint || message.sessionId !== this.sessionId || message.epoch !== this.epoch || message.seq <= link.receivedSeq) throw new Error('Unauthenticated or replayed event');
    link.receivedSeq = message.seq;
    const payload = message.payload;
    if (payload.type === 'session.heartbeat') { if (!payload.reply) this.send(link, { type: 'session.heartbeat', reply: true }); return; }
    if (payload.type === 'join.decision') {
      if (this.isHost || link.identity.fingerprint !== this.hostId || link.intent !== 'join' || this.phase !== 'PENDING_APPROVAL') throw new Error('Wrong admission role');
      if (!payload.accepted) this.finish('DENIED', 'El anfitrión no aceptó la solicitud.');
      else link.approved = true;
      return;
    }
    if (!link.approved) throw new Error('Approval required');
    await this.handle(link, payload);
  }
  private authenticated(link: Link): void {
    link.authenticated = true; link.step = 'ready'; link.lastSeen = this.clock.now();
    if (link.intent === 'join') {
      if (this.isHost) {
        if (!this.validJoin(link)) { this.send(link, { type: 'join.decision', accepted: false }); this.clock.setTimeout(() => this.closeLink(link, false), 100); return; }
        link.requestId = randomId(); this.notify();
      }
      else this.setPhase('PENDING_APPROVAL');
      return;
    }
    link.approved = true;
    if (link.intent === 'resume' && this.isHost) {
      const member = this.members.get(link.identity!.fingerprint)!;
      member.connected = true; member.houseId = null; this.memberDeadlines.delete(member.identity.fingerprint); this.rosterChanged();
    }
    this.announceMedia(link); this.syncMedia();
  }
  private send(link: Link, payload: Payload, coalesce?: string): boolean {
    if (!this.active(link) || !link.authenticated || !this.sessionId) return false;
    return link.wire.send({ v: 1, kind: 'event', sessionId: this.sessionId, epoch: this.epoch, sender: this.id, seq: ++link.sentSeq, payload }, coalesce);
  }
  private validJoin(link: Link): boolean {
    return this.isHost && this.phase === 'JOINED' && !!this.invite && this.invite.expiresAt > this.clock.wallNow() && link.hello?.generation === this.invite.generation && link.hello.secret === this.invite.secret;
  }
  private linkFor(identityId: string): Link | undefined { return [...this.links].find(link => !link.closed && link.authenticated && link.approved && link.identity?.fingerprint === identityId); }
  private hostLink(): Link | undefined { return this.hostId ? this.linkFor(this.hostId) : undefined; }
  private sendHost(payload: Payload, coalesce?: string): boolean { const link = this.hostLink(); return !!link && this.send(link, payload, coalesce); }
  private broadcast(payload: Payload, coalesce?: string): void { for (const link of this.links) if (link.approved) this.send(link, payload, coalesce); }
  decideJoin(requestId: string, accept: boolean): void {
    if (!this.isHost || this.phase !== 'JOINED') return;
    const link = [...this.links].find(item => item.requestId === requestId && item.authenticated && !item.approved && !item.closed);
    if (!link?.identity) return;
    if (!accept || !this.validJoin(link) || this.members.size >= LIMITS.members) {
      this.send(link, { type: 'join.decision', accepted: false });
      link.requestId = undefined; this.clock.setTimeout(() => this.closeLink(link, false), 100); this.notify(); return;
    }
    const used = new Set([...this.members.values()].map(member => member.slot));
    let slot = 1; while (used.has(slot)) slot++;
    if (slot >= LIMITS.members) return;
    link.approved = true; link.requestId = undefined;
    this.members.set(link.identity.fingerprint, { identity: structuredClone(link.identity), endpoint: link.raw.endpoint, slot, connected: true, houseId: null, position: initialPosition() });
    this.send(link, { type: 'join.decision', accepted: true });
    this.announceMedia(link); this.rosterChanged();
  }
  rotateInvite(): void {
    if (!this.isHost || this.phase !== 'JOINED' || !this.endpoint || !this.sessionId || !this.invite) return;
    this.invite = createInvite(this.id, this.endpoint.id, this.sessionId, this.epoch, this.invite.generation + 1, this.clock.wallNow());
    for (const link of this.links) if (!link.approved && link.intent === 'join') { link.requestId = undefined; if (link.authenticated) this.send(link, { type: 'join.decision', accepted: false }); this.clock.setTimeout(() => this.closeLink(link, false), 100); }
    this.notify();
  }
  private snapshot(): Extract<Payload, { type: 'session.snapshot' }> { return { type: 'session.snapshot', revision: this.rosterRevision, members: structuredClone([...this.members.values()]), houses: structuredClone([...this.houses.values()]) }; }
  private rosterChanged(): void { this.rosterRevision++; this.broadcast(this.snapshot()); this.reconcileMesh(); this.syncMedia(); this.notify(); }
  private async signHouse(house: PublicHouse): Promise<SignedHouse> { return { house: structuredClone(house), signature: await sign(this.identity, 'house', { sessionId: this.sessionId, epoch: this.epoch, house }) }; }
  private async verifyHouse(document: SignedHouse, identity: PublicIdentity): Promise<boolean> { return document.house.ownerId === identity.fingerprint && await verify(identity, 'house', { sessionId: this.sessionId, epoch: this.epoch, house: document.house }, document.signature); }

  private async handle(link: Link, payload: Payload): Promise<void> {
    const sender = link.identity!.fingerprint;
    const fromHost = sender === this.hostId;
    if (payload.type === 'session.snapshot') {
      if (this.isHost || !fromHost) throw new Error('Only coordinator publishes roster');
      if (payload.revision <= this.rosterRevision) return;
      const ids = new Set(payload.members.map(member => member.identity.fingerprint));
      if (ids.size !== payload.members.length || new Set(payload.members.map(member => member.slot)).size !== ids.size || new Set(payload.members.map(member => member.endpoint)).size !== ids.size || !ids.has(this.id)) throw new Error('Invalid roster');
      const host = payload.members.find(member => member.slot === 0);
      if (!host || host.identity.fingerprint !== this.hostId || host.endpoint !== link.raw.endpoint || !host.connected) throw new Error('Wrong coordinator');
      const self = payload.members.find(member => member.identity.fingerprint === this.id)!;
      if (self.endpoint !== this.endpoint?.id || !self.connected) throw new Error('Wrong local endpoint');
      for (const member of payload.members) { await validatePublicIdentity(member.identity); if (member.houseId && !ids.has(member.houseId)) throw new Error('Unknown room'); }
      const houseOwners = new Set<string>();
      for (const document of payload.houses) {
        const owner = payload.members.find(member => member.identity.fingerprint === document.house.ownerId);
        if (!owner || houseOwners.has(document.house.ownerId) || !await this.verifyHouse(document, owner.identity)) throw new Error('Invalid house signature');
        const previous = this.houses.get(owner.identity.fingerprint);
        if (previous && (document.house.revision < previous.house.revision || (document.house.revision === previous.house.revision && canonical(document.house) !== canonical(previous.house)))) throw new Error('Layout rollback');
        houseOwners.add(document.house.ownerId);
      }
      if (!this.active(link)) return;
      const oldIds = [...this.members.keys()];
      this.members = new Map(payload.members.map(member => [member.identity.fingerprint, structuredClone(member)]));
      this.houses = new Map(payload.houses.map(document => [document.house.ownerId, structuredClone(document)]));
      for (const id of oldIds) if (!ids.has(id)) this.removeLocalMember(id);
      this.rosterRevision = payload.revision; this.hostDeadline = null; this.error = null;
      const firstJoin = this.phase !== 'JOINED'; this.phase = 'JOINED';
      if (firstJoin) this.publishHouseDocument();
      this.announceMedia(link);
      this.reconcileMesh(); this.syncMedia(); this.notify(); return;
    }
    if (payload.type === 'media.token') { link.sendToken = payload.token; this.syncMedia(); return; }
    if (payload.type === 'media.received') {
      // The manager only confirms when it really has an outgoing call to this
      // sender, so any authenticated member may report receipt, in any room.
      if (this.members.has(sender)) this.media.confirmReceiving(sender, payload.kind);
      return;
    }
    if (payload.type === 'media.private') {
      if (payload.with === sender) throw new Error('Self private call');
      this.privateOf.set(sender, payload.with);
      this.syncMedia(); this.notify(); return;
    }
    if (payload.type === 'session.closed') { if (!fromHost || this.isHost) throw new Error('Only coordinator closes'); this.finish('CLOSED', 'El anfitrión cerró el vecindario.'); return; }
    if (payload.type === 'session.kick') { if (!fromHost || this.isHost || payload.identityId !== this.id) throw new Error('Only coordinator kicks'); this.finish('KICKED', 'El anfitrión te retiró del vecindario.'); return; }
    if (payload.type === 'session.leaveAck') { if (!fromHost || payload.requestId !== this.leaveRequest) throw new Error('Unexpected leave ACK'); this.leaveResolve?.(); return; }
    if (payload.type === 'session.leave') {
      if (!this.isHost) throw new Error('Leave must go to coordinator');
      this.send(link, { type: 'session.leaveAck', requestId: payload.requestId }); link.approved = false; this.removeMember(sender);
      this.clock.setTimeout(() => this.closeLink(link, false), 100); return;
    }
    if (this.leaving) return;
    if (payload.type === 'house.publish') {
      if (!this.isHost || payload.document.house.ownerId !== sender || !await this.verifyHouse(payload.document, link.identity!)) throw new Error('Owner-only house publication');
      if (!this.active(link)) return;
      const previous = this.houses.get(sender);
      if (previous && payload.document.house.revision <= previous.house.revision) return;
      this.houses.set(sender, structuredClone(payload.document));
      if (payload.document.house.access === 'locked') for (const member of this.members.values()) if (member.houseId === sender && member.identity.fingerprint !== sender) member.houseId = null;
      this.rosterChanged(); return;
    }
    if (payload.type === 'house.visit') { if (!this.isHost) throw new Error('Only coordinator routes visits'); this.requestVisit(sender, payload.ownerId, payload.requestId); return; }
    if (payload.type === 'house.visit.request') {
      if (!fromHost || payload.ownerId !== this.id) throw new Error('Invalid visit route');
      const visitor = this.members.get(payload.visitorId);
      if (!visitor?.connected || this.visits.size >= 12) return;
      this.visits.set(payload.requestId, { requestId: payload.requestId, visitorId: payload.visitorId, identity: visitor.identity, houseId: this.id, created: this.clock.now() }); this.notify(); return;
    }
    if (payload.type === 'house.visit.decision') { if (!this.isHost) throw new Error('Wrong visit role'); this.resolveVisit(payload.requestId, sender, payload.accepted); return; }
    if (payload.type === 'house.visit.result') { if (!fromHost) throw new Error('Wrong visit result role'); if (!payload.accepted) this.setError('La casa está cerrada, desconectada o no aceptó la visita.'); return; }
    if (payload.type === 'house.leave') { if (!this.isHost) throw new Error('Wrong leave route'); this.cancelVisits(sender); const member = this.members.get(sender); if (member) { member.houseId = null; this.rosterChanged(); } return; }
    if (payload.type === 'house.kick') { if (!this.isHost) throw new Error('Wrong owner kick route'); this.removeVisitor(sender, payload.identityId); return; }
    if (payload.type === 'player.position') {
      if (!this.isHost) throw new Error('Wrong position route'); const member = this.members.get(sender);
      if (member) { member.position = payload.position; this.broadcast({ type: 'player.relay', identityId: sender, position: payload.position }, `position/${sender}`); this.notify(); } return;
    }
    if (payload.type === 'player.relay') { if (!fromHost || this.isHost) throw new Error('Wrong position relay'); const member = this.members.get(payload.identityId); if (member) { member.position = payload.position; this.notify(); } return; }
    if (payload.type === 'board.stroke') { await this.receiveStroke(link, payload.document, false); return; }
    if (payload.type === 'board.sync.request') {
      if (!this.sameRoom(sender, payload.boardId)) throw new Error('Board outside authorized house');
      if (payload.cursor === 0) link.syncExport = { boardId: payload.boardId, documents: this.board.documents(payload.boardId), cursor: 0 };
      const sync = link.syncExport;
      if (!sync || sync.boardId !== payload.boardId || sync.cursor !== payload.cursor) throw new Error('Invalid board sync cursor');
      let document = sync.documents[payload.cursor] ?? null;
      // Offline own drafts are rebound to this session before sharing; old-session signatures never go on the wire.
      if (document?.stroke.author === this.id) document = { stroke: document.stroke, signature: await sign(this.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke: document.stroke }) };
      if (!this.active(link) || !this.sameRoom(sender, payload.boardId)) return;
      const next = payload.cursor + 1 < sync.documents.length ? payload.cursor + 1 : null;
      this.send(link, { type: 'board.sync.response', boardId: payload.boardId, document, next });
      if (next === null) link.syncExport = undefined; else sync.cursor = next;
      return;
    }
    if (payload.type === 'board.sync.response') {
      if (!this.sameRoom(sender, payload.boardId) || link.syncRoom !== payload.boardId || link.syncExpected === undefined || (payload.next !== null && payload.next !== link.syncExpected + 1)) throw new Error('Unsolicited board sync');
      if (payload.document) { if (payload.document.stroke.boardId !== payload.boardId) throw new Error('Wrong board'); await this.receiveStroke(link, payload.document, true); }
      if (!this.active(link)) return;
      if (payload.next !== null) { link.syncExpected = payload.next; this.send(link, { type: 'board.sync.request', boardId: payload.boardId, cursor: payload.next }); } else link.syncExpected = undefined;
      return;
    }
    throw new Error('Unsupported event');
  }

  publishHouse(house: PublicHouse): void {
    const parsed = houseSchema.safeParse(house);
    if (!parsed.success || house.ownerId !== this.id || house.revision < this.ownHouse.revision || (house.revision === this.ownHouse.revision && canonical(house) !== canonical(this.ownHouse))) { this.setError('Solo puedes publicar tu casa con una revisión nueva y campos públicos válidos.'); return; }
    this.ownHouse = parsed.data;
    if (this.phase === 'JOINED') this.publishHouseDocument();
    this.notify();
  }
  private publishHouseDocument(): void {
    const generation = this.generation; const house = structuredClone(this.ownHouse);
    this.queue(async () => {
      const document = await this.signHouse(house);
      if (generation !== this.generation || this.phase !== 'JOINED') return;
      if (this.isHost) {
        this.houses.set(this.id, document);
        if (house.access === 'locked') for (const member of this.members.values()) if (member.houseId === this.id && member.identity.fingerprint !== this.id) member.houseId = null;
        this.rosterChanged();
      } else this.sendHost({ type: 'house.publish', document });
    });
  }
  visitHouse(ownerId: string): void {
    if (this.phase !== 'JOINED') { this.setError('Abre o únete a un vecindario para visitar una casa.'); return; }
    this.media.suspend();
    const requestId = randomId();
    if (this.isHost) this.requestVisit(this.id, ownerId, requestId); else this.sendHost({ type: 'house.visit', requestId, ownerId });
  }
  private requestVisit(visitorId: string, ownerId: string, requestId: string): void {
    const visitor = this.members.get(visitorId); const owner = this.members.get(ownerId); const house = this.houses.get(ownerId)?.house;
    const reject = () => { const link = this.linkFor(visitorId); if (link) this.send(link, { type: 'house.visit.result', requestId, accepted: false }); else if (visitorId === this.id) this.setError('La casa no está disponible.'); };
    if (!visitor?.connected || !owner?.connected || !house || (house.access === 'locked' && visitorId !== ownerId)) { reject(); return; }
    // A new request cancels this visitor's older pending permission.
    for (const [id, visit] of this.visits) if (visit.visitorId === visitorId) this.visits.delete(id);
    if (visitorId === ownerId || house.access === 'open') { visitor.houseId = ownerId; this.rosterChanged(); return; }
    if (this.visits.size >= 12) { reject(); return; }
    this.visits.set(requestId, { requestId, visitorId, identity: visitor.identity, houseId: ownerId, created: this.clock.now() });
    if (ownerId !== this.id) { const link = this.linkFor(ownerId); if (!link || !this.send(link, { type: 'house.visit.request', requestId, visitorId, ownerId })) { this.visits.delete(requestId); reject(); } }
    this.notify();
  }
  decideVisit(requestId: string, accept: boolean): void {
    const request = this.visits.get(requestId);
    if (!request || request.houseId !== this.id || this.phase !== 'JOINED') return;
    if (this.isHost) this.resolveVisit(requestId, this.id, accept);
    else { this.sendHost({ type: 'house.visit.decision', requestId, accepted: accept }); this.visits.delete(requestId); this.notify(); }
  }
  private resolveVisit(requestId: string, ownerId: string, accept: boolean): void {
    const request = this.visits.get(requestId);
    if (!request || request.houseId !== ownerId) return;
    this.visits.delete(requestId);
    const visitor = this.members.get(request.visitorId); const owner = this.members.get(ownerId); const house = this.houses.get(ownerId)?.house;
    const accepted = !!(accept && visitor?.connected && owner?.connected && house && house.access !== 'locked');
    if (accepted) { visitor!.houseId = ownerId; this.rosterChanged(); }
    const link = this.linkFor(request.visitorId);
    if (link) this.send(link, { type: 'house.visit.result', requestId, accepted }); else if (!accepted) this.setError('La visita no fue aceptada.');
    this.notify();
  }
  leaveHouse(): void {
    this.media.suspend();
    if (this.phase !== 'JOINED') return;
    if (this.isHost) { this.cancelVisits(this.id); const member = this.members.get(this.id); if (member) member.houseId = null; this.rosterChanged(); }
    else this.sendHost({ type: 'house.leave' });
  }
  private cancelVisits(visitorId: string): void { for (const [id, request] of this.visits) if (request.visitorId === visitorId) this.visits.delete(id); }
  kickVisitor(identityId: string): void { if (this.phase !== 'JOINED') return; if (this.isHost) this.removeVisitor(this.id, identityId); else this.sendHost({ type: 'house.kick', identityId }); }
  private removeVisitor(ownerId: string, visitorId: string): void {
    const visitor = this.members.get(visitorId);
    if (visitor && visitorId !== ownerId && visitor.houseId === ownerId) { visitor.houseId = null; this.rosterChanged(); }
  }
  kickMember(identityId: string): void {
    if (!this.isHost || identityId === this.id || this.phase !== 'JOINED') return;
    const link = this.linkFor(identityId);
    if (link) { this.send(link, { type: 'session.kick', identityId }); link.approved = false; }
    this.removeMember(identityId);
    if (link) this.clock.setTimeout(() => this.closeLink(link, false), 100);
  }
  move(position: Position): void {
    const parsed = positionSchema.safeParse(position);
    if (!parsed.success || this.phase !== 'JOINED') return;
    const self = this.members.get(this.id); if (self) self.position = parsed.data;
    this.pendingPosition = parsed.data;
    const elapsed = this.clock.now() - this.lastPositionSent;
    if (elapsed >= 100) this.flushPosition();
    else if (!this.moveTimer) this.moveTimer = this.clock.setTimeout(() => { this.moveTimer = undefined; this.flushPosition(); }, 100 - elapsed);
    this.notify();
  }
  private flushPosition(): void {
    if (!this.pendingPosition || this.phase !== 'JOINED') return;
    const position = this.pendingPosition; this.pendingPosition = undefined; this.lastPositionSent = this.clock.now();
    if (this.isHost) this.broadcast({ type: 'player.relay', identityId: this.id, position }, `position/${this.id}`);
    else this.sendHost({ type: 'player.position', position }, `position/${this.id}`);
  }
  sendStroke(stroke: BoardStroke): void {
    const parsed = strokeSchema.safeParse(stroke);
    const self = this.members.get(this.id);
    const localOnly = !activePhases.includes(this.phase);
    if (!parsed.success || stroke.author !== this.id || (localOnly ? stroke.boardId !== this.id : self?.houseId !== stroke.boardId)) { this.setError('Solo puedes dibujar tu propia capa en la casa actual.'); return; }
    const generation = this.generation;
    this.queue(async () => {
      const document: SignedStroke = { stroke: parsed.data, signature: await sign(this.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke: parsed.data }) };
      if (generation !== this.generation) return;
      const result = this.board.apply(document);
      if (result === 'full') { this.setError('La pizarra alcanzó 2000 operaciones; exporta tus notas antes de continuar.'); return; }
      if (result === 'forbidden') { this.setError('No puedes modificar un trazo ajeno.'); return; }
      if (result === 'applied' && !localOnly) this.shareStroke(document);
      this.notify();
    });
  }
  deleteStroke(strokeId: string): void {
    const room = this.members.get(this.id)?.houseId ?? this.id;
    const document = this.board.find(room, strokeId);
    if (!document || document.stroke.author !== this.id || document.stroke.deleted) return;
    this.sendStroke({ ...document.stroke, seq: document.stroke.seq + 1, deleted: true });
  }
  private sameRoom(identityId: string, boardId: string): boolean {
    const self = this.members.get(this.id); const peer = this.members.get(identityId);
    return this.phase === 'JOINED' && !!self?.connected && self.houseId === boardId && !!peer?.connected && peer.houseId === boardId;
  }
  private async receiveStroke(link: Link, document: SignedStroke, sync: boolean): Promise<void> {
    const stroke = document.stroke; const author = this.members.get(stroke.author);
    if (!this.sameRoom(link.identity!.fingerprint, stroke.boardId) || (!sync && stroke.author !== link.identity!.fingerprint)) throw new Error('Unauthorized board author or house');
    // Departed authors' already-rendered work remains local, but is not newly imported without roster authorization.
    if (!author) return;
    if (!await verify(author.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke }, document.signature)) throw new Error('Invalid board signature');
    if (!this.active(link) || !this.sameRoom(link.identity!.fingerprint, stroke.boardId)) return;
    const result = this.board.apply(document);
    if (result === 'forbidden') throw new Error('Another author owns this stroke');
    if (result === 'full') this.setError('La pizarra alcanzó el límite de operaciones; hay cambios que no se importaron.');
    else if (result === 'applied') this.notify();
  }
  private shareStroke(document: SignedStroke): void {
    const recipients = [...this.members.values()].filter(member => member.identity.fingerprint !== this.id && member.connected && member.houseId === document.stroke.boardId);
    let pending = this.phase !== 'JOINED';
    for (const recipient of recipients) { const link = this.linkFor(recipient.identity.fingerprint); if (!link || !this.send(link, { type: 'board.stroke', document })) pending = true; }
    const key = `${document.stroke.boardId}/${document.stroke.id}`;
    if (pending) {
      const bytes = [...this.boardRetries.values()].reduce((total, item) => total + JSON.stringify(item).length, 0) + JSON.stringify(document).length;
      if ((!this.boardRetries.has(key) && this.boardRetries.size >= LIMITS.queueMessages) || bytes > LIMITS.queueBytes) this.setError('La cola de pizarra está llena. Conserva y exporta tus notas locales.');
      else { this.boardRetries.set(key, document); this.setError('Trabajas sin todos los enlaces; tus trazos pendientes todavía no se comparten con todos.'); }
    } else this.boardRetries.delete(key);
  }
  private reconcileMesh(): void {
    if (this.phase !== 'JOINED' || !this.endpoint) return;
    for (const link of [...this.links]) if (link.approved && link.identity && !this.members.has(link.identity.fingerprint)) this.closeLink(link, false);
    for (const member of this.members.values()) {
      const id = member.identity.fingerprint;
      if (id === this.id || id === this.hostId || !member.connected || this.isHost || this.id > id) continue;
      this.connect(member.endpoint, 'mesh', member.identity);
    }
  }
  /** Sends this link my media token and my current private-call intent. */
  private announceMedia(link: Link): void {
    this.send(link, { type: 'media.token', token: link.receiveToken });
    this.send(link, { type: 'media.private', with: this.privateWith });
  }

  /** The partner of `id` in a private call, only when both chose each other. */
  private partnerOf(id: string): string | null {
    const wants = (who: string) => who === this.id ? this.privateWith : this.privateOf.get(who) ?? null;
    const partner = wants(id);
    if (!partner || partner === id) return null;
    const partnerMember = this.members.get(partner);
    if (!partnerMember?.connected || !this.members.get(id)?.connected) return null;
    return wants(partner) === id ? partner : null;
  }

  requestPrivate(identityId: string | null): void {
    if (this.phase !== 'JOINED') return;
    if (identityId !== null && (identityId === this.id || !this.members.get(identityId)?.connected)) {
      this.setError('Esa persona ya no está en la aldea.'); return;
    }
    if (this.privateWith === identityId) return;
    this.privateWith = identityId;
    for (const link of this.links) if (link.approved && link.authenticated && !link.closed) this.send(link, { type: 'media.private', with: identityId });
    this.syncMedia(); this.notify();
  }

  private syncMedia(): void {
    const self = this.members.get(this.id);
    if (this.phase !== 'JOINED' || !self?.connected || this.leaving) { this.media.setContext(null); return; }

    // Board sync follows the house you are standing in, independent of voice.
    for (const link of this.links) {
      const peer = link.identity ? this.members.get(link.identity.fingerprint) : undefined;
      const together = !!self.houseId && !!peer?.connected && peer.houseId === self.houseId;
      if (together && self.houseId && link.syncRoom !== self.houseId) {
        link.syncRoom = self.houseId; link.syncExpected = 0;
        this.send(link, { type: 'board.sync.request', boardId: self.houseId, cursor: 0 });
      } else if (!together) { link.syncRoom = undefined; link.syncExpected = undefined; link.syncExport = undefined; }
    }

    // Voice: a mutual private call wins; otherwise you talk to everyone in the
    // same place (the open village, or the same house) who is not in a call.
    const partner = this.partnerOf(this.id);
    let room: string; let roomName: string; let audience: string[];
    if (partner) {
      room = `pair:${[this.id, partner].sort().join(':')}`;
      roomName = `Privado con ${this.members.get(partner)?.identity.displayName ?? 'alguien'}`;
      audience = [partner];
    } else {
      room = self.houseId ? `house:${self.houseId}` : 'village';
      roomName = self.houseId ? `Casa: ${this.houses.get(self.houseId)?.house.name ?? 'Casa'}` : 'La aldea';
      audience = [...this.members.values()]
        .filter(member => member.identity.fingerprint !== this.id && member.connected && member.houseId === self.houseId && !this.partnerOf(member.identity.fingerprint))
        .map(member => member.identity.fingerprint);
    }
    const peers: MediaPeer[] = [];
    for (const id of audience) {
      const member = this.members.get(id); const link = this.linkFor(id);
      if (!member || !link?.sendToken) continue;
      peers.push({ identityId: id, endpoint: member.endpoint, sendToken: link.sendToken, receiveToken: link.receiveToken });
    }
    this.media.setContext({ sessionId: this.sessionId!, epoch: this.epoch, identityId: this.id, room, roomName, peers });
  }
  toggleMicrophone(): Promise<void> { return this.media.toggleMicrophone(); }
  setMuted(value: boolean): void { this.media.setMuted(value); }
  setDeafened(value: boolean): void { this.media.setDeafened(value); }
  setPushToTalk(value: boolean): void { this.media.setPushToTalk(value); }
  setTalking(value: boolean): void { this.media.setTalking(value); }
  startScreen(): Promise<void> { return this.media.startScreen(); }
  stopScreen(): void { this.media.stopScreen(); }

  private linkClosed(link: Link): void {
    if (link.closed) return;
    link.closed = true; this.links.delete(link); link.wire.close(false);
    for (const unsubscribe of link.unsubscribe) unsubscribe();
    if (this.leaving || this.disposed) return;
    const id = link.identity?.fingerprint;
    if (link.approved && id && this.members.has(id)) {
      if (this.isHost) {
        const member = this.members.get(id)!; member.connected = false;
        this.memberDeadlines.set(id, this.clock.now() + LIMITS.hostGraceMs);
        this.rosterChanged();
      } else if (id === this.hostId) {
        this.hostDeadline ??= this.clock.now() + LIMITS.hostGraceMs;
        this.phase = 'RECONNECTING'; this.media.suspend();
        this.error = 'Se perdió el anfitrión. Se conserva la sesión durante 60 segundos y se exige autenticación al volver.';
      }
    } else if (!this.isHost && link.initiator && link.intent === 'join' && this.phase !== 'DENIED') this.finish('NETWORK_FAILED', 'La conexión no se autenticó o la invitación fue revocada.');
    this.syncMedia(); this.notify();
  }
  private closeLink(link: Link, unexpected: boolean): void {
    if (link.closed) return;
    if (unexpected) { link.wire.close(); this.linkClosed(link); return; }
    link.closed = true; this.links.delete(link); for (const unsubscribe of link.unsubscribe) unsubscribe(); link.wire.close();
  }
  private forgetPrivate(identityId: string): void {
    this.privateOf.delete(identityId);
    if (this.privateWith === identityId) this.privateWith = null;
  }
  private removeLocalMember(identityId: string): void {
    this.forgetPrivate(identityId);
    const link = this.linkFor(identityId); if (link) this.closeLink(link, false);
    this.houses.delete(identityId); this.memberDeadlines.delete(identityId);
    if (identityId !== this.id) this.board.removeBoard(identityId);
    for (const [id, visit] of this.visits) if (visit.houseId === identityId || visit.visitorId === identityId) this.visits.delete(id);
  }
  private removeMember(identityId: string): void {
    if (!this.members.has(identityId) || identityId === this.id) return;
    this.members.delete(identityId); this.houses.delete(identityId); this.memberDeadlines.delete(identityId);
    this.forgetPrivate(identityId);
    for (const member of this.members.values()) if (member.houseId === identityId) member.houseId = null;
    for (const [id, visit] of this.visits) if (visit.houseId === identityId || visit.visitorId === identityId) this.visits.delete(id);
    this.board.removeBoard(identityId); this.rosterChanged();
  }
  private startTick(): void {
    if (this.tickTimer) this.clock.clearTimeout(this.tickTimer);
    const generation = this.generation;
    const tick = () => {
      if (generation !== this.generation || this.disposed) return;
      const now = this.clock.now();
      if (this.hostDeadline !== null && now >= this.hostDeadline) { this.finish('CLOSED', 'El anfitrión no regresó en 60 segundos. La sesión terminó.'); return; }
      for (const link of [...this.links]) {
        if ((!link.authenticated && now - link.created >= 15_000) || (link.authenticated && now - link.lastSeen >= 10_000) || (!link.approved && now - link.created >= 120_000)) { this.closeLink(link, true); continue; }
        if (link.authenticated && now - link.lastHeartbeat >= 2_000) { link.lastHeartbeat = now; this.send(link, { type: 'session.heartbeat', reply: false }); }
      }
      if (this.isHost) for (const [id, deadline] of [...this.memberDeadlines]) if (now >= deadline) this.removeMember(id);
      for (const [id, visit] of this.visits) if (now - visit.created >= 60_000) this.visits.delete(id);
      if (!this.isHost && this.phase === 'RECONNECTING' && this.invite && now - this.lastReconnect >= 2_000) { this.lastReconnect = now; this.connect(this.invite.endpoint, 'resume', this.hostId!); }
      if (this.phase === 'JOINED') {
        this.reconcileMesh();
        const retry = this.boardRetries.values().next().value; if (retry) this.shareStroke(retry);
      }
      if (this.hostDeadline !== null) this.notify();
      this.tickTimer = this.clock.setTimeout(tick, this.hostDeadline === null ? 250 : Math.min(250, Math.max(0, this.hostDeadline - this.clock.now())));
    };
    this.tickTimer = this.clock.setTimeout(tick, 250);
  }
  async leave(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true; this.media.suspend();
    if (this.isHost && this.phase === 'JOINED') {
      this.broadcast({ type: 'session.closed' });
      await new Promise<void>(resolve => this.clock.setTimeout(resolve, 100));
    } else if (this.hostLink() && this.phase === 'JOINED') {
      this.leaveRequest = randomId();
      await new Promise<void>(resolve => {
        let done = false;
        const complete = () => { if (done) return; done = true; this.clock.clearTimeout(timeout); this.leaveResolve = undefined; resolve(); };
        const timeout = this.clock.setTimeout(complete, LIMITS.leaveAckMs); this.leaveResolve = complete;
        this.sendHost({ type: 'session.leave', requestId: this.leaveRequest! });
      });
    }
    this.finish('CLOSED', null);
  }
  private finish(phase: SessionPhase, error: string | null): void { this.reset(); this.phase = phase; this.error = error; this.notify(); }
  private reset(): void {
    this.generation++; this.leaving = true; this.media.suspend(); this.leaveResolve?.();
    this.privateWith = null; this.privateOf.clear();
    if (this.tickTimer) this.clock.clearTimeout(this.tickTimer);
    if (this.moveTimer) this.clock.clearTimeout(this.moveTimer);
    this.tickTimer = undefined; this.moveTimer = undefined; this.pendingPosition = undefined;
    for (const link of [...this.links]) this.closeLink(link, false);
    for (const unsubscribe of this.endpointUnsubscribe) unsubscribe(); this.endpointUnsubscribe = [];
    this.endpoint?.destroy(); this.endpoint = undefined;
    this.members.clear(); this.houses.clear(); this.visits.clear(); this.memberDeadlines.clear(); this.boardRetries.clear();
    this.board.retainOwn(this.id); this.localJobs = [];
    this.isHost = false; this.hostId = null; this.sessionId = null; this.epoch = 0; this.invite = null;
    this.rosterRevision = 0; this.hostDeadline = null; this.error = null; this.leaveRequest = undefined; this.leaveResolve = undefined;
    this.leaving = false;
  }
  dispose(): void { if (this.disposed) return; this.reset(); this.media.dispose(); this.disposed = true; this.listeners.clear(); }
}
