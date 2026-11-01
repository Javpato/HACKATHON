import { t } from '../i18n';
import { errorMessage } from '../errors/messages';
import type { AppActions, AppChannel, AppMessage } from '../protocol/types';

/**
 * A shared activity run by one authority. Online, the village host runs the
 * engine and every member sees only the view the engine projects for them,
 * so secrets (roles, other people's drawings) never leave the host. Offline,
 * the same engine runs locally, usually with bots.
 */
export interface RoomEngine<Action, View> {
  /** Applies one member's action; throws a user-facing Error when not allowed. */
  apply(actorId: string, action: Action, now: number): void;
  cancel?(now: number): void;
  /** Advances timers and bots; returns true when anything visible changed. */
  tick(now: number): boolean;
  viewFor(viewerId: string, now: number): View;
  /** Humans who should receive views even without having asked. */
  audience(): string[];
}

export interface RoomContext {
  selfId: string;
  /** Host fingerprint while joined to a village, otherwise null (offline). */
  hostId: string | null;
}

type Wire<Action, View> =
  | { t: 'hello' }
  | { t: 'act'; a: Action }
  | { t: 'cmd'; c: RoomCommand; d?: unknown }
  | { t: 'view'; v: View; lead?: boolean }
  | { t: 'jobs'; jobs: unknown[] }
  | { t: 'error'; m: string };

/** Organiser commands. Peer hosts apply them locally; a server applies the same function remotely. */
export type RoomCommand = 'stop' | 'study.setQuiz' | 'bots.enable' | 'bots.disable' | 'bots.submit';
/** Virtual host fingerprint used by a self-hosted server (see server/contracts). */
export const REMOTE_AUTHORITY = '0'.repeat(64);
/** Scope of an activity copy that belongs to one room of one house; '' is the village-wide one. */
export const ACTIVITY_SCOPE = /^room:[a-f0-9]{64}:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{1,32}$/;
export function activityScope(owner: string, floorId: string, roomId: string): string {
  const scope = `room:${owner}:${floorId}:${roomId}`;
  return ACTIVITY_SCOPE.test(scope) ? scope : '';
}

type Commandable = { cancel?(now: number): void; setQuiz?(quiz: unknown): void; setAiBotsEnabled?(on: boolean): void; submitBot?(key: string, id: string, answer: unknown, now: number): boolean; botJobs?(now: number): unknown[] };
/** Returns true when the visible state changed. Throws a user-facing error for anything not allowed. */
export function applyRoomCommand(engine: unknown, command: string, data: unknown, now: number): boolean {
  const target = engine as Commandable;
  if (command === 'stop' && target.cancel) { target.cancel(now); return true; }
  if (command === 'study.setQuiz' && target.setQuiz) { target.setQuiz(data); return true; }
  if ((command === 'bots.enable' || command === 'bots.disable') && target.setAiBotsEnabled) { target.setAiBotsEnabled(command === 'bots.enable'); return true; }
  if (command === 'bots.submit' && target.submitBot) {
    const job = data as { key?: unknown; id?: unknown; answer?: unknown } | null;
    if (typeof job?.key !== 'string' || typeof job.id !== 'string' || !job.answer || typeof job.answer !== 'object') throw new Error('Respuesta de bot inválida.');
    return target.submitBot(job.key, job.id, job.answer, now);
  }
  throw new Error('Esta actividad no admite esa orden.');
}

const TICK_MS = 400;

export class SharedRoom<Action, View, Engine extends RoomEngine<Action, View> = RoomEngine<Action, View>> {
  private engine: Engine | null = null;
  private modeKey = '';
  private watchers = new Set<string>();
  private view: View | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offApp: () => void;
  private listeners = new Set<(view: View | null, error: string | null) => void>();
  /** Server mode: whether the server says I organise this activity. */
  private lead = false;
  private jobWaiters: ((jobs: unknown[]) => void)[] = [];

  constructor(
    private readonly channel: AppChannel,
    private readonly actions: Pick<AppActions, 'sendApp' | 'onApp'> & Partial<Pick<AppActions, 'voiceCommand'>>,
    private readonly context: () => RoomContext,
    private readonly createEngine: () => Engine,
    /** '' is the village-wide activity; a room scope (see activityScope) keeps a separate copy per room. */
    readonly scope: string = '',
  ) {
    this.offApp = actions.onApp((message) => this.receive(message));
  }

  /** Called whenever the session may have changed: going online, offline or a new host. */
  sync(): void {
    const { selfId, hostId } = this.context();
    const key = hostId ? `online:${hostId}` : `local:${selfId}`;
    if (key === this.modeKey) return;
    this.modeKey = key;
    this.engine = this.isAuthority() ? this.createEngine() : null;
    this.watchers.clear();
    this.view = null; this.lead = false;
    this.ensureTimer();
    if (this.engine) this.publish();
    else this.sendToHost({ t: 'hello' });
  }

  subscribe(listener: (view: View | null, error: string | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.view, null);
    return () => { this.listeners.delete(listener); };
  }

  /** Re-requests the current view, for example when the station is opened again. */
  refresh(): void {
    this.sync();
    if (this.engine) this.publish();
    else this.sendToHost({ t: 'hello' });
  }

  act(action: Action): void {
    this.sync();
    if (this.engine) {
      try {
        this.engine.apply(this.context().selfId, action, Date.now());
        this.publish();
      } catch (error) {
        this.emit(this.view, errorMessage(error));
      }
      return;
    }
    if (!this.sendToHost({ t: 'act', a: action })) this.emit(this.view, 'No se pudo contactar con el anfitrión de la aldea.');
  }

