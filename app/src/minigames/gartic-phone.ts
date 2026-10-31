import { BaseMinigameLobby } from './framework';

/**
 * Part 6 — Multiplayer Game: Gartic Phone–Style Drawing & Guessing Game
 *
 * Launched from the Drawing Table in the Central Community Plaza.
 *
 * Core Loop:
 * 1. Round 0 (PROMPT): Every player writes an initial prompt Starting Chain `c`.
 * 2. Round 1 (DRAW): Chain `c` passes to player `(c + 1) % N`, who sees ONLY the
 *    previous prompt and draws it on an embedded canvas.
 * 3. Round 2 (GUESS): Chain `c` passes to player `(c + 2) % N`, who sees ONLY the
 *    previous drawing (never the original prompt!) and guesses what it depicts.
 * 4. Alternates DRAW / GUESS until `totalRounds` is reached.
 * 5. REVEAL Phase: Full chains are revealed step-by-step in chronological order
 *    with synchronized reactions.
 */

export type GarticGameMode = 'classic' | 'fast' | 'extended' | 'theme';
export type GarticRoundKind = 'PROMPT' | 'DRAW' | 'GUESS';
export type GarticSubPhase = 'LOBBY' | 'ACTIVE_ROUND' | 'REVEAL' | 'FINISHED' | 'CANCELLED';

export interface GarticSettings {
  mode: GarticGameMode;
  promptSeconds: number;
  drawSeconds: number;
  guessSeconds: number;
  themeCategory: string;
}

export interface GarticStepEntry {
  stepIndex: number;
  kind: GarticRoundKind;
  authorId: string;
  authorName: string;
  /** Prompt text or guess text (for PROMPT and GUESS steps) */
  text?: string;
  /** PNG Data URL or stroke JSON (for DRAW steps) */
  drawingDataUrl?: string;
  submittedAt: number;
}

export interface GarticChain {
  chainId: string;
  originPlayerIndex: number;
  originPlayerId: string;
  originPlayerName: string;
  steps: GarticStepEntry[];
  reactions: Record<string, string[]>; // emoji -> userIds
}

export interface GarticAuthoritativeState {
  sessionId: string;
  leaderId: string;
  subPhase: GarticSubPhase;
  settings: GarticSettings;
  playerOrder: { id: string; displayName: string; color: string; isBot: boolean }[];
  currentRound: number;
  totalRounds: number;
  chains: GarticChain[];
  revealChainIndex: number;
  revealStepIndex: number;
}

/**
 * Strictly filtered view for `viewerId` during active rounds so unrevealed chain
 * history is NEVER leaked before `REVEAL` / `FINISHED`.
 */
export interface GarticPlayerTaskView {
  sessionId: string;
  leaderId: string;
  subPhase: GarticSubPhase;
  settings: GarticSettings;
  currentRound: number;
  totalRounds: number;
  roundKind: GarticRoundKind;
  assignedChainId: string | null;
  /** ONLY the immediately preceding step (prompt to draw, or drawing to guess) */
  previousStep: {
    kind: GarticRoundKind;
    authorName: string;
    text?: string;
    drawingDataUrl?: string;
  } | null;
  hasSubmittedThisRound: boolean;
  submittedPlayerIds: string[];
  playerOrder: { id: string; displayName: string; color: string; isBot: boolean }[];
  /** Populated ONLY during REVEAL or FINISHED */
  revealedChains: GarticChain[];
  revealChainIndex: number;
  revealStepIndex: number;
}

export const GARTIC_THEME_PROMPTS: Record<string, readonly string[]> = {
  estudio: [
    'Un gato resolviendo una integral en la pizarra',
    'Dos búhos programando en Python con café',
    'Una biblioteca mágica flotando entre las nubes',
    'Un robot intentando estudiar para un examen de física',
  ],
  aldea: [
    'Un hombre lobo asando malvaviscos en la hoguera',
    'Una casa del árbol con telescopio y plantas gigantes',
    'Un pingüino cartero repartiendo invitaciones bajo la lluvia',
    'Un dragón dormido encima de una máquina arcade',
  ],
};

/**
 * Deterministic, conflict-free chain assignment:
 * At `roundIndex` (0-based), player `p` is assigned chain `(p - roundIndex + N) % N`.
 * Equivalently, chain `c` is handled at round `r` by player `(c + r) % N`.
 */
