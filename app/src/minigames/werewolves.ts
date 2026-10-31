import { BaseMinigameLobby, type MinigameParticipant } from './framework';

/**
 * Part 5 — Multiplayer Game: Werewolves / Loup-Garou
 *
 * Playable multiplayer social deduction game launched from the community
 * campfire table, tailored for small groups (3–6 players).
 *
 * Features:
 * - Secret role assignment (`villager`, `werewolf`, `seer`, `doctor`, `witch`)
 * - Night Phase with role-specific private actions
 * - Authoritative Night resolution (Werewolf target vs Doctor protection / Witch potions)
 * - Day Phase discussion & single-vote enforcement per living player
 * - Elimination & tie handling
 * - Victory condition checks (Villagers win when all Werewolves are eliminated;
 *   Werewolves win when Werewolves >= living Villagers)
 * - Strict Secret-Role Privacy (`projectWerewolvesViewForPlayer`): a player NEVER
 *   receives another player's secret role or private night actions until `FINISHED`.
 */

export type WerewolfRole = 'werewolf' | 'villager' | 'seer' | 'doctor' | 'witch';

export type WerewolvesGameSubPhase =
  | 'LOBBY'
  | 'ROLE_REVEAL'
  | 'NIGHT'
  | 'DAY_ANNOUNCEMENT'
  | 'DAY_DISCUSSION'
  | 'DAY_VOTING'
  | 'VOTE_RESOLUTION'
  | 'FINISHED'
  | 'CANCELLED';

export interface WerewolvesSettings {
  discussionSeconds: number;
  votingSeconds: number;
  nightSeconds: number;
  revealRoleOnElimination: boolean;
  enableSeer: boolean;
  enableDoctor: boolean;
  enableWitch: boolean;
}

export interface WerewolvesPlayerState {
  id: string;
  displayName: string;
  color: string;
  isBot: boolean;
  alive: boolean;
  connected: boolean;
  role: WerewolfRole;
}

export interface NightActionRecord {
  werewolfVotes: Record<string, string>; // wolfId -> targetId
  seerTargetId: string | null;
  seerResult: { targetId: string; isWerewolf: boolean; role: WerewolfRole } | null;
  doctorTargetId: string | null;
  witchSaveUsedThisNight: boolean;
  witchPoisonTargetId: string | null;
}

export interface WerewolvesAuthoritativeState {
  sessionId: string;
  leaderId: string;
  subPhase: WerewolvesGameSubPhase;
  dayNumber: number;
  settings: WerewolvesSettings;
  players: WerewolvesPlayerState[];
  nightActions: NightActionRecord;
  witchSaveRemaining: boolean;
  witchPoisonRemaining: boolean;
  dayVotes: Record<string, string | 'abstain'>; // voterId -> targetId | 'abstain'
  eliminatedLastNight: { id: string; displayName: string; role?: WerewolfRole }[];
  eliminatedLastVote: { id: string; displayName: string; role?: WerewolfRole } | null;
  winner: 'villagers' | 'werewolves' | null;
  winReason: string | null;
  publicLog: string[];
}

/**
 * Filtered view safe to send/render for a single `viewerId`.
 * Never exposes secret roles of other living players (except fellow werewolves)
 * before the game reaches `FINISHED`.
 */
export interface WerewolvesPlayerView {
  sessionId: string;
  leaderId: string;
  subPhase: WerewolvesGameSubPhase;
  dayNumber: number;
  settings: WerewolvesSettings;
  ownId: string;
  ownRole: WerewolfRole | null;
  ownAlive: boolean;
  players: {
    id: string;
    displayName: string;
    color: string;
    isBot: boolean;
    alive: boolean;
    connected: boolean;
    /** Only populated if viewer is self, fellow werewolf, game is FINISHED, or player is eliminated & revealRoleOnElimination is true */
    knownRole: WerewolfRole | null;
    hasVotedToday: boolean;
  }[];
  seerInspectionResult: { targetId: string; targetName: string; isWerewolf: boolean; role: WerewolfRole } | null;
  witchPreviewVictimId: string | null;
  witchSaveRemaining: boolean;
  witchPoisonRemaining: boolean;
  dayVotes: Record<string, string | 'abstain'>;
  eliminatedLastNight: { id: string; displayName: string; role?: WerewolfRole }[];
  eliminatedLastVote: { id: string; displayName: string; role?: WerewolfRole } | null;
  winner: 'villagers' | 'werewolves' | null;
  winReason: string | null;
  publicLog: string[];
}