  /** The peer host, or in server mode the first participant still present, organises. */
  canLead(): boolean { return this.isAuthority() || (this.remote() && this.lead); }
  canStop(): boolean { return this.canLead(); }
  stop(): void {
    this.sync();
    if (this.remote()) { if (this.lead) this.sendToHost({ t: 'cmd', c: 'stop' }); return; }
    if (!this.isAuthority() || !this.engine?.cancel) return;
    this.engine.cancel(Date.now());
    this.stopVoice();
    this.publish();
  }
  private stopVoice(): void {
    if (this.channel === 'werewolves' || this.channel === 'gartic' || this.channel === 'study') this.actions.voiceCommand?.({ action: 'game.end', game: this.channel });
  }
  /** Organiser command, applied here when this device is the authority, otherwise sent to it. */
  command(command: RoomCommand, data?: unknown): void {
    this.sync();
    if (this.engine) {
      try { if (applyRoomCommand(this.engine, command, data, Date.now())) { if (command === 'stop') this.stopVoice(); this.publish(); } }
      catch (error) { this.emit(this.view, errorMessage(error)); }
      return;
    }
    if (!this.sendToHost({ t: 'cmd', c: command, d: data })) this.emit(this.view, 'No se pudo contactar con el anfitrión de la aldea.');
  }
  /** Pending bot turns, from the local engine or from the server for its organiser. */
  async botJobs(): Promise<unknown[]> {
    this.sync();
    const local = this.engine as unknown as Commandable | null;
    if (local) return local.botJobs?.(Date.now()) ?? [];
    if (!this.remote() || !this.lead) return [];
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.jobWaiters = this.jobWaiters.filter(w => w !== done); resolve([]); }, 5_000);
      const done = (jobs: unknown[]) => { clearTimeout(timer); resolve(jobs); };
      this.jobWaiters.push(done);
      if (!this.sendToHost({ t: 'cmd', c: 'bots.jobs' as RoomCommand })) done([]);
    });
  }

  current(): View | null { return this.view; }

  /** Lets the authority change its own state (housekeeping), publishing if anything changed. */
  mutate(change: (engine: Engine) => boolean): void {
    this.sync();
    if (this.engine && change(this.engine)) this.publish();
  }

  dispose(): void {
    this.offApp();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private remote(): boolean { return this.context().hostId === REMOTE_AUTHORITY; }
  private isAuthority(): boolean {
    const { selfId, hostId } = this.context();
    return hostId === null || hostId === selfId;
  }

  private ensureTimer(): void {
    if (this.engine && !this.timer) {
      this.timer = setInterval(() => {
        if (this.engine?.tick(Date.now())) this.publish();
      }, TICK_MS);
    } else if (!this.engine && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private publish(): void {
    const engine = this.engine;
    if (!engine) return;
    const now = Date.now();
    const { selfId, hostId } = this.context();
    this.view = engine.viewFor(selfId, now);
    this.emit(this.view, null);
    if (!hostId) return;
    const recipients = new Set([...engine.audience(), ...this.watchers]);
    recipients.delete(selfId);
    for (const id of recipients) this.sendTo(id, { t: 'view', v: engine.viewFor(id, now) });
  }

  private receive(message: AppMessage): void {
    if (message.channel !== this.channel) return;
    let wire: Wire<Action, View>;
    try { wire = JSON.parse(message.data) as Wire<Action, View>; } catch { return; }
    if (!wire || typeof wire !== 'object') return;
    if (((wire as { s?: unknown }).s ?? '') !== this.scope) return; // another room's copy of this activity
    this.sync();
    const { hostId } = this.context();
    if (this.engine) {
      // Only the authority accepts requests, and only from real members.
      if (wire.t === 'hello') { this.watchers.add(message.from); this.sendTo(message.from, { t: 'view', v: this.engine.viewFor(message.from, Date.now()) }); return; }
      if (wire.t === 'act') {
        this.watchers.add(message.from);
        try { this.engine.apply(message.from, wire.a, Date.now()); this.publish(); }
        catch (error) { this.sendTo(message.from, { t: 'error', m: errorMessage(error) }); }
      }
      return;
    }
    if (message.from !== hostId) return;
    if (wire.t === 'view') { this.view = wire.v; this.lead = this.remote() && wire.lead === true; this.emit(this.view, null); }
    else if (wire.t === 'jobs') { const waiters = this.jobWaiters.splice(0); for (const done of waiters) done(Array.isArray(wire.jobs) ? wire.jobs : []); }
    else if (wire.t === 'error') this.emit(this.view, t(String(wire.m).slice(0, 200)));
  }

  private sendToHost(wire: Wire<Action, View>): boolean {
    const { hostId } = this.context();
    return !!hostId && this.sendTo(hostId, wire);
  }

  private sendTo(id: string, wire: Wire<Action, View>): boolean {
    return this.actions.sendApp(this.channel, id, JSON.stringify(this.scope ? { ...wire, s: this.scope } : wire));
  }

  private emit(view: View | null, error: string | null): void {
    for (const listener of this.listeners) listener(view, error);
  }
}

/** Uniform integer in [0, max) from the platform CSPRNG. */
export function secureRandomInt(max: number): number {
  if (max <= 1) return 0;
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % max;
}

export function shuffle<T>(items: readonly T[], random: (max: number) => number = secureRandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], random: (max: number) => number = secureRandomInt): T | undefined {
  return items.length ? items[random(items.length)] : undefined;
}
