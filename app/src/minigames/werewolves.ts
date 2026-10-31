import { pick, secureRandomInt, shuffle, type RoomEngine } from './room';

/**
 * Werewolves (Loup-Garou) as a classic turn-ordered game.
 *
 * Night is called role by role, always in the same order: the wolves choose
 * a victim, the seer looks at one card, the guard protects someone and the
 * witch may heal the victim or poison anyone. Dawn announces the dead, the
 * village votes in daylight, and the verdict reveals the card of whoever was
 * eliminated. The village wins when no wolf is left; wolves win once they are
 * at least as many as everyone else.
 *
 * The engine is authoritative and only ever hands out per-player views:
 * nobody sees a card they have not earned.
 */

export type WerewolfRole = 'werewolf' | 'seer' | 'guard' | 'witch' | 'villager' | 'cupid' | 'hunter' | 'girl';
export type WerewolvesPhase = 'lobby' | 'reveal' | 'night' | 'dawn' | 'day' | 'verdict' | 'hunter' | 'end';
export type NightStep = 'cupid' | 'wolves' | 'seer' | 'guard' | 'witch';

export const NIGHT_ORDER: readonly NightStep[] = ['cupid', 'wolves', 'seer', 'guard', 'witch'];
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;

export const ROLE_INFO: Record<WerewolfRole, { name: string; plural: string; team: 'aldea' | 'lobos'; goal: string }> = {
  werewolf: { name: 'Hombre lobo', plural: 'Hombres lobo', team: 'lobos', goal: 'Cada noche elige con tu manada a quién atacar. De día, disimula.' },
  seer: { name: 'Vidente', plural: 'Videntes', team: 'aldea', goal: 'Cada noche descubre la carta de una persona.' },
  guard: { name: 'Guardián', plural: 'Guardianes', team: 'aldea', goal: 'Cada noche protege a alguien del ataque. No a la misma persona dos noches seguidas.' },
  witch: { name: 'Bruja', plural: 'Brujas', team: 'aldea', goal: 'Una poción para salvar a la víctima y otra para eliminar a alguien. Una vez cada una.' },
  cupid: { name: 'Cupido', plural: 'Cupidos', team: 'aldea', goal: 'La primera noche une a dos enamorados: si muere uno, muere el otro. Si son de bandos distintos, ganan quedándose solos.' },
  hunter: { name: 'Cazador', plural: 'Cazadores', team: 'aldea', goal: 'Al morir puedes disparar una última vez a otra persona viva.' },
  girl: { name: 'Niña', plural: 'Niñas', team: 'aldea', goal: 'Puedes descubrir un lobo durante su turno. Hay un 33 % de riesgo de que la manada te identifique.' },
  villager: { name: 'Ciudadano', plural: 'Ciudadanos', team: 'aldea', goal: 'Sin poderes: escucha, sospecha y vota bien de día.' },
};

const STEP_ROLE: Record<NightStep, WerewolfRole> = { cupid: 'cupid', wolves: 'werewolf', seer: 'seer', guard: 'guard', witch: 'witch' };
export const STEP_CALL: Record<NightStep, string> = {
  cupid: 'Cupido elige a dos enamorados',
  wolves: 'Los hombres lobo despiertan y eligen a su víctima',
  seer: 'La vidente despierta y mira una carta',
  guard: 'El guardián despierta y protege a alguien',
  witch: 'La bruja despierta y decide sus pociones',
};

/** Milliseconds each phase or night turn may last before the game moves on. */
export const DURATIONS = {
  hunter: 25_000, cupid: 30_000, reveal: 15_000, wolves: 40_000, seer: 25_000, guard: 25_000, witch: 30_000,
  dawn: 8_000, day: 120_000, verdict: 8_000,
} as const;

/** Bots answer after a short, random pause so they read like players. */
const BOT_DELAY: readonly [number, number] = [1_500, 4_000];
const BOT_NAMES = ['Lupe', 'Bruno', 'Iris', 'Tomás', 'Nora', 'Gael', 'Vera', 'Olmo', 'Rita', 'Dante'];
const BOT_COLORS = ['#c96f53', '#5f8f6b', '#6a7fc1', '#b58a3e', '#9a6bb5', '#4d9aa3', '#c25b7a', '#7d8f3f'];