export function assignedChainIndexForPlayer(playerIndex: number, roundIndex: number, totalPlayers: number): number {
  if (totalPlayers <= 0) return 0;
  return ((playerIndex - roundIndex) % totalPlayers + totalPlayers) % totalPlayers;
}

export function roundKindForIndex(roundIndex: number): GarticRoundKind {
  if (roundIndex === 0) return 'PROMPT';
  return roundIndex % 2 === 1 ? 'DRAW' : 'GUESS';
}

export class GarticPhoneEngine extends BaseMinigameLobby {
  private game: GarticAuthoritativeState;

  constructor(leader: { id: string; displayName: string; color: string }) {
    super({
      kind: 'gartic_phone',
      stationObjectId: 'community:drawing-table-gartic',
      leader,
      minPlayers: 2,
      maxPlayers: 6,
    });
    this.game = {
      sessionId: this.state.sessionId,
      leaderId: leader.id,
      subPhase: 'LOBBY',
      settings: {
        mode: 'classic',
        promptSeconds: 45,
        drawSeconds: 75,
        guessSeconds: 45,
        themeCategory: 'estudio',
      },
      playerOrder: [],
      currentRound: 0,
      totalRounds: 3,
      chains: [],
      revealChainIndex: 0,
      revealStepIndex: 0,
    };
  }

  updateSettings(actorId: string, patch: Partial<GarticSettings>): GarticSettings {
    if (actorId !== this.state.leaderId) {
      throw new Error('Solo quien lidera la mesa puede cambiar la configuración.');
    }
    this.game.settings = { ...this.game.settings, ...patch };
    return { ...this.game.settings };
  }

