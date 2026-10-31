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
  | { t: 'view'; v: View }
  | { t: 'error'; m: string };

const TICK_MS = 400;

export class SharedRoom<Action, View, Engine extends RoomEngine<Action, View> = RoomEngine<Action, View>> {
  private engine: Engine | null = null;
  private modeKey = '';
  private watchers = new Set<string>();
  private view: View | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offApp: () => void;
  private listeners = new Set<(view: View | null, error: string | null) => void>();

  constructor(
    private readonly channel: AppChannel,
    private readonly actions: Pick<AppActions, 'sendApp' | 'onApp'>,
    private readonly context: () => RoomContext,
    private readonly createEngine: () => Engine,
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
    this.view = null;
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
        this.emit(this.view, error instanceof Error ? error.message : 'Acción no permitida.');
      }
      return;
    }
    if (!this.sendToHost({ t: 'act', a: action })) this.emit(this.view, 'No se pudo contactar con el anfitrión de la aldea.');
  }

  canStop(): boolean { return this.isAuthority(); }
  stop(): void {
    this.sync();
    if (!this.isAuthority() || !this.engine?.cancel) return;
    this.engine.cancel(Date.now());
    this.publish();
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
    this.sync();
    const { hostId } = this.context();
    if (this.engine) {
      // Only the authority accepts requests, and only from real members.
      if (wire.t === 'hello') { this.watchers.add(message.from); this.sendTo(message.from, { t: 'view', v: this.engine.viewFor(message.from, Date.now()) }); return; }
      if (wire.t === 'act') {
        this.watchers.add(message.from);
        try { this.engine.apply(message.from, wire.a, Date.now()); this.publish(); }
        catch (error) { this.sendTo(message.from, { t: 'error', m: error instanceof Error ? error.message.slice(0, 200) : 'Acción no permitida.' }); }
      }
      return;
    }
    if (message.from !== hostId) return;
    if (wire.t === 'view') { this.view = wire.v; this.emit(this.view, null); }
    else if (wire.t === 'error') this.emit(this.view, String(wire.m).slice(0, 200));
  }

  private sendToHost(wire: Wire<Action, View>): boolean {
    const { hostId } = this.context();
    return !!hostId && this.sendTo(hostId, wire);
  }

  private sendTo(id: string, wire: Wire<Action, View>): boolean {
    return this.actions.sendApp(this.channel, id, JSON.stringify(wire));
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