export function roleDeck(playerCount: number): WerewolfRole[] {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`Se juega con ${MIN_PLAYERS} a ${MAX_PLAYERS} personas (puedes completar con bots).`);
  }
  const deck: WerewolfRole[] = ['werewolf', 'seer', 'guard'];
  if (playerCount >= 5) deck.push('witch');
  if (playerCount >= 6) deck.push('werewolf');
  while (deck.length < playerCount) deck.push('villager');
  return deck;
}

export type RoleCounts = Partial<Record<WerewolfRole, number>>;
export function configuredDeck(playerCount: number, counts: RoleCounts): WerewolfRole[] {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) throw new Error('Se necesitan entre 4 y 8 jugadores.');
  const deck: WerewolfRole[] = [];
  for (const role of Object.keys(ROLE_INFO) as WerewolfRole[]) {
    if (role === 'villager') continue;
    const count = counts[role] ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > (role === 'werewolf' ? 3 : 1)) throw new Error('Cantidad de cartas no válida.');
    for (let i = 0; i < count; i++) deck.push(role);
  }
  if (deck.length > playerCount) throw new Error('Hay más cartas elegidas que jugadores.');
  const wolves = deck.filter(r => r === 'werewolf').length;
  if (!wolves || wolves * 2 >= playerCount) throw new Error('Elige al menos un lobo, sin mayoría inicial.');
  while (deck.length < playerCount) deck.push('villager');
  return deck;
}
export function presetRoles(name: string, players: number): RoleCounts {
  const wolves = players >= 6 ? 2 : 1;
  if (name === 'bonds') return { werewolf: wolves, cupid: 1, seer: 1, ...(players >= 6 ? { girl: 1 } : {}) };
  if (name === 'classic') return { werewolf: wolves, seer: 1, ...(players >= 5 ? { witch: 1 } : {}), ...(players >= 6 ? { hunter: 1 } : {}) };
  return { werewolf: wolves, seer: 1 };
}

export interface WerewolfPlayer {
  id: string; name: string; color: string; bot: boolean;
  alive: boolean; role: WerewolfRole | null; ready: boolean;
}

export interface LogEntry { icon: 'moon' | 'sun' | 'skull' | 'vote' | 'trophy' | 'info'; text: string }

export type WerewolvesAction =
  | { kind: 'join'; name: string; color: string }
  | { kind: 'leave' }
  | { kind: 'add_bot' }
  | { kind: 'remove_bot'; id: string }
  | { kind: 'configure'; counts: RoleCounts }
  | { kind: 'cupid'; targets: [string, string] }
  | { kind: 'peek'; spy: boolean }
  | { kind: 'hunter'; target: string | null }
  | { kind: 'start' }
  | { kind: 'ready' }
  | { kind: 'wolf_vote'; target: string }
  | { kind: 'seer_look'; target: string }
  | { kind: 'guard'; target: string }
  | { kind: 'witch'; heal: boolean; poison: string | null }
  | { kind: 'vote'; target: string | 'skip' }
  | { kind: 'continue' }
  | { kind: 'play_again' };

export interface WerewolvesTurn {
  step: NightStep;
  /** Who can be chosen this turn. */
  targets: string[];
  victim: string | null;
  canHeal: boolean;
  canPoison: boolean;
  lastGuarded: string | null;
}

export interface WerewolvesView {
  phase: WerewolvesPhase;
  step: NightStep | null;
  round: number;
  remainingMs: number;
  leaderId: string | null;
  me: { id: string; seated: boolean; alive: boolean; role: WerewolfRole | null; acted: boolean; isLeader: boolean };
  players: {
    id: string; name: string; color: string; bot: boolean; alive: boolean;
    /** Only what the viewer is entitled to know. */
    role: WerewolfRole | null;
    ready: boolean;
    /** Public during the day: who this player is voting for. */
    votesFor: string | null;
    /** Wolves see each other's choices during their turn. */
    wolfTarget: string | null;
  }[];
  deck: WerewolfRole[];
  /** The viewer's own night turn, or null while someone else is awake. */
  turn: WerewolvesTurn | null;
  seerSeen: { id: string; role: WerewolfRole }[];
  nightDeaths: string[];
  verdict: { id: string | null; tie: boolean } | null;
  winner: 'aldea' | 'lobos' | 'lovers' | null;
  counts: RoleCounts; deckError: string | null; loverId: string | null; peeked: string[]; hunterTargets: string[];
  log: LogEntry[];
}