  startGame(actorId: string): GarticAuthoritativeState {
    const check = this.canStart(actorId);
    if (!check.ok) throw new Error(check.reason);

    const active = this.state.participants.filter((p) => p.connected);
    const n = active.length;
    let totalRounds = n;
    if (this.game.settings.mode === 'fast') {
      totalRounds = Math.max(2, Math.min(3, n));
    } else if (this.game.settings.mode === 'extended') {
      totalRounds = Math.min(6, Math.max(3, n + 1));
    } else {
      totalRounds = Math.max(3, n);
    }

    this.state.phase = 'ACTIVE_ROUND';
    this.game.subPhase = 'ACTIVE_ROUND';
    this.game.playerOrder = active.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      color: p.color,
      isBot: p.isBot,
    }));
    this.game.currentRound = 0;
    this.game.totalRounds = totalRounds;
    this.game.revealChainIndex = 0;
    this.game.revealStepIndex = 0;
    this.game.chains = this.game.playerOrder.map((p, idx) => ({
      chainId: `chain:${idx}:${p.id.slice(0, 8)}`,
      originPlayerIndex: idx,
      originPlayerId: p.id,
      originPlayerName: p.displayName,
      steps: [],
      reactions: {},
    }));

    this.autoSubmitBotsForCurrentRound();
    return this.getAuthoritativeState();
  }

  submitRoundEntry(
    playerId: string,
    payload: { text?: string; drawingDataUrl?: string },
  ): GarticAuthoritativeState {
    if (this.game.subPhase !== 'ACTIVE_ROUND') {
      throw new Error('No hay una ronda activa en este momento.');
    }
    const pIdx = this.game.playerOrder.findIndex((p) => p.id === playerId);
    if (pIdx < 0) throw new Error('No participas en esta partida de Gartic Phone.');

    const n = this.game.playerOrder.length;
    const r = this.game.currentRound;
    const chainIdx = assignedChainIndexForPlayer(pIdx, r, n);
    const chain = this.game.chains[chainIdx];
    const kind = roundKindForIndex(r);

    if (chain.steps.length > r) {
      // Replace existing submission for the current round
      chain.steps.splice(r, 1);
    }

    if (kind === 'PROMPT' || kind === 'GUESS') {
      const cleanText = (payload.text ?? '').trim().slice(0, 140) || 'Un misterio en la aldea';
      chain.steps[r] = {
        stepIndex: r,
        kind,
        authorId: playerId,
        authorName: this.game.playerOrder[pIdx].displayName,
        text: cleanText,
        submittedAt: Date.now(),
      };
    } else {
      const dataUrl = payload.drawingDataUrl ?? '';
      if (dataUrl.length > 524_288) {
        throw new Error('El dibujo supera el límite de tamaño permitido (512 KB).');
      }
      chain.steps[r] = {
        stepIndex: r,
        kind: 'DRAW',
        authorId: playerId,
        authorName: this.game.playerOrder[pIdx].displayName,
        drawingDataUrl: dataUrl,
        submittedAt: Date.now(),
      };
    }

    // Check if all chains have step `r` completed
    if (this.allPlayersSubmittedCurrentRound()) {
      this.advanceRound();
    }
    return this.getAuthoritativeState();
  }

  allPlayersSubmittedCurrentRound(): boolean {
    const r = this.game.currentRound;
    return this.game.chains.every((c) => Boolean(c.steps[r]));
  }

  advanceRound(): GarticAuthoritativeState {
    if (this.game.subPhase !== 'ACTIVE_ROUND') return this.getAuthoritativeState();
    const r = this.game.currentRound;
    const kind = roundKindForIndex(r);

    // Fill placeholders for any missing submission on timeout
    for (let pIdx = 0; pIdx < this.game.playerOrder.length; pIdx++) {
      const chainIdx = assignedChainIndexForPlayer(pIdx, r, this.game.playerOrder.length);
      const chain = this.game.chains[chainIdx];
      if (!chain.steps[r]) {
        const player = this.game.playerOrder[pIdx];
        chain.steps[r] = {
          stepIndex: r,
          kind,
          authorId: player.id,
          authorName: player.displayName,
          ...(kind === 'DRAW'
            ? { drawingDataUrl: '' }
            : { text: r === 0 ? 'Un búho estudiando en la biblioteca' : '¿Un búho sabio?' }),
          submittedAt: Date.now(),
        };
      }
    }

    if (this.game.currentRound + 1 >= this.game.totalRounds) {
      this.game.subPhase = 'REVEAL';
      this.state.phase = 'REVEAL';
      this.game.revealChainIndex = 0;
      this.game.revealStepIndex = 0;
      return this.getAuthoritativeState();
    }

    this.game.currentRound += 1;
    this.autoSubmitBotsForCurrentRound();
    return this.getAuthoritativeState();
  }

  nextRevealStep(actorId: string): GarticAuthoritativeState {
    if (this.game.subPhase !== 'REVEAL') return this.getAuthoritativeState();
    if (actorId !== this.state.leaderId) {
      throw new Error('Solo el líder puede avanzar el álbum de revelación.');
    }
    const currentChain = this.game.chains[this.game.revealChainIndex];
    if (!currentChain) {
      this.game.subPhase = 'FINISHED';
      this.state.phase = 'FINISHED';
      return this.getAuthoritativeState();
    }

    if (this.game.revealStepIndex + 1 < currentChain.steps.length) {
      this.game.revealStepIndex += 1;
    } else if (this.game.revealChainIndex + 1 < this.game.chains.length) {
      this.game.revealChainIndex += 1;
      this.game.revealStepIndex = 0;
    } else {
      this.game.subPhase = 'FINISHED';
      this.state.phase = 'FINISHED';
    }
    return this.getAuthoritativeState();
  }

  addReaction(chainId: string, emoji: string, userId: string): void {
    const chain = this.game.chains.find((c) => c.chainId === chainId);
    if (!chain) return;
    const allowed = ['😂', '🎨', '👏', '🤯', '❤️'];
    if (!allowed.includes(emoji)) return;
    const list = chain.reactions[emoji] ?? [];
    if (!list.includes(userId)) {
      list.push(userId);
      chain.reactions[emoji] = list;
    }
  }

  private autoSubmitBotsForCurrentRound(): void {
    if (this.game.subPhase !== 'ACTIVE_ROUND') return;
    const r = this.game.currentRound;
    const n = this.game.playerOrder.length;
    const kind = roundKindForIndex(r);
    const bank = GARTIC_THEME_PROMPTS[this.game.settings.themeCategory] ?? GARTIC_THEME_PROMPTS.estudio;

    for (let pIdx = 0; pIdx < n; pIdx++) {
      const player = this.game.playerOrder[pIdx];
      if (!player.isBot) continue;
      const chainIdx = assignedChainIndexForPlayer(pIdx, r, n);
      const chain = this.game.chains[chainIdx];
      if (chain.steps[r]) continue;

      if (kind === 'PROMPT') {
        chain.steps[r] = {
          stepIndex: r,
          kind: 'PROMPT',
          authorId: player.id,
          authorName: player.displayName,
          text: bank[chainIdx % bank.length],
          submittedAt: Date.now(),
        };
      } else if (kind === 'DRAW') {
        const prevPrompt = chain.steps[r - 1]?.text || 'Dibujo misterioso';
        chain.steps[r] = {
          stepIndex: r,
          kind: 'DRAW',
          authorId: player.id,
          authorName: player.displayName,
          drawingDataUrl: createBotSvgPlaceholderDataUrl(prevPrompt, player.color),
          submittedAt: Date.now(),
        };
      } else {
        const prevprevText = chain.steps[Math.max(0, r - 2)]?.text || 'Algo divertido en la aldea';
        chain.steps[r] = {
          stepIndex: r,
          kind: 'GUESS',
          authorId: player.id,
          authorName: player.displayName,
          text: `${prevprevText} (versión bot)`,
          submittedAt: Date.now(),
        };
      }
    }
  }

  getAuthoritativeState(): GarticAuthoritativeState {
    return JSON.parse(JSON.stringify(this.game)) as GarticAuthoritativeState;
  }

  getPlayerView(viewerId: string): GarticPlayerTaskView {
    return projectGarticViewForPlayer(this.game, viewerId);
  }
}