export const WEREWOLF_ROLE_LABELS: Record<WerewolfRole, { name: string; team: 'Aldea' | 'Lobos'; description: string }> = {
  werewolf: {
    name: '🐺 Hombre Lobo',
    team: 'Lobos',
    description: 'Cada noche eliges en secreto a una víctima. Durante el día finges ser un aldeano más.',
  },
  villager: {
    name: '🏡 Aldeano',
    team: 'Aldea',
    description: 'Observa las pistas, debate durante el día y vota para descubrir al Hombre Lobo.',
  },
  seer: {
    name: '🔮 Vidente',
    team: 'Aldea',
    description: 'Cada noche puedes consultar la verdadera identidad de un jugador vivo.',
  },
  doctor: {
    name: '🛡️ Guardián / Doctor',
    team: 'Aldea',
    description: 'Cada noche eliges proteger a un jugador del ataque de los Hombres Lobo.',
  },
  witch: {
    name: '🧪 Bruja',
    team: 'Aldea',
    description: 'Posees una poción de vida para salvar a la víctima nocturna y una poción para eliminar a un sospechoso.',
  },
};

/**
 * Balanced small-group role deck for 3–6 players (Part 5.4).
 */
export function buildSmallGroupRoleDeck(
  playerCount: number,
  settings: Pick<WerewolvesSettings, 'enableSeer' | 'enableDoctor' | 'enableWitch'>,
): WerewolfRole[] {
  if (playerCount < 3 || playerCount > 6) {
    throw new Error('Hombres Lobo en StudyVillage está diseñado para entre 3 y 6 jugadores.');
  }
  const roles: WerewolfRole[] = ['werewolf'];
  if (settings.enableSeer) roles.push('seer');
  if (playerCount >= 4 && settings.enableDoctor) roles.push('doctor');
  if (playerCount >= 5 && settings.enableWitch) roles.push('witch');
  while (roles.length < playerCount) {
    roles.push('villager');
  }
  return roles.slice(0, playerCount);
}

export class WerewolvesEngine extends BaseMinigameLobby {
  private game: WerewolvesAuthoritativeState;

  constructor(leader: { id: string; displayName: string; color: string }) {
    super({
      kind: 'werewolves',
      stationObjectId: 'community:campfire-werewolves',
      leader,
      minPlayers: 3,
      maxPlayers: 6,
    });
    this.game = {
      sessionId: this.state.sessionId,
      leaderId: leader.id,
      subPhase: 'LOBBY',
      dayNumber: 0,
      settings: {
        discussionSeconds: 60,
        votingSeconds: 30,
        nightSeconds: 30,
        revealRoleOnElimination: true,
        enableSeer: true,
        enableDoctor: true,
        enableWitch: true,
      },
      players: [],
      nightActions: this.emptyNightActions(),
      witchSaveRemaining: true,
      witchPoisonRemaining: true,
      dayVotes: {},
      eliminatedLastNight: [],
      eliminatedLastVote: null,
      winner: null,
      winReason: null,
      publicLog: ['Sala de Hombres Lobo abierta junto a la hoguera. Se requieren de 3 a 6 jugadores.'],
    };
  }

  private emptyNightActions(): NightActionRecord {
    return {
      werewolfVotes: {},
      seerTargetId: null,
      seerResult: null,
      doctorTargetId: null,
      witchSaveUsedThisNight: false,
      witchPoisonTargetId: null,
    };
  }

  updateSettings(actorId: string, patch: Partial<WerewolvesSettings>): WerewolvesSettings {
    if (actorId !== this.state.leaderId) {
      throw new Error('Solo el líder de la partida puede ajustar las reglas.');
    }
    this.game.settings = { ...this.game.settings, ...patch };
    return { ...this.game.settings };
  }