interface Night {
  wolfVotes: Map<string, string>;
  victim: string | null;
  guarded: string | null;
  healed: boolean;
  poisoned: string | null;
  acted: Set<string>;
}

const emptyNight = (): Night => ({ wolfVotes: new Map(), victim: null, guarded: null, healed: false, poisoned: null, acted: new Set() });

export class WerewolvesGame implements RoomEngine<WerewolvesAction, WerewolvesView> {
  phase: WerewolvesPhase = 'lobby';
  step: NightStep | null = null;
  round = 0;
  players: WerewolfPlayer[] = [];
  private leaderId: string | null = null;
  private deadline = 0;
  private botAt = 0;
  private night: Night = emptyNight();
  private lastGuarded: string | null = null;
  private healLeft = true;
  private poisonLeft = true;
  private seerSeen = new Map<string, WerewolfRole>();
  private nightDeaths: string[] = [];
  private votes = new Map<string, string>();
  private verdict: { id: string | null; tie: boolean } | null = null;
  private winner: 'aldea' | 'lobos' | 'lovers' | null = null;
  private deck: WerewolfRole[] = [];
  private log: LogEntry[] = [];
  private counts: RoleCounts | null = null;
  private lovers: [string, string] | null = null;
  private peeks = new Map<string, Set<string>>();
  private exposedGirls = new Set<string>();
  private hunters: string[] = [];
  private spentHunters = new Set<string>();
  private resumeAfterDeath: 'dawn' | 'verdict' = 'dawn';

  constructor(private readonly random: (max: number) => number = secureRandomInt, private readonly authorityId: string | null = null) {}

  cancel(): void {
    this.phase = 'lobby';
    this.step = null; this.round = 0; this.deadline = 0; this.deck = []; this.log = [{ icon: 'info', text: 'El anfitrión terminó la partida.' }];
    this.night = emptyNight(); this.votes.clear(); this.seerSeen.clear(); this.winner = null;
    this.lovers = null; this.peeks.clear(); this.exposedGirls.clear(); this.hunters = []; this.spentHunters.clear();
    for (const p of this.players) { p.role = null; p.alive = true; p.ready = false; }
  }

  audience(): string[] { return this.players.filter((p) => !p.bot).map((p) => p.id); }

