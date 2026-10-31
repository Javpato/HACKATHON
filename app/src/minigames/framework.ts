import { z } from 'zod';

/**
 * Part 11 — Reusable Minigame Framework
 *
 * Provides a shared lifecycle, lobby, participant readiness, timer, disconnect
 * handling, and permission model for all in-world minigames (Werewolves,
 * Gartic Phone, and Arcade Study Trivia).
 */

export type MinigameLifecyclePhase =
  | 'IDLE'
  | 'LOBBY'
  | 'STARTING'
  | 'ACTIVE_ROUND'
  | 'RESOLUTION'
  | 'REVEAL'
  | 'FINISHED'
  | 'CANCELLED';

export type MinigameKind = 'werewolves' | 'gartic_phone' | 'arcade_trivia';

export interface MinigameParticipant {
  id: string;
  displayName: string;
  color: string;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  joinedAt: number;
}

export interface MinigameLobbyState {
  sessionId: string;
  kind: MinigameKind;
  stationObjectId: string;
  leaderId: string;
  phase: MinigameLifecyclePhase;
  participants: MinigameParticipant[];
  minPlayers: number;
  maxPlayers: number;
  createdAt: number;
  updatedAt: number;
  cancelReason?: string;
}

export const minigameParticipantSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ready: z.boolean(),
  connected: z.boolean(),
  isBot: z.boolean(),
  joinedAt: z.number().nonnegative(),
});

export class BaseMinigameLobby {
  protected state: MinigameLobbyState;

  constructor(params: {
    kind: MinigameKind;
    stationObjectId: string;
    leader: { id: string; displayName: string; color: string };
    minPlayers?: number;
    maxPlayers?: number;
  }) {
    const now = Date.now();
    this.state = {
      sessionId: `${params.kind}:${crypto.randomUUID().slice(0, 10)}`,
      kind: params.kind,
      stationObjectId: params.stationObjectId,
      leaderId: params.leader.id,
      phase: 'LOBBY',
      participants: [
        {
          id: params.leader.id,
          displayName: params.leader.displayName,
          color: params.leader.color,
          ready: true,
          connected: true,
          isBot: false,
          joinedAt: now,
        },
      ],
      minPlayers: params.minPlayers ?? 3,
      maxPlayers: params.maxPlayers ?? 6,
      createdAt: now,
      updatedAt: now,
    };
  }

  getLobbyState(): MinigameLobbyState {
    return {
      ...this.state,
      participants: this.state.participants.map((p) => ({ ...p })),
    };
  }

  join(player: { id: string; displayName: string; color: string; isBot?: boolean }): MinigameLobbyState {
    if (this.state.phase !== 'LOBBY') {
      throw new Error('La partida ya ha comenzado; espera a la siguiente ronda.');
    }
    const existing = this.state.participants.find((p) => p.id === player.id);
    if (existing) {
      existing.connected = true;
      existing.displayName = player.displayName;
      existing.color = player.color;
      this.state.updatedAt = Date.now();
      return this.getLobbyState();
    }
    if (this.state.participants.length >= this.state.maxPlayers) {
      throw new Error(`La sala está completa (máximo ${this.state.maxPlayers} jugadores).`);
    }
    this.state.participants.push({
      id: player.id,
      displayName: player.displayName.slice(0, 32),
      color: /^#[0-9a-fA-F]{6}$/.test(player.color) ? player.color : '#df7e6c',
      ready: Boolean(player.isBot),
      connected: true,
      isBot: Boolean(player.isBot),
      joinedAt: Date.now(),
    });
    this.state.updatedAt = Date.now();
    return this.getLobbyState();
  }

  addCompanionBots(targetCount = 4): MinigameLobbyState {
    const botProfiles = [
      { id: 'bot:luna', displayName: 'Luna (Aldeana Bot)', color: '#6c8ebf' },
      { id: 'bot:mateo', displayName: 'Mateo (Sabio Bot)', color: '#e6b566' },
      { id: 'bot:clara', displayName: 'Clara (Exploradora Bot)', color: '#7cb369' },
      { id: 'bot:bruno', displayName: 'Bruno (Guardián Bot)', color: '#b57ba6' },
      { id: 'bot:sofia', displayName: 'Sofía (Artista Bot)', color: '#df7e6c' },
    ];
    for (const bot of botProfiles) {
      if (this.state.participants.length >= Math.min(this.state.maxPlayers, targetCount)) break;
      if (!this.state.participants.some((p) => p.id === bot.id)) {
        this.join({ ...bot, isBot: true });
      }
    }
    return this.getLobbyState();
  }