  startGame(actorId: string, customSeed?: number): WerewolvesAuthoritativeState {
    const check = this.canStart(actorId);
    if (!check.ok) throw new Error(check.reason);

    const activeParticipants: MinigameParticipant[] = this.state.participants.filter((p) => p.connected);
    const deck = buildSmallGroupRoleDeck(activeParticipants.length, this.game.settings);

    // Deterministic or crypto shuffle
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const rand = customSeed !== undefined
        ? Math.abs(Math.sin(customSeed + i * 17.3)) % 1
        : crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
      const j = Math.floor(rand * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    this.state.phase = 'ACTIVE_ROUND';
    this.game.leaderId = this.state.leaderId;
    this.game.subPhase = 'NIGHT';
    this.game.dayNumber = 1;
    this.game.players = activeParticipants.map((p, idx) => ({
      id: p.id,
      displayName: p.displayName,
      color: p.color,
      isBot: p.isBot,
      alive: true,
      connected: p.connected,
      role: shuffled[idx],
    }));
    this.game.nightActions = this.emptyNightActions();
    this.game.witchSaveRemaining = true;
    this.game.witchPoisonRemaining = true;
    this.game.dayVotes = {};
    this.game.eliminatedLastNight = [];
    this.game.eliminatedLastVote = null;
    this.game.winner = null;
    this.game.winReason = null;
    this.game.publicLog = [
      `🌙 Noche 1: La aldea duerme. Los roles secretos han sido repartidos entre ${this.game.players.length} jugadores.`,
    ];

    this.runBotNightActions();
    return this.getAuthoritativeState();
  }

  submitNightAction(
    actorId: string,
    action:
      | { kind: 'werewolf_attack'; targetId: string }
      | { kind: 'seer_inspect'; targetId: string }
      | { kind: 'doctor_protect'; targetId: string }
      | { kind: 'witch_heal' }
      | { kind: 'witch_poison'; targetId: string }
      | { kind: 'skip' },
  ): void {
    if (this.game.subPhase !== 'NIGHT') {
      throw new Error('Las acciones nocturnas solo se permiten durante la fase de Noche.');
    }
    const actor = this.game.players.find((p) => p.id === actorId);
    if (!actor || !actor.alive) {
      throw new Error('Solo los jugadores vivos pueden actuar durante la noche.');
    }

    if (action.kind === 'skip') return;

    if (action.kind === 'werewolf_attack') {
      if (actor.role !== 'werewolf') throw new Error('Solo un Hombre Lobo puede elegir víctima nocturna.');
      const target = this.game.players.find((p) => p.id === action.targetId && p.alive);
      if (!target) throw new Error('Objetivo inválido.');
      this.game.nightActions.werewolfVotes[actorId] = target.id;
      return;
    }

    if (action.kind === 'seer_inspect') {
      if (actor.role !== 'seer') throw new Error('Solo la Vidente puede consultar roles por la noche.');
      const target = this.game.players.find((p) => p.id === action.targetId && p.alive && p.id !== actorId);
      if (!target) throw new Error('Selecciona a otro jugador vivo para investigar.');
      this.game.nightActions.seerTargetId = target.id;
      this.game.nightActions.seerResult = {
        targetId: target.id,
        isWerewolf: target.role === 'werewolf',
        role: target.role,
      };
      return;
    }

    if (action.kind === 'doctor_protect') {
      if (actor.role !== 'doctor') throw new Error('Solo el Guardián/Doctor puede proteger por la noche.');
      const target = this.game.players.find((p) => p.id === action.targetId && p.alive);
      if (!target) throw new Error('Selecciona a un jugador vivo para proteger.');
      this.game.nightActions.doctorTargetId = target.id;
      return;
    }

    if (action.kind === 'witch_heal') {
      if (actor.role !== 'witch') throw new Error('Solo la Bruja puede usar la poción curativa.');
      if (!this.game.witchSaveRemaining) throw new Error('Ya has utilizado tu poción de vida en esta partida.');
      this.game.nightActions.witchSaveUsedThisNight = true;
      this.game.witchSaveRemaining = false;
      return;
    }

    if (action.kind === 'witch_poison') {
      if (actor.role !== 'witch') throw new Error('Solo la Bruja puede usar la poción de veneno.');
      if (!this.game.witchPoisonRemaining) throw new Error('Ya has utilizado tu poción de veneno en esta partida.');
      const target = this.game.players.find((p) => p.id === action.targetId && p.alive && p.id !== actorId);
      if (!target) throw new Error('Objetivo inválido para la poción.');
      this.game.nightActions.witchPoisonTargetId = target.id;
      this.game.witchPoisonRemaining = false;
    }
  }

  private computeWerewolfTarget(): string | null {
    const counts = new Map<string, number>();
    for (const targetId of Object.values(this.game.nightActions.werewolfVotes)) {
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
    let bestId: string | null = null;
    let bestCount = 0;
    for (const [id, c] of counts.entries()) {
      if (c > bestCount) {
        bestCount = c;
        bestId = id;
      }
    }
    return bestId;
  }

  /**
   * Resolves the Night Phase authoritatively and transitions to Day Discussion / Voting
   * (or FINISHED if a victory condition is met).
   */
  resolveNightPhase(): WerewolvesAuthoritativeState {
    if (this.game.subPhase !== 'NIGHT') {
      throw new Error('No estamos en la fase de Noche.');
    }
    this.runBotNightActions();

    const wolfVictimId = this.computeWerewolfTarget();
    const protectedId = this.game.nightActions.doctorTargetId;
    const savedByWitch = this.game.nightActions.witchSaveUsedThisNight;
    const poisonedId = this.game.nightActions.witchPoisonTargetId;

    const eliminatedIds = new Set<string>();
    if (wolfVictimId && wolfVictimId !== protectedId && !savedByWitch) {
      eliminatedIds.add(wolfVictimId);
    }
    if (poisonedId) {
      eliminatedIds.add(poisonedId);
    }

    const eliminatedList: { id: string; displayName: string; role?: WerewolfRole }[] = [];
    for (const id of eliminatedIds) {
      const player = this.game.players.find((p) => p.id === id && p.alive);
      if (player) {
        player.alive = false;
        eliminatedList.push({
          id: player.id,
          displayName: player.displayName,
          ...(this.game.settings.revealRoleOnElimination ? { role: player.role } : {}),
        });
      }
    }

    this.game.eliminatedLastNight = eliminatedList;
    this.game.dayVotes = {};

    if (eliminatedList.length === 0) {
      this.game.publicLog.push(`🌅 Día ${this.game.dayNumber}: Amanece en la aldea y nadie ha sido eliminado esta noche.`);
    } else {
      const names = eliminatedList
        .map((e) => `${e.displayName}${e.role ? ` (${WEREWOLF_ROLE_LABELS[e.role].name})` : ''}`)
        .join(', ');
      this.game.publicLog.push(`🌅 Día ${this.game.dayNumber}: Durante la noche cayó ${names}.`);
    }

    if (this.checkVictoryConditions()) {
      return this.getAuthoritativeState();
    }

    this.game.subPhase = 'DAY_VOTING';
    this.runBotDayVotes();
    return this.getAuthoritativeState();
  }

  /**
   * Casts a single Day vote from `voterId` for `targetId` (or `'abstain'`).
   * Enforces that only living players can vote and only living players can be targeted.
   */
  submitDayVote(voterId: string, targetId: string | 'abstain'): void {
    if (this.game.subPhase !== 'DAY_DISCUSSION' && this.game.subPhase !== 'DAY_VOTING') {
      throw new Error('La votación solo está abierta durante el Día.');
    }
    const voter = this.game.players.find((p) => p.id === voterId);
    if (!voter || !voter.alive) {
      throw new Error('Los jugadores eliminados no pueden votar.');
    }
    if (targetId !== 'abstain') {
      const target = this.game.players.find((p) => p.id === targetId && p.alive);
      if (!target) {
        throw new Error('Solo puedes votar a un jugador que siga con vida.');
      }
    }
    this.game.dayVotes[voterId] = targetId;
  }

  /**
   * Tallies Day votes. On a strict majority/plurality without a tie, eliminates the
   * chosen player; on a tie or majority abstain, nobody is eliminated.
   */
  resolveDayVotes(): WerewolvesAuthoritativeState {
    if (this.game.subPhase !== 'DAY_DISCUSSION' && this.game.subPhase !== 'DAY_VOTING') {
      throw new Error('No hay votación diurna activa para resolver.');
    }
    this.runBotDayVotes();

    const tally = new Map<string, number>();
    for (const p of this.game.players) {
      if (!p.alive) continue;
      const choice = this.game.dayVotes[p.id];
      if (choice && choice !== 'abstain') {
        tally.set(choice, (tally.get(choice) ?? 0) + 1);
      }
    }

    let topCandidate: string | null = null;
    let topVotes = 0;
    let isTie = false;

    for (const [candidateId, count] of tally.entries()) {
      if (count > topVotes) {
        topVotes = count;
        topCandidate = candidateId;
        isTie = false;
      } else if (count === topVotes && count > 0) {
        isTie = true;
      }
    }

    if (!topCandidate || isTie || topVotes === 0) {
      this.game.eliminatedLastVote = null;
      this.game.publicLog.push(`⚖️ Votación del Día ${this.game.dayNumber}: Empate o abstención; nadie es eliminado hoy.`);
    } else {
      const target = this.game.players.find((p) => p.id === topCandidate && p.alive);
      if (target) {
        target.alive = false;
        this.game.eliminatedLastVote = {
          id: target.id,
          displayName: target.displayName,
          ...(this.game.settings.revealRoleOnElimination ? { role: target.role } : {}),
        };
        this.game.publicLog.push(
          `🗳️ La aldea ha decidido eliminar a ${target.displayName}${
            this.game.settings.revealRoleOnElimination ? ` (${WEREWOLF_ROLE_LABELS[target.role].name})` : ''
          } con ${topVotes} voto(s).`,
        );
      }
    }

    if (this.checkVictoryConditions()) {
      return this.getAuthoritativeState();
    }

    // Advance to next Night
    this.game.dayNumber += 1;
    this.game.subPhase = 'NIGHT';
    this.game.nightActions = this.emptyNightActions();
    this.game.dayVotes = {};
    this.game.publicLog.push(`🌙 Noche ${this.game.dayNumber}: La noche cae de nuevo sobre StudyVillage.`);
    this.runBotNightActions();
    return this.getAuthoritativeState();
  }

  private checkVictoryConditions(): boolean {
    const living = this.game.players.filter((p) => p.alive);
    const livingWolves = living.filter((p) => p.role === 'werewolf');
    const livingVillagers = living.filter((p) => p.role !== 'werewolf');

    if (livingWolves.length === 0) {
      this.game.subPhase = 'FINISHED';
      this.state.phase = 'FINISHED';
      this.game.winner = 'villagers';
      this.game.winReason = '¡Victoria de la Aldea! Todos los Hombres Lobo han sido descubiertos.';
      this.game.publicLog.push(`🏆 ${this.game.winReason}`);
      return true;
    }

    if (livingWolves.length >= livingVillagers.length) {
      this.game.subPhase = 'FINISHED';
      this.state.phase = 'FINISHED';
      this.game.winner = 'werewolves';
      this.game.winReason = '¡Victoria de los Hombres Lobo! Han igualado en número a los aldeanos.';
      this.game.publicLog.push(`🐺 ${this.game.winReason}`);
      return true;
    }

    return false;
  }

  private runBotNightActions(): void {
    const living = this.game.players.filter((p) => p.alive);
    for (const bot of living.filter((p) => p.isBot)) {
      if (bot.role === 'werewolf' && !this.game.nightActions.werewolfVotes[bot.id]) {
        const nonWolves = living.filter((p) => p.role !== 'werewolf');
        if (nonWolves.length > 0) {
          this.game.nightActions.werewolfVotes[bot.id] = nonWolves[0].id;
        }
      } else if (bot.role === 'doctor' && !this.game.nightActions.doctorTargetId) {
        this.game.nightActions.doctorTargetId = bot.id;
      } else if (bot.role === 'seer' && !this.game.nightActions.seerTargetId) {
        const others = living.filter((p) => p.id !== bot.id);
        if (others.length > 0) {
          const t = others[0];
          this.game.nightActions.seerTargetId = t.id;
          this.game.nightActions.seerResult = {
            targetId: t.id,
            isWerewolf: t.role === 'werewolf',
            role: t.role,
          };
        }
      }
    }
  }

  private runBotDayVotes(): void {
    const living = this.game.players.filter((p) => p.alive);
    for (const bot of living.filter((p) => p.isBot)) {
      if (this.game.dayVotes[bot.id]) continue;
      if (bot.role === 'werewolf') {
        const target = living.find((p) => p.role !== 'werewolf');
        if (target) this.game.dayVotes[bot.id] = target.id;
      } else {
        const candidates = living.filter((p) => p.id !== bot.id);
        if (candidates.length > 0) {
          this.game.dayVotes[bot.id] = candidates[0].id;
        }
      }
    }
  }

  getAuthoritativeState(): WerewolvesAuthoritativeState {
    return JSON.parse(JSON.stringify(this.game)) as WerewolvesAuthoritativeState;
  }

  /**
   * Part 5.7 — Secret-Role Privacy Projection
   *
   * Produces a strictly filtered state for `viewerId` so secret roles and night
   * actions of other players are NEVER exposed before `FINISHED`.
   */
  getPlayerView(viewerId: string): WerewolvesPlayerView {
    return projectWerewolvesViewForPlayer(this.game, viewerId);
  }
}

export function projectWerewolvesViewForPlayer(
  state: WerewolvesAuthoritativeState,
  viewerId: string,
): WerewolvesPlayerView {
  const viewer = state.players.find((p) => p.id === viewerId);
  const viewerRole = viewer?.role ?? null;
  const isFinished = state.subPhase === 'FINISHED';

  const players = state.players.map((p) => {
    let knownRole: WerewolfRole | null = null;
    if (isFinished) {
      knownRole = p.role;
    } else if (p.id === viewerId) {
      knownRole = p.role;
    } else if (viewerRole === 'werewolf' && p.role === 'werewolf') {
      knownRole = 'werewolf';
    } else if (!p.alive && state.settings.revealRoleOnElimination) {
      knownRole = p.role;
    } else if (
      viewerRole === 'seer' &&
      state.nightActions.seerResult &&
      state.nightActions.seerResult.targetId === p.id
    ) {
      knownRole = state.nightActions.seerResult.role;
    }

    return {
      id: p.id,
      displayName: p.displayName,
      color: p.color,
      isBot: p.isBot,
      alive: p.alive,
      connected: p.connected,
      knownRole,
      hasVotedToday: Boolean(state.dayVotes[p.id]),
    };
  });

  const seerInspectionResult =
    viewerRole === 'seer' && state.nightActions.seerResult
      ? {
          ...state.nightActions.seerResult,
          targetName:
            state.players.find((p) => p.id === state.nightActions.seerResult?.targetId)?.displayName || 'Jugador',
        }
      : null;

  // Witch can see who the werewolves targeted this night if she still has her heal potion
  let witchPreviewVictimId: string | null = null;
  if (viewerRole === 'witch' && state.subPhase === 'NIGHT') {
    const wolfVotes = Object.values(state.nightActions.werewolfVotes);
    witchPreviewVictimId = wolfVotes[0] ?? null;
  }

  return {
    sessionId: state.sessionId,
    leaderId: state.leaderId,
    subPhase: state.subPhase,
    dayNumber: state.dayNumber,
    settings: { ...state.settings },
    ownId: viewerId,
    ownRole: viewerRole,
    ownAlive: viewer?.alive ?? false,
    players,
    seerInspectionResult,
    witchPreviewVictimId,
    witchSaveRemaining: viewerRole === 'witch' || isFinished ? state.witchSaveRemaining : false,
    witchPoisonRemaining: viewerRole === 'witch' || isFinished ? state.witchPoisonRemaining : false,
    dayVotes: state.subPhase === 'DAY_VOTING' || state.subPhase === 'VOTE_RESOLUTION' || isFinished ? { ...state.dayVotes } : {},
    eliminatedLastNight: state.eliminatedLastNight.map((e) => ({ ...e })),
    eliminatedLastVote: state.eliminatedLastVote ? { ...state.eliminatedLastVote } : null,
    winner: state.winner,
    winReason: state.winReason,
    publicLog: [...state.publicLog],
  };
}