  apply(actorId: string, action: WerewolvesAction, now: number): void {
    const actor = this.players.find((p) => p.id === actorId);
    switch (action.kind) {
      case 'join': {
        if (actor) return;
        if (this.phase !== 'lobby') throw new Error('La partida ya empezó. Espera a la siguiente.');
        if (this.players.length >= MAX_PLAYERS) throw new Error('La mesa está completa.');
        this.players.push({
          id: actorId, name: cleanName(action.name), color: cleanColor(action.color),
          bot: false, alive: true, role: null, ready: false,
        });
        this.leaderId ??= actorId;
        return;
      }
      case 'leave': {
        if (!actor) return;
        if (this.phase === 'lobby') {
          this.players = this.players.filter((p) => p.id !== actorId);
        } else if (actor.alive) {
          actor.alive = false;
          this.say('info', `${actor.name} abandona la partida.`);
          this.afterDeaths(now);
        }
        if (this.leaderId === actorId) this.leaderId = this.players.find((p) => !p.bot && p.id !== actorId)?.id ?? null;
        if (!this.players.some((p) => !p.bot && (this.phase === 'lobby' || p.id !== actorId))) this.reset();
        return;
      }
      case 'add_bot': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') throw new Error('Solo se añaden bots antes de empezar.');
        if (this.players.length >= MAX_PLAYERS) throw new Error('La mesa está completa.');
        const used = new Set(this.players.map((p) => p.name));
        const name = pick(BOT_NAMES.filter((n) => !used.has(n)), this.random) ?? `Bot ${this.players.length + 1}`;
        this.players.push({
          id: `bot:${this.random(1_000_000_000)}`, name, color: pick(BOT_COLORS, this.random)!,
          bot: true, alive: true, role: null, ready: true,
        });
        return;
      }
      case 'remove_bot': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') return;
        this.players = this.players.filter((p) => !(p.bot && p.id === action.id));
        return;
      }
      case 'configure': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') throw new Error('Las cartas se eligen antes de repartir.');
        if (!action.counts || typeof action.counts !== 'object') throw new Error('Set inválido.');
        const next: RoleCounts = {};
        for (const [role, count] of Object.entries(action.counts)) {
          if (role === 'villager') continue;
          if (!Object.hasOwn(ROLE_INFO, role) || !Number.isInteger(count) || count < 0 || count > (role === 'werewolf' ? 3 : 1)) throw new Error('Set inválido.');
          if (role !== 'villager') next[role as WerewolfRole] = count;
        }
        this.counts = next; return;
      }
      case 'peek': {
        if (!actor?.alive || actor.role !== 'girl' || this.phase !== 'night' || this.step !== 'wolves' || this.night.acted.has(actorId)) throw new Error('No puedes espiar ahora.');
        if (action.spy) {
          const wolf = pick(this.alive().filter(p => p.role === 'werewolf'), this.random);
          if (wolf) { const seen = this.peeks.get(actorId) ?? new Set<string>(); seen.add(wolf.id); this.peeks.set(actorId, seen); }
          if (this.random(3) === 0) this.exposedGirls.add(actorId);
        }
        this.night.acted.add(actorId); if (this.stepDone()) this.endStep(now); return;
      }
      case 'hunter': {
        if (this.phase !== 'hunter' || this.hunters[0] !== actorId) throw new Error('No es tu último disparo.');
        if (action.target !== null) this.requireTarget(action.target, p => p.id !== actorId);
        this.hunters.shift();
        if (action.target) { this.players.find(p => p.id === action.target)!.alive = false; this.say('skull', `${actor!.name} dispara a ${this.players.find(p => p.id === action.target)!.name}.`); }
        this.finishDeaths(now, this.resumeAfterDeath); return;
      }
      case 'cupid':
        this.nightAction(this.requireAlive(actor), action, now); return;
      case 'start': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') return;
        this.deck = this.counts ? configuredDeck(this.players.length, this.counts) : roleDeck(this.players.length);
        const cards = shuffle(this.deck, this.random);
        this.players.forEach((p, i) => { p.role = cards[i]; p.alive = true; p.ready = p.bot; });
        this.round = 0;
        this.lovers = null; this.peeks.clear(); this.exposedGirls.clear(); this.hunters = []; this.spentHunters.clear();
        this.healLeft = true;
        this.poisonLeft = true;
        this.lastGuarded = null;
        this.seerSeen.clear();
        this.winner = null;
        this.verdict = null;
        this.log = [{ icon: 'info', text: `Se reparten ${this.players.length} cartas. Mira la tuya sin que nadie te vea.` }];
        this.enter('reveal', now);
        return;
      }
      case 'ready': {
        if (this.phase !== 'reveal' || !actor) return;
        actor.ready = true;
        if (this.players.every((p) => p.ready)) this.beginNight(now);
        return;
      }
      case 'wolf_vote':
      case 'seer_look':
      case 'guard':
      case 'witch':
        this.nightAction(this.requireAlive(actor), action, now);
        return;
      case 'vote': {
        const voter = this.requireAlive(actor);
        if (this.phase !== 'day') throw new Error('Solo se vota de día.');
        if (action.target !== 'skip') this.requireTarget(action.target, (p) => p.id !== voter.id);
        this.votes.set(voter.id, action.target);
        if (this.alive().every((p) => this.votes.has(p.id))) this.closeVote(now);
        return;
      }
      case 'continue': {
        this.requireLeader(actorId);
        if (this.phase === 'dawn' || this.phase === 'verdict') this.deadline = now;
        this.tick(now);
        return;
      }
      case 'play_again': {
        this.requireLeader(actorId);
        if (this.phase !== 'end') return;
        for (const p of this.players) { p.role = null; p.alive = true; p.ready = false; }
        this.phase = 'lobby';
        this.step = null;
        this.deck = [];
        this.log = [];
        return;
      }
    }
  }

  tick(now: number): boolean {
    if (this.phase === 'lobby' || this.phase === 'end') return false;
    let changed = false;
    if (this.phase === 'hunter') {
      const hunter = this.players.find(p => p.id === this.hunters[0]);
      if (now >= this.deadline || (hunter?.bot && now >= this.botAt)) {
        this.apply(hunter!.id, { kind: 'hunter', target: hunter?.bot ? pick(this.alive(), this.random)?.id ?? null : null }, now); return true;
      }
      return false;
    }
    if (this.phase === 'night' && this.step && now >= this.botAt) changed = this.botsAct(now) || changed;
    if (this.phase === 'day' && now >= this.botAt) changed = this.botsVote(now) || changed;
    // Bots may have just ended the game.
    if ((this.phase as WerewolvesPhase) !== 'end' && now >= this.deadline) {
      changed = true;
      switch (this.phase) {
        case 'reveal': this.beginNight(now); break;
        case 'night': this.endStep(now); break;
        case 'dawn': this.enter('day', now); break;
        case 'day': this.closeVote(now); break;
        case 'verdict': this.beginNight(now); break;
      }
    }
    return changed;
  }

  viewFor(viewerId: string, now: number): WerewolvesView {
    const me = this.players.find((p) => p.id === viewerId) ?? null;
    const over = this.phase === 'end';
    const myRole = me?.role ?? null;
    const knows = (p: WerewolfPlayer): WerewolfRole | null => {
      if (!p.role) return null;
      if (over || p.id === viewerId || !p.alive) return p.role;
      if (myRole === 'werewolf' && p.role === 'werewolf') return 'werewolf';
      if (myRole === 'girl' && this.peeks.get(viewerId)?.has(p.id)) return p.role;
      if (myRole === 'werewolf' && this.exposedGirls.has(p.id)) return p.role;
      if (myRole === 'seer') return this.seerSeen.get(p.id) ?? null;
      return null;
    };
    const preview = this.previewDeck();
    const wolfTurn = myRole === 'werewolf' && this.phase === 'night' && this.step === 'wolves';
    const myTurn = !!me && me.alive && this.phase === 'night' && !!this.step && STEP_ROLE[this.step] === myRole;
    const showVotes = this.phase === 'day' || this.phase === 'verdict';
    return {
      phase: this.phase,
      step: this.phase === 'night' ? this.step : null,
      round: this.round,
      remainingMs: this.phase === 'lobby' || over ? 0 : Math.max(0, this.deadline - now),
      leaderId: this.leaderId,
      me: {
        id: viewerId, seated: !!me, alive: !!me?.alive, role: myRole,
        acted: !!me && ((this.phase === 'night' && this.night.acted.has(me.id)) || (this.phase === 'day' && this.votes.has(me.id)) || (this.phase === 'reveal' && me.ready)),
        isLeader: this.leaderId === viewerId || this.authorityId === viewerId,
      },
      players: this.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, bot: p.bot, alive: p.alive, role: knows(p), ready: p.ready,
        votesFor: showVotes ? this.votes.get(p.id) ?? null : null,
        wolfTarget: wolfTurn ? this.night.wolfVotes.get(p.id) ?? null : null,
      })),
      deck: this.deck.length ? [...this.deck] : preview.deck,
      counts: this.counts ?? Object.fromEntries(Object.keys(ROLE_INFO).map(role => [role, preview.deck.filter(r => r === role).length])), deckError: preview.error,
      loverId: this.lovers?.includes(viewerId) ? this.lovers.find(id => id !== viewerId)! : null,
      peeked: myRole === 'girl' ? [...(this.peeks.get(viewerId) ?? [])] : [],
      hunterTargets: this.phase === 'hunter' && this.hunters[0] === viewerId ? this.alive().map(p => p.id) : [],
      turn: myTurn && this.step ? this.turnFor(me!, this.step) : null,
      seerSeen: myRole === 'seer' || over ? [...this.seerSeen].map(([id, role]) => ({ id, role })) : [],
      nightDeaths: this.phase === 'dawn' || this.phase === 'day' ? [...this.nightDeaths] : [],
      verdict: this.phase === 'verdict' || over ? this.verdict : null,
      winner: this.winner,
      log: this.log.slice(-30),
    };
  }

  private turnFor(me: WerewolfPlayer, step: NightStep): WerewolvesTurn {
    const alive = this.alive();
    const base = { step, victim: null, canHeal: false, canPoison: false, lastGuarded: null };
    switch (step) {
      case 'cupid': return { ...base, targets: alive.map(p => p.id) };
      case 'wolves': return { ...base, targets: alive.filter((p) => p.role !== 'werewolf').map((p) => p.id) };
      case 'seer': return { ...base, targets: alive.filter((p) => p.id !== me.id && !this.seerSeen.has(p.id)).map((p) => p.id) };
      case 'guard': return { ...base, targets: alive.filter((p) => p.id !== this.lastGuarded).map((p) => p.id), lastGuarded: this.lastGuarded };
      case 'witch': return {
        ...base,
        targets: alive.filter((p) => p.id !== me.id).map((p) => p.id),
        victim: this.night.victim,
        canHeal: this.healLeft && !!this.night.victim,
        canPoison: this.poisonLeft,
      };
    }
  }

  private nightAction(actor: WerewolfPlayer, action: WerewolvesAction, now: number): void {
    const step = this.step;
    if (this.phase !== 'night' || !step || STEP_ROLE[step] !== actor.role) throw new Error('No es tu turno. Mantén los ojos cerrados.');
    if (this.night.acted.has(actor.id) && step !== 'wolves') throw new Error('Ya has actuado esta noche.');
    const turn = this.turnFor(actor, step);
    if (action.kind === 'cupid' && step === 'cupid') {
      if (!Array.isArray(action.targets) || action.targets.length !== 2 || action.targets[0] === action.targets[1] || action.targets.some(id => !turn.targets.includes(id))) throw new Error('Elige dos personas distintas.');
      this.lovers = [...action.targets];
    } else if (action.kind === 'wolf_vote' && step === 'wolves') {
      if (!turn.targets.includes(action.target)) throw new Error('Esa persona no puede ser atacada.');
      this.night.wolfVotes.set(actor.id, action.target);
    } else if (action.kind === 'seer_look' && step === 'seer') {
      if (!turn.targets.includes(action.target)) throw new Error('Elige a otra persona viva que no hayas mirado.');
      const target = this.players.find((p) => p.id === action.target)!;
      this.seerSeen.set(target.id, target.role!);
    } else if (action.kind === 'guard' && step === 'guard') {
      if (!turn.targets.includes(action.target)) throw new Error('No puedes proteger a la misma persona dos noches seguidas.');
      this.night.guarded = action.target;
    } else if (action.kind === 'witch' && step === 'witch') {
      if (action.heal && !turn.canHeal) throw new Error('No hay víctima que salvar o ya usaste la poción de vida.');
      if (action.poison !== null && (!turn.canPoison || !turn.targets.includes(action.poison))) throw new Error('No puedes envenenar a esa persona.');
      if (action.heal) { this.night.healed = true; this.healLeft = false; }
      if (action.poison) { this.night.poisoned = action.poison; this.poisonLeft = false; }
    } else {
      throw new Error('Esa acción no corresponde a este turno.');
    }
    this.night.acted.add(actor.id);
    if (this.stepDone()) this.endStep(now);
  }

  private stepDone(): boolean {
    const step = this.step;
    if (!step) return true;
    if (step === 'wolves' && this.alive().some(p => p.role === 'girl' && !this.night.acted.has(p.id))) return false;
    return this.alive().filter((p) => p.role === STEP_ROLE[step]).every((p) => this.night.acted.has(p.id));
  }

  private beginNight(now: number): void {
    this.round += 1;
    this.night = emptyNight();
    this.nightDeaths = [];
    this.votes.clear();
    this.verdict = null;
    this.phase = 'night';
    this.step = null;
    this.say('moon', `Noche ${this.round}. La aldea cierra los ojos.`);
    this.nextStep(now);
  }

  /** Moves to the next night turn that someone alive can play, or to dawn. */
  private nextStep(now: number): void {
    const from = this.step ? NIGHT_ORDER.indexOf(this.step) + 1 : 0;
    for (const step of NIGHT_ORDER.slice(from)) {
      if (step === 'cupid' && this.round > 1) continue;
      if (this.alive().some((p) => p.role === STEP_ROLE[step])) {
        this.step = step;
        this.deadline = now + DURATIONS[step];
        this.botAt = now + this.botDelay();
        return;
      }
    }
    this.step = null;
    this.resolveNight(now);
  }

  private endStep(now: number): void {
    if (this.step === 'wolves') this.night.victim = this.wolfChoice();
    this.nextStep(now);
  }

  private wolfChoice(): string | null {
    const counts = new Map<string, number>();
    for (const target of this.night.wolfVotes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    // A split pack settles it by chance, never by seat order.
    return pick([...counts].filter(([, n]) => n === best && best > 0).map(([id]) => id), this.random) ?? null;
  }

  private resolveNight(now: number): void {
    const deaths = new Set<string>();
    const victim = this.night.victim;
    if (victim && victim !== this.night.guarded && !this.night.healed) deaths.add(victim);
    if (this.night.poisoned) deaths.add(this.night.poisoned);
    this.lastGuarded = this.night.guarded;
    this.nightDeaths = [...deaths].filter((id) => this.players.some((p) => p.id === id && p.alive));
    for (const id of this.nightDeaths) this.players.find((p) => p.id === id)!.alive = false;
    if (!this.nightDeaths.length) this.say('sun', 'Amanece y nadie ha muerto esta noche.');
    for (const id of this.nightDeaths) {
      const p = this.players.find((x) => x.id === id)!;
      this.say('skull', `${p.name} aparece sin vida. Su carta: ${ROLE_INFO[p.role!].name}.`);
    }
    this.finishDeaths(now, 'dawn');
  }

  private closeVote(now: number): void {
    const tally = new Map<string, number>();
    for (const target of this.votes.values()) tally.set(target, (tally.get(target) ?? 0) + 1);
    const best = Math.max(0, ...tally.values());
    const top = [...tally].filter(([, n]) => n === best && best > 0).map(([id]) => id);
    const chosen = top.length === 1 && top[0] !== 'skip' ? top[0] : null;
    this.verdict = { id: chosen, tie: top.length > 1 };
    if (chosen) {
      const p = this.players.find((x) => x.id === chosen)!;
      p.alive = false;
      this.say('vote', `La aldea elimina a ${p.name} con ${best} voto${best === 1 ? '' : 's'}. Su carta: ${ROLE_INFO[p.role!].name}.`);
    } else {
      this.say('vote', top.length > 1 ? 'Empate en la votación: nadie es eliminado hoy.' : 'La aldea decide no eliminar a nadie hoy.');
    }
    this.finishDeaths(now, 'verdict');
  }

  private afterDeaths(now: number): void {
    if (this.checkWin()) return;
    if (this.phase === 'night' && this.stepDone()) this.endStep(now);
    else if (this.phase === 'day' && this.alive().every((p) => this.votes.has(p.id))) this.closeVote(now);
  }

  private previewDeck(): { deck: WerewolfRole[]; error: string | null } {
    try { return { deck: this.counts ? configuredDeck(Math.max(MIN_PLAYERS, this.players.length), this.counts) : roleDeck(Math.max(MIN_PLAYERS, this.players.length)), error: null }; }
    catch (e) { return { deck: [], error: e instanceof Error ? e.message : 'Set inválido.' }; }
  }

  private finishDeaths(now: number, resume: 'dawn' | 'verdict'): void {
    this.resumeAfterDeath = resume;
    if (this.lovers) {
      const pair = this.lovers.map(id => this.players.find(p => p.id === id)!);
      if (pair.some(p => !p.alive)) for (const p of pair) if (p.alive) { p.alive = false; this.nightDeaths.push(p.id); this.say('skull', `${p.name} muere por su vínculo.`); }
    }
    for (const p of this.players) if (!p.alive && p.role === 'hunter' && !this.spentHunters.has(p.id)) { this.spentHunters.add(p.id); this.hunters.push(p.id); }
    if (this.hunters.length) { this.phase = 'hunter'; this.step = null; this.deadline = now + DURATIONS.hunter; this.botAt = now + 1800; return; }
    if (!this.checkWin()) this.enter(resume, now);
  }

  private checkWin(): boolean {
    const alive = this.alive();
    const wolves = alive.filter((p) => p.role === 'werewolf').length;
    if (this.lovers && alive.length === 2 && this.lovers.every(id => alive.some(p => p.id === id)) && (alive[0].role === 'werewolf') !== (alive[1].role === 'werewolf')) this.winner = 'lovers';
    else if (wolves === 0) this.winner = 'aldea';
    else if (wolves >= alive.length - wolves) this.winner = 'lobos';
    else return false;
    this.phase = 'end';
    this.step = null;
    this.say('trophy', this.winner === 'lovers' ? '¡Ganan los enamorados!' : this.winner === 'aldea' ? '¡Gana la aldea! No queda ningún hombre lobo.' : '¡Ganan los hombres lobo! Ya son tantos como los aldeanos.');
    return true;
  }

  private enter(phase: 'reveal' | 'dawn' | 'day' | 'verdict', now: number): void {
    this.phase = phase;
    this.step = null;
    this.deadline = now + DURATIONS[phase];
    if (phase === 'day') {
      this.votes.clear();
      this.botAt = now + 4_000 + this.random(6_000);
      this.say('sun', `Día ${this.round}. Debatid y votad a quién eliminar.`);
    }
  }

  private botsAct(now: number): boolean {
    const step = this.step!;
    let changed = false;
    if (step === 'wolves') for (const girl of this.alive().filter(p => p.bot && p.role === 'girl' && !this.night.acted.has(p.id))) { this.apply(girl.id, { kind: 'peek', spy: this.random(2) === 0 }, now); changed = true; }
    const bots = this.alive().filter((p) => p.bot && p.role === STEP_ROLE[step] && !this.night.acted.has(p.id));
    if (!bots.length) return changed;
    for (const bot of bots) {
      if (this.phase !== 'night' || this.step !== step) break;
      const turn = this.turnFor(bot, step);
      if (step === 'cupid') { const targets = shuffle(turn.targets, this.random).slice(0, 2) as [string, string]; this.nightAction(bot, { kind: 'cupid', targets }, now); continue; }
      if (step === 'witch') {
        const heal = turn.canHeal && this.random(2) === 0;
        const poison = turn.canPoison && this.random(5) === 0 ? pick(turn.targets, this.random) ?? null : null;
        this.nightAction(bot, { kind: 'witch', heal, poison }, now);
        continue;
      }
      // A bot wolf follows a packmate's choice half the time, like a real pack.
      const packChoice = step === 'wolves' ? pick([...this.night.wolfVotes.values()], this.random) : undefined;
      const target = packChoice && this.random(2) === 0 ? packChoice : pick(turn.targets, this.random);
      if (!target) { this.night.acted.add(bot.id); continue; }
      const kind = step === 'wolves' ? 'wolf_vote' : step === 'seer' ? 'seer_look' : 'guard';
      this.nightAction(bot, { kind, target }, now);
    }
    if (this.phase === 'night' && this.step === step && this.stepDone()) this.endStep(now);
    return true;
  }

  private botsVote(now: number): boolean {
    const bots = this.alive().filter((p) => p.bot && !this.votes.has(p.id));
    if (!bots.length) return false;
    // One bot at a time, so votes trickle in instead of landing together.
    const bot = pick(bots, this.random)!;
    const others = this.alive().filter((p) => p.id !== bot.id && !(bot.role === 'werewolf' && p.role === 'werewolf'));
    const leaning = [...this.votes.values()].filter((t) => others.some((p) => p.id === t));
    const target = leaning.length && this.random(3) === 0 ? pick(leaning, this.random)! : pick(others, this.random)?.id ?? 'skip';
    this.votes.set(bot.id, target);
    this.botAt = now + 1_500 + this.random(4_000);
    if (this.alive().every((p) => this.votes.has(p.id))) this.closeVote(now);
    return true;
  }

  private botDelay(): number { return BOT_DELAY[0] + this.random(BOT_DELAY[1] - BOT_DELAY[0]); }
  private alive(): WerewolfPlayer[] { return this.players.filter((p) => p.alive); }
  private say(icon: LogEntry['icon'], text: string): void { this.log.push({ icon, text }); if (this.log.length > 60) this.log.shift(); }

  private reset(): void {
    this.players = [];
    this.phase = 'lobby';
    this.step = null;
    this.leaderId = null;
    this.deck = [];
    this.log = [];
  }

  private requireLeader(actorId: string): void {
    if (actorId !== this.leaderId && actorId !== this.authorityId) throw new Error('Solo quien abrió la mesa puede hacer eso.');
  }

  private requireAlive(actor: WerewolfPlayer | undefined): WerewolfPlayer {
    if (!actor || !actor.alive) throw new Error('Solo las personas vivas de la partida pueden actuar.');
    return actor;
  }

  private requireTarget(id: string, allowed: (p: WerewolfPlayer) => boolean): void {
    const target = this.players.find((p) => p.id === id);
    if (!target || !target.alive || !allowed(target)) throw new Error('Elige a otra persona viva.');
  }
}

function cleanName(name: string): string { return String(name ?? '').trim().slice(0, 24) || 'Vecino'; }
function cleanColor(color: string): string { return /^#[0-9a-fA-F]{6}$/.test(String(color)) ? color : '#c96f53'; }