function createBotSvgPlaceholderDataUrl(label: string, color: string): string {
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fffdf5';
        ctx.fillRect(0, 0, 320, 200);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.strokeRect(18, 18, 284, 164);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(90, 95, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#22382e';
        ctx.font = '700 13px sans-serif';
        ctx.fillText('🎨 Boceto Bot:', 135, 85);
        ctx.font = '600 11px sans-serif';
        ctx.fillText(label.slice(0, 26), 135, 110);
        return canvas.toDataURL('image/png');
      }
    } catch {
      // Fallback for non-DOM unit tests
    }
  }
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

/**
 * Enforces Gartic Phone chain privacy: during `ACTIVE_ROUND`, a player only
 * receives the immediately preceding step of their currently assigned chain,
 * never earlier steps or other players' chains.
 */
export function projectGarticViewForPlayer(
  state: GarticAuthoritativeState,
  viewerId: string,
): GarticPlayerTaskView {
  const n = state.playerOrder.length;
  const r = state.currentRound;
  const roundKind = roundKindForIndex(r);
  const pIdx = state.playerOrder.findIndex((p) => p.id === viewerId);

  let assignedChainId: string | null = null;
  let previousStep: GarticPlayerTaskView['previousStep'] = null;
  let hasSubmittedThisRound = false;

  if (state.subPhase === 'ACTIVE_ROUND' && pIdx >= 0 && n > 0) {
    const chainIdx = assignedChainIndexForPlayer(pIdx, r, n);
    const chain = state.chains[chainIdx];
    if (chain) {
      assignedChainId = chain.chainId;
      hasSubmittedThisRound = Boolean(chain.steps[r]);
      if (r > 0 && chain.steps[r - 1]) {
        const prev = chain.steps[r - 1];
        previousStep = {
          kind: prev.kind,
          authorName: prev.authorName,
          ...(prev.kind === 'DRAW' ? { drawingDataUrl: prev.drawingDataUrl } : { text: prev.text }),
        };
      }
    }
  }

  const submittedPlayerIds: string[] = [];
  if (state.subPhase === 'ACTIVE_ROUND' && n > 0) {
    for (let i = 0; i < n; i++) {
      const cIdx = assignedChainIndexForPlayer(i, r, n);
      if (state.chains[cIdx]?.steps[r]) {
        submittedPlayerIds.push(state.playerOrder[i].id);
      }
    }
  }

  const isRevealed = state.subPhase === 'REVEAL' || state.subPhase === 'FINISHED';

  return {
    sessionId: state.sessionId,
    leaderId: state.leaderId,
    subPhase: state.subPhase,
    settings: { ...state.settings },
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    roundKind,
    assignedChainId,
    previousStep,
    hasSubmittedThisRound,
    submittedPlayerIds,
    playerOrder: state.playerOrder.map((p) => ({ ...p })),
    revealedChains: isRevealed ? state.chains.map((c) => JSON.parse(JSON.stringify(c)) as GarticChain) : [],
    revealChainIndex: state.revealChainIndex,
    revealStepIndex: state.revealStepIndex,
  };
}
