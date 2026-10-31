import type { FlashcardDeck, FlashcardItem, HostOllamaGateway } from '../ai/ollama-gateway';
import { SharedRoom } from '../minigames/room';
import { StudyQuiz, type QuizAction, type QuizView } from '../minigames/study-quiz';
import { OllamaGarticBots } from '../ai/gartic-bots';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] { const e = document.createElement(tag); e.textContent = text; return e; }
function button(text: string, action: () => void, primary = false): HTMLButtonElement { const b = el('button', text); b.type = 'button'; if (primary) b.className = 'is-primary'; b.onclick = action; return b; }
function field(label: string, input: HTMLElement): HTMLLabelElement { const l = el('label', label); l.append(input); return l; }
export interface StudyContext {
  actor(): { id: string; displayName: string; isHost: boolean };
  close(): void; notify(message: string): void;
  gateway: HostOllamaGateway;
  room: SharedRoom<QuizAction, QuizView, StudyQuiz>;
  bots?: OllamaGarticBots;
}
export class StudyPanel {
  readonly root = el('section');
  private mode: 'library' | 'edit' | 'review' | 'quiz' = 'library';
  private deckId: string | null = null;
  private index = 0; private revealed = false; private error = '';
  private off: (() => void) | null = null;
  private progress: Record<string, 'mastered' | 'review'> = {};
  private busy = false; private generation = 0; private clock: ReturnType<typeof setInterval> | null = null;
  constructor(private readonly ctx: StudyContext) { this.root.className = 'sv-study-workspace'; this.root.setAttribute('aria-label', 'Tarjetas de estudio'); }
  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    try { this.progress = JSON.parse(localStorage.getItem('studyvillage-review-v2') || '{}'); } catch { this.progress = {}; }
    try {
      const old = JSON.parse(localStorage.getItem('studyvillage-flashcard-progress-v1') || '{}');
      const marks = old[this.ctx.actor().id] ?? old['local-host'] ?? {};
      for (const deck of this.ctx.gateway.listDecks()) for (const card of deck.cards) if (!( `${deck.id}:${card.id}` in this.progress) && marks[card.id]) this.progress[`${deck.id}:${card.id}`] = marks[card.id] === 'mastered' ? 'mastered' : 'review';
    } catch { /* keep current progress */ }
    this.off = this.ctx.room.subscribe((_view, error) => { if (error) this.error = error; if (this.mode === 'quiz') this.render(); });
    this.clock = setInterval(() => { const clock = this.root.querySelector<HTMLElement>('[data-quiz-deadline]'); if (clock) clock.textContent = `${Math.max(0, Math.ceil((Number(clock.dataset.quizDeadline) - Date.now()) / 1000))} s`; }, 250);
    this.ctx.room.refresh(); this.render();
  }
  unmount(): void { if (this.clock) clearInterval(this.clock); this.clock = null; this.generation++; this.off?.(); this.off = null; this.root.remove(); }
  openDeck(id: string): void { this.deckId = id; this.mode = 'edit'; }
  private run(fn: () => void): void {
    try { this.error = ''; fn(); this.render(); }
    catch (e) { this.error = e instanceof Error ? e.message : 'No se pudo completar.'; let message = this.root.querySelector<HTMLElement>('[role=alert]'); if (!message) { message = el('p'); message.className = 'sv-error'; message.setAttribute('role', 'alert'); this.root.querySelector('header')!.after(message); } message.textContent = this.error; }
  }
  private deck(): FlashcardDeck | null { return this.deckId ? this.ctx.gateway.getDeck(this.deckId) : null; }
  private render(): void {
    this.root.replaceChildren();
    const header = el('header'); header.append(button('Biblioteca', () => { this.mode = 'library'; this.render(); }), el('h2', this.mode === 'quiz' ? 'Jugar en grupo' : 'Tarjetas de estudio'), button('Cerrar', this.ctx.close));
    if(this.mode==='library')header.querySelector('button')?.remove();
    this.root.append(header);
    if (this.error) { const p = el('p', this.error); p.className = 'sv-error'; p.setAttribute('role','alert'); this.root.append(p); }
    if (this.mode === 'library') this.library();
    else if (this.mode === 'edit') this.editor();
    else if (this.mode === 'review') this.review();
    else this.quiz();
  }
  private library(): void {
    const actor = this.ctx.actor();
    const actions = el('div'); actions.className = 'sv-study-actions';
    actions.append(button('Crear mazo', () => { this.deckId = null; this.mode = 'edit'; this.render(); }, true), button('Jugar en grupo', () => { this.mode = 'quiz'; this.ctx.room.refresh(); this.render(); }));
    this.root.append(actions);
    const decks = this.ctx.gateway.listDecks(actor.id, actor.isHost);
    if (!decks.length) this.root.append(el('p', 'Todavía no tienes mazos. Crea uno con tus propias preguntas.'));
    const grid = el('div'); grid.className = 'sv-study-library';
    for (const deck of decks) {
      const card = el('article'); card.className = 'sv-study-card'; card.append(el('h3', deck.title), el('p', `${deck.cards.length} tarjetas · ${deck.cards.filter(c=>this.progress[`${deck.id}:${c.id}`]==='mastered').length} aprendidas`));
      card.append(button('Repasar', () => { this.deckId = deck.id; this.index = 0; this.revealed = false; this.mode = 'review'; this.render(); }, true));
      if (this.ctx.gateway.canEditDeck(deck, actor.id, actor.isHost)) card.append(button('Editar', () => { this.deckId = deck.id; this.mode = 'edit'; this.render(); }));
      grid.append(card);
    }
    this.root.append(grid);
    const advanced = el('details'); advanced.append(el('summary', 'Configurar IA local')); this.aiSettings(advanced); this.root.append(advanced);
  }
  private editor(): void {
    const deck = this.deck(); const actor = this.ctx.actor(); const form = el('div'); form.className = 'sv-study-form';
    if (deck && !this.ctx.gateway.canEditDeck(deck, actor.id, actor.isHost)) { this.root.append(el('p','Este mazo es de solo lectura.')); return; }
    const title = el('input'); title.maxLength = 110; title.value = deck?.title ?? ''; title.required = true;
    form.append(field('Nombre del mazo', title));
    if (!deck) {
      form.append(button('Crear', () => this.run(() => { if (!title.value.trim()) throw new Error('Escribe el nombre del mazo.'); this.deckId = this.ctx.gateway.createManualDeck({ title: title.value, ownerId: 'local-host', visibility: 'private' }).id; }), true));
      this.root.append(form); return;
    }
    form.append(button('Guardar nombre', () => this.run(() => { this.ctx.gateway.renameDeck(deck.id, title.value, actor.id, actor.isHost); })));
    const list = el('div');
    deck.cards.forEach((card, index) => {
      const row = el('article'); row.className = 'sv-study-card'; row.append(el('strong', `${index + 1}. ${card.question}`));
      row.append(button('Editar', () => this.cardEditor(form, deck, card)), button('↑', () => this.run(() => { this.ctx.gateway.reorderCard(deck.id, card.id, 'up', actor.id, actor.isHost); })), button('↓', () => this.run(() => { this.ctx.gateway.reorderCard(deck.id, card.id, 'down', actor.id, actor.isHost); })), button('Eliminar tarjeta', () => this.run(() => { this.ctx.gateway.deleteCard(deck.id, card.id, actor.id, actor.isHost); })));
      list.append(row);
    });
    form.append(list); this.cardEditor(form, deck);
    const deckOptions = el('details'); deckOptions.append(el('summary', 'Opciones del mazo'));
    const visibility = el('select'); for (const [value,label] of [['private','Privado'],['shared_read','Solo lectura'],['shared_write','Editable']]) { const o=el('option',label);o.value=value;visibility.append(o); } visibility.value=deck.visibility??'private';
    visibility.onchange=()=>this.run(()=>{this.ctx.gateway.setDeckVisibility(deck.id,visibility.value as 'private'|'shared_read'|'shared_write',actor.id,actor.isHost);});
    deckOptions.append(field('Permisos',visibility)); let deleteArmed=false;
    const remove=button('Eliminar mazo',()=>{if(!deleteArmed){deleteArmed=true;remove.textContent='¿Eliminar este mazo?';return;}this.run(()=>{this.ctx.gateway.deleteDeck(deck.id,actor.id,actor.isHost);this.mode='library';this.deckId=null;});});deckOptions.append(remove);form.append(deckOptions);
    const ai = el('details'); ai.append(el('summary', 'Crear tarjetas con IA')); this.aiCreator(ai, deck); form.append(ai);
    this.root.append(form);
  }
  private cardEditor(parent: HTMLElement, deck: FlashcardDeck, existing?: FlashcardItem): void {
    parent.querySelector('[data-card-editor]')?.remove();
    const editor = el('div'); editor.dataset.cardEditor = 'true'; editor.className = 'sv-study-form';
    const question = el('textarea'); question.maxLength = 260; question.value = existing?.question ?? '';
    const answer = el('textarea'); answer.maxLength = 400; answer.value = existing?.answer ?? '';
    editor.append(field('Pregunta', question), field('Respuesta', answer));
    const advanced = el('details'); advanced.open = !!existing?.choices; advanced.append(el('summary', 'Opciones de concurso y detalles'));
    const enabled = el('input'); enabled.type = 'checkbox'; enabled.checked = !!existing?.choices;
    advanced.append(field('Usar en concursos', enabled));
    const options = Array.from({ length: 4 }, (_, i) => { const input = el('input'); input.maxLength = 120; input.value = existing?.choices?.[i] ?? ''; advanced.append(field(`Opción ${i+1}${i > 1 ? ' (opcional)' : ''}`, input)); return input; });
    const correct = el('select'); for (let i=0;i<4;i++) { const option = el('option', `Opción ${i+1}`); option.value = String(i); correct.append(option); } correct.value = String(existing?.correctChoice ?? 0);
    const hint = el('input'); hint.maxLength = 220; hint.value = existing?.hint ?? '';
    const explanation = el('textarea'); explanation.maxLength = 320; explanation.value = existing?.explanation ?? '';
    const tags = el('input'); tags.value = existing?.tags.join(', ') ?? '';
    const difficulty = el('select'); for (const [v,n] of [['easy','Fácil'],['medium','Media'],['hard','Difícil']]) { const o=el('option',n);o.value=v;difficulty.append(o); } difficulty.value = existing?.difficulty ?? 'medium';
    advanced.append(field('Respuesta correcta', correct), field('Pista', hint), field('Explicación', explanation), field('Etiquetas', tags), field('Dificultad', difficulty)); editor.append(advanced);
    editor.append(button(existing ? 'Guardar tarjeta' : 'Añadir tarjeta', () => this.run(() => {
      const actor = this.ctx.actor(); const fresh = this.ctx.gateway.getDeck(deck.id)!;
      if (!this.ctx.gateway.canEditDeck(fresh, actor.id, actor.isHost)) throw new Error('No puedes editar este mazo.');
      const choices = options.map(i => i.value.trim());
      if (enabled.checked && (choices.slice(0,2).some(v => !v) || choices.slice(2).some((v,i) => !v && choices.slice(i+3).some(Boolean)))) throw new Error('Completa al menos las dos primeras opciones, sin huecos.');
      const card: FlashcardItem = { ...(existing?.sourceRef ? { sourceRef: existing.sourceRef } : {}), id: existing?.id ?? crypto.randomUUID(), question: question.value.trim(), answer: answer.value.trim(), topic: fresh.topic, difficulty: difficulty.value as FlashcardItem['difficulty'], tags: tags.value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,8), ...(hint.value.trim() ? { hint: hint.value.trim() } : {}), ...(explanation.value.trim() ? { explanation: explanation.value.trim() } : {}), ...(enabled.checked ? { choices: choices.filter(Boolean), correctChoice: Number(correct.value) } : {}) };
      if (!existing && fresh.cards.length >= 100) throw new Error('Máximo 100 tarjetas por mazo.');
      this.ctx.gateway.saveDeck({ ...fresh, cards: existing ? fresh.cards.map(c=>c.id===card.id?card:c) : [...fresh.cards, card], updatedAt: Date.now() });
    }), true));
    parent.append(editor);
  }
  private review(): void {
    const deck = this.deck(); const card = deck?.cards[this.index];
    if (!deck || !card) { this.root.append(el('p','No hay más tarjetas por repasar.'), button('Volver a la biblioteca',()=>{ this.mode='library';this.render(); })); return; }
    const wrap = el('div'); wrap.className = 'sv-study-review';
    wrap.append(el('p', `${this.index+1} / ${deck.cards.length}`));
    const paper=el('article',this.revealed?card.answer:card.question);paper.className='sv-study-card';wrap.append(paper);
    if (!this.revealed) wrap.append(button('Revelar respuesta',()=>{this.revealed=true;this.render();},true));
    else for (const [mark,label] of [['mastered','Lo sabía'],['review','Repasar']] as const) wrap.append(button(label,()=>{this.progress[`${deck.id}:${card.id}`]=mark;localStorage.setItem('studyvillage-review-v2',JSON.stringify(this.progress));this.index++;this.revealed=false;this.render();}));
    this.root.append(wrap);
  }
  private quiz(): void {
    const actor=this.ctx.actor(); const v=this.ctx.room.current();
    if (!v) { this.root.append(el('p','Conectando con el anfitrión…')); return; }
    if (v.phase==='lobby') {
      if (v.stopped) this.root.append(el('p','El anfitrión terminó la partida.'));
      if (actor.isHost) {
        const select=el('select'); const decks=this.ctx.gateway.listDecks(actor.id,true);
        for(const d of decks){const o=el('option',`${d.title} · ${d.cards.filter(c=>c.choices).length} preguntas de concurso`);o.value=d.id;select.append(o);}
        this.root.append(field('Mazo para jugar',select));
        const advanced=el('details');advanced.append(el('summary','Opciones de partida'));const seconds=el('select');for(const [value,label] of [['20','20 segundos'],['30','30 segundos'],['60','60 segundos'],['0','Sin tiempo']]){const o=el('option',label);o.value=value;seconds.append(o);}advanced.append(field('Tiempo por pregunta',seconds));this.root.append(advanced);
        this.root.append(button('Comenzar partida',()=>this.run(()=>{const deck=this.ctx.gateway.getDeck(select.value);if(!deck)throw new Error('Crea primero un mazo con opciones de concurso.');this.ctx.room.mutate(engine=>{engine.setDeck(deck);return true;});this.ctx.room.act({kind:'start',seconds:Number(seconds.value)});}),true));
      } else this.root.append(button('Entrar en la partida',()=>this.ctx.room.act({kind:'join',name:actor.displayName}),true),el('p','Espera a que el anfitrión comience.'));
      this.root.append(el('p',`${v.players.length} participantes`));
    } else if (v.question) {
      this.root.append(el('h3',v.question.text));
      if (v.phase==='question') { const timer = el('p', v.timed ? `${Math.ceil(v.remainingMs/1000)} s` : 'Sin límite de tiempo.'); if (v.timed) timer.dataset.quizDeadline = String(Date.now()+v.remainingMs); this.root.append(timer); v.question.choices.forEach((choice,index)=>{const b=button(choice,()=>this.ctx.room.act({kind:'answer',questionId:v.question!.id,choice:index}));b.disabled=actor.isHost||v.meAnswered;this.root.append(b);}); }
      else {this.root.append(el('p',`Respuesta: ${v.question.choices[v.solution!]}`));if(actor.isHost)this.root.append(button('Siguiente',()=>this.ctx.room.act({kind:'next'}),true));}
    } else this.root.append(el('h3','Partida terminada'));
    if(v.phase!=='question'){const list=el('ol');for(const p of v.players)list.append(el('li',`${p.name} · ${p.score} puntos`));this.root.append(list);}
    if(actor.isHost&&v.phase!=='lobby'){let armed=false;const stop=button('Terminar partida',()=>{if(!armed){armed=true;stop.textContent='¿Terminar para todos?';return;}this.ctx.room.stop();});this.root.append(stop);}
  }
  private aiSettings(parent: HTMLElement): void {
    const actor=this.ctx.actor();const cfg=this.ctx.gateway.getConfig();const status=this.ctx.gateway.getStatus();
    parent.append(el('p',status.reachable?'Ollama conectado.':'IA opcional. Puedes crear y repasar sin configurarla.'));
    if(!actor.isHost){parent.append(el('p','La IA local la configura el anfitrión.'));return;}
    const models=el('select');models.setAttribute('aria-label','Modelo Ollama');for(const model of status.availableModels){const o=el('option',model);o.value=model;models.append(o);}models.value=cfg.selectedModel;
    models.onchange=()=>{this.ctx.gateway.configure({selectedModel:models.value},true);};parent.append(models);
    const probe=button('Detectar Ollama',()=>{if(this.busy)return;this.busy=true;probe.disabled=true;void this.ctx.gateway.probeOllamaModels().then(status=>{if(status.reachable){this.ctx.gateway.configure({enabled:true,selectedModel:status.availableModels[0]??''},true);}else this.error='No se pudo conectar con Ollama.';}).catch(e=>{this.error=String(e);}).finally(()=>{this.busy=false;this.render();});});parent.append(probe,button('Desactivar IA',()=>{this.ctx.gateway.configure({enabled:false},true);this.ctx.gateway.cancelActiveRequests(true);this.ctx.bots?.disable();this.render();}));
  }
  private aiCreator(parent: HTMLElement, deck: FlashcardDeck): void {
    this.aiSettings(parent);
    if (!this.ctx.actor().isHost) return;
    const material=el('textarea');material.maxLength=8000;
    const count=el('input');count.type='number';count.min='1';count.max='12';count.value='5';
    parent.append(field('Material de estudio',material),field('Número de tarjetas',count));
    const generate=button('Generar tarjetas',()=>{const actor=this.ctx.actor();if(this.busy)return;if(!material.value.trim()){this.error='Añade el material que quieres estudiar.';this.render();return;}this.busy=true;generate.disabled=true;const generation=this.generation;
      void this.ctx.gateway.generateFlashcardDeck({requesterId:actor.id,isHost:actor.isHost,sourceType:'selection',topic:deck.topic,content:material.value,count:Number(count.value),difficulty:'mixed',style:'concise',includeHints:false,includeExplanations:false}).then(result=>{if(generation!==this.generation)return;const current=this.ctx.gateway.getDeck(deck.id);if(current)this.ctx.gateway.saveDeck({...current,cards:[...current.cards,...result.cards].slice(0,100),updatedAt:Date.now()});}).catch(e=>{this.error=e instanceof Error?e.message:'No se pudo generar.';}).finally(()=>{this.busy=false;if(generation===this.generation)this.render();});});parent.append(generate);
  }
}
