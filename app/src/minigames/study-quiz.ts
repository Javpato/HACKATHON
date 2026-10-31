import { flashcardDeckSchema, type FlashcardDeck } from '../ai/ollama-gateway';
import type { RoomEngine } from './room';
export type QuizAction = { kind: 'join'; name: string } | { kind: 'start'; seconds: number } | { kind: 'answer'; questionId: string; choice: number } | { kind: 'next' };
export interface QuizView {
  phase: 'lobby' | 'question' | 'results' | 'end'; title: string; count: number; index: number;
  question: { id: string; text: string; choices: string[] } | null; remainingMs: number; timed: boolean;
  solution: number | null; players: { id: string; name: string; score: number; answered: boolean }[];
  meAnswered: boolean; stopped: boolean;
}
export class StudyQuiz implements RoomEngine<QuizAction, QuizView> {
  private deck: FlashcardDeck | null = null;
  private cards: FlashcardDeck['cards'] = [];
  private players = new Map<string, { id: string; name: string; score: number; answered: boolean }>();
  private phase: QuizView['phase'] = 'lobby';
  private index = 0; private started = 0; private seconds = 20; private game = ''; private stopped = false;
  constructor(private readonly hostId: string) {}
  audience(): string[] { return [...this.players.keys()]; }
  setDeck(raw: FlashcardDeck): void {
    if (this.phase === 'question') throw new Error('Termina primero la partida.');
    this.deck = flashcardDeckSchema.parse(raw);
    this.cards = this.deck.cards.filter(c => c.choices && c.correctChoice !== undefined);
    this.phase = 'lobby'; this.index = 0;
  }
  prune(present: ReadonlySet<string>): boolean {
    let changed = false;
    for (const id of this.players.keys()) if (!present.has(id)) { this.players.delete(id); changed = true; }
    if (changed && this.phase === 'question' && [...this.players.values()].every(p=>p.answered)) this.phase = 'results';
    return changed;
  }
  cancel(): void { this.phase = 'lobby'; this.index = 0; this.game = crypto.randomUUID(); this.stopped = true; for (const p of this.players.values()) { p.score = 0; p.answered = false; } }
  apply(actor: string, action: QuizAction, now: number): void {
    if (action.kind === 'join') {
      if (actor === this.hostId) return;
      if (!this.players.has(actor)) this.players.set(actor, { id: actor, name: String(action.name).trim().slice(0, 32) || 'Vecino', score: 0, answered: this.phase === 'question' });
      return;
    }
    if (action.kind === 'start') {
      if (actor !== this.hostId || this.phase === 'question') throw new Error('Solo el anfitrión puede comenzar.');
      if (!this.cards.length) throw new Error('Añade opciones de concurso a las tarjetas de este mazo.');
      if (!this.players.size) throw new Error('Espera a que entre al menos un participante.');
      if (![0, 20, 30, 60].includes(action.seconds)) throw new Error('Tiempo inválido.');
      this.seconds = action.seconds; this.index = 0; this.game = crypto.randomUUID(); this.stopped = false;
      for (const p of this.players.values()) p.score = 0;
      this.begin(now); return;
    }
    if (action.kind === 'answer') {
      const p = this.players.get(actor); const card = this.cards[this.index];
      if (!p || p.answered || this.phase !== 'question' || action.questionId !== this.questionId() || (this.seconds && now >= this.started + this.seconds * 1000)) return;
      if (!Number.isInteger(action.choice) || action.choice < 0 || action.choice >= card.choices!.length) throw new Error('Respuesta inválida.');
      p.answered = true;
      if (action.choice === card.correctChoice) p.score += this.seconds ? Math.round(500 + 500 * Math.max(0, 1 - Math.max(0, now - this.started) / (this.seconds * 1000))) : 1000;
      if ([...this.players.values()].every(p => p.answered)) this.phase = 'results';
      return;
    }
    if (action.kind === 'next') {
      if (actor !== this.hostId || this.phase !== 'results') throw new Error('Espera al anfitrión.');
      if (++this.index >= this.cards.length) this.phase = 'end'; else this.begin(now);
    }
  }
  tick(now: number): boolean {
    if (this.phase === 'question' && this.seconds > 0 && now >= this.started + this.seconds * 1000) { this.phase = 'results'; return true; }
    return false;
  }
  viewFor(actor: string, now: number): QuizView {
    const card = this.cards[this.index]; const visible = !!card && (this.phase === 'question' || this.phase === 'results');
    return { phase: this.phase, title: this.deck?.title ?? '', count: this.cards.length, index: this.index,
      question: visible ? { id: this.questionId(), text: card.question, choices: [...card.choices!] } : null,
      solution: this.phase === 'results' ? card.correctChoice! : null,
      remainingMs: this.phase === 'question' && this.seconds ? Math.max(0, this.started + this.seconds * 1000 - now) : 0,
      timed: this.seconds > 0, meAnswered: this.players.get(actor)?.answered ?? false, stopped: this.stopped,
      players: [...this.players.values()].map(p => ({ ...p })).sort((a,b) => b.score-a.score),
    };
  }
  private questionId(): string { return `${this.game}:${this.index}`; }
  private begin(now: number): void { this.phase = 'question'; this.started = now; for (const p of this.players.values()) p.answered = false; }
}