  leave(playerId: string): MinigameLobbyState {
    this.state.participants = this.state.participants.filter((p) => p.id !== playerId);
    if (this.state.participants.length === 0) {
      this.state.phase = 'CANCELLED';
      this.state.cancelReason = 'Todos los jugadores abandonaron la sala.';
    } else if (this.state.leaderId === playerId) {
      const nextHuman = this.state.participants.find((p) => !p.isBot) ?? this.state.participants[0];
      this.state.leaderId = nextHuman.id;
    }
    this.state.updatedAt = Date.now();
    return this.getLobbyState();
  }

  setReady(playerId: string, ready: boolean): MinigameLobbyState {
    const p = this.state.participants.find((item) => item.id === playerId);
    if (!p) throw new Error('No estás en la sala.');
    p.ready = ready;
    this.state.updatedAt = Date.now();
    return this.getLobbyState();
  }

  canStart(actorId: string): { ok: boolean; reason?: string } {
    if (actorId !== this.state.leaderId) {
      return { ok: false, reason: 'Solo quien lidera la sala puede iniciar la partida.' };
    }
    const active = this.state.participants.filter((p) => p.connected);
    if (active.length < this.state.minPlayers) {
      return {
        ok: false,
        reason: `Se necesitan al menos ${this.state.minPlayers} jugadores (hay ${active.length}). Puedes invitar vecinos o añadir compañeros bot.`,
      };
    }
    return { ok: true };
  }

  cancel(actorId: string, reason = 'Partida cancelada por el líder.'): MinigameLobbyState {
    if (actorId !== this.state.leaderId) {
      throw new Error('Solo el líder puede cancelar la partida.');
    }
    this.state.phase = 'CANCELLED';
    this.state.cancelReason = reason;
    this.state.updatedAt = Date.now();
    return this.getLobbyState();
  }
}

// ---------------------------------------------------------------------------
// Arcade Station Minigame: Quick Study & Village Trivia
// ---------------------------------------------------------------------------

export interface ArcadeTriviaQuestion {
  id: string;
  category: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}

export const ARCADE_TRIVIA_BANK: readonly ArcadeTriviaQuestion[] = [
  {
    id: 'triv-1',
    category: 'Algoritmos',
    question: '¿Cuál es la complejidad temporal en el caso promedio de búsqueda en una tabla hash bien distribuida?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
    correctIndex: 0,
    explanation: 'Con una buena función hash y factor de carga acotado, el acceso promedio es constante O(1).',
  },
  {
    id: 'triv-2',
    category: 'Cálculo y LaTeX',
    question: '¿Cuál es el valor de la suma de Gauss 1 + 2 + ... + n para n = 10?',
    options: ['45', '50', '55', '60'],
    correctIndex: 2,
    explanation: 'Aplicando n(n+1)/2 = 10 × 11 / 2 = 55.',
  },
  {
    id: 'triv-3',
    category: 'Seguridad y Redes P2P',
    question: '¿Por qué en un proyecto colaborativo el anfitrión verifica el hash SHA-256 antes de ejecutar código?',
    options: [
      'Para evitar condiciones de carrera TOCTOU donde el código cambie tras pedir permiso',
      'Solo para comprimir los archivos de texto',
      'Para cambiar el color del editor',
      'No tiene ninguna función de seguridad',
    ],
    correctIndex: 0,
    explanation: 'Vincular la aprobación al hash criptográfico garantiza que se ejecute exactamente la revisión revisada.',
  },
  {
    id: 'triv-4',
    category: 'Física y Geometría',
    question: 'En un triángulo rectángulo con catetos a = 3 y b = 4, ¿cuánto mide la hipotenusa c?',
    options: ['5', '6', '7', '25'],
    correctIndex: 0,
    explanation: 'Por el teorema de Pitágoras: c = √(3² + 4²) = √25 = 5.',
  },
];
