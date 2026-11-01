import { msg, t, defaultText, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import {
  MAX_PLAYERS, MIN_PLAYERS, ROLE_INFO, STEP_CALL, presetRoles, type RoleCounts,
  type WerewolfRole, type WerewolvesAction, type WerewolvesView,
} from '../minigames/werewolves';
import { colorIcon, monoIcon } from './pixel-icons';
/** Role texts in the current language; the engine keeps the Spanish source keys. */
function roleInfo(role: keyof typeof ROLE_INFO): { name: string; plural: string; team: 'aldea' | 'lobos'; goal: string } { const info = ROLE_INFO[role]; return { name: t(info.name), plural: t(info.plural), team: info.team, goal: t(info.goal) }; }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text: DisplayText = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) setDisplayText(node, text);
  return node;
}
function btn(label: DisplayText, className = 'ww-btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

const PHASE_TITLE: Record<WerewolvesView['phase'], string> = {
  hunter: 'El último disparo', lobby: 'La mesa de la hoguera', reveal: 'Mira tu carta', night: 'Noche', dawn: 'Amanece',
  day: 'Día: la aldea vota', verdict: 'Veredicto', end: 'Fin de la partida',
};

export interface WerewolvesPanelContext {
  send(action: WerewolvesAction): void;
  close(): void;
  me(): { name: string; color: string };
}

/**
 * The game table. Seats sit around the fire; each card shows only what you
 * know about that person. Night is dark and quiet unless it is your turn.
 */
export class WerewolvesPanel {
  readonly root = el('section', 'ww');
  private view: WerewolvesView | null = null;
  private receivedAt = 0;
  private selected: string | null = null;
  private heal = false;
  private timerEl: HTMLElement | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private errorText = '';
  private turnKey = '';
  private cardsOpen = false;

  constructor(private readonly ctx: WerewolvesPanelContext) {
    setDisplayAttribute(this.root, 'aria-label', msg('Hombres lobo'));
  }

  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    this.clock ??= setInterval(() => this.paintTimer(), 250);
    this.render();
  }

  unmount(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.root.remove();
  }

  update(view: WerewolvesView | null, error: string | null): void {
    // Unchanged default names ("Explorador") follow the language; typed names stay as typed.
    if (view) view = { ...view, players: view.players.map(p => ({ ...p, name: defaultText(p.name) })) };
    if (view) {
      const key = `${view.phase}:${view.round}:${view.step}`;
      if (key !== this.turnKey) { this.turnKey = key; this.selected = null; this.heal = false; }
      this.view = view;
      this.receivedAt = Date.now();
    }
    this.errorText = error ?? '';
    this.render();
  }

  private remaining(): number {
    return this.view ? Math.max(0, this.view.remainingMs - (Date.now() - this.receivedAt)) : 0;
  }

  private paintTimer(): void {
    if (!this.timerEl || !this.view) return;
    const s = Math.ceil(this.remaining() / 1000);
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('is-low', s <= 10);
  }

  private render(): void {
    const v = this.view;
    this.root.replaceChildren();
    this.root.dataset.phase = v?.phase ?? 'lobby';
    this.root.dataset.dark = String(!!v && (v.phase === 'night' || v.phase === 'reveal'));
    this.root.append(this.header(v));
    if (!v) {
      this.root.append(el('p', 'ww-empty', msg('Conectando con la mesa…')));
      return;
    }
    const body = el('div', 'ww-body');
    const side = el('div', 'ww-side');
    side.append(this.myCard(v), this.actionBox(v));
    if (this.errorText) side.append(el('p', 'ww-error', this.errorText));
    side.append(this.logBox(v));
    body.append(this.table(v), side);
    this.root.append(body);
    if (v.phase === 'lobby') { const setup = this.cardSetup(v); body.prepend(setup); }
    this.paintTimer();
  }

  private header(v: WerewolvesView | null): HTMLElement {
    const head = el('header', 'ww-head');
    const phaseIcon = el('span', 'ww-phase-icon');
    phaseIcon.append(colorIcon(!v || v.phase === 'lobby' || v.phase === 'end' ? 'werewolf' : v.phase === 'night' || v.phase === 'reveal' ? 'moon' : 'sun', 28));
    const titles = el('div', 'ww-titles');
    const title = v?.phase === 'night' ? t('Noche {round}', { round: v.round }) : v?.phase === 'day' ? t('Día {round}: la aldea vota', { round: v.round }) : t(PHASE_TITLE[v?.phase ?? 'lobby']);
    titles.append(el('h2', '', title), el('p', '', this.subtitle(v)));
    head.append(phaseIcon, titles);
    if (v && v.phase !== 'lobby' && v.phase !== 'end') {
      this.timerEl = el('span', 'ww-timer');
      setDisplayAttribute(this.timerEl, 'aria-label', msg('Tiempo restante'));
      head.append(this.timerEl);
    } else this.timerEl = null;
    const close = btn('', 'ww-icon-btn');
    close.append(monoIcon('close', 14));
    setDisplayAttribute(close, 'aria-label', msg('Cerrar'));
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    head.append(close);
    return head;
  }

  private subtitle(v: WerewolvesView | null): string {
    if (!v) return '';
    switch (v.phase) {
      case 'lobby': return t('De {min} a {max} jugadores. Si faltan personas, añade bots.', { min: MIN_PLAYERS, max: MAX_PLAYERS });
      case 'reveal': return t('Solo tú ves tu carta. Pulsa «Entendido» cuando la recuerdes.');
      case 'night': return v.step ? `${t(STEP_CALL[v.step])}.` : t('La aldea duerme.');
      case 'dawn': return v.nightDeaths.length ? t('La noche ha dejado víctimas.') : t('Nadie ha muerto esta noche.');
      case 'day': return t('Hablad por voz, sospechad y elegid. Gana la mayoría; con empate no muere nadie.');
      case 'verdict': return t('La aldea ha decidido.');
      case 'hunter': return t('El cazador puede elegir una última víctima antes de continuar.');
      case 'end': return v.winner === 'lovers' ? t('¡Ganan los enamorados!') : v.winner === 'aldea' ? t('¡La aldea gana!') : t('¡Los hombres lobo ganan!');
    }
  }

  private cardSetup(v: WerewolvesView): HTMLElement {
    const setup = el('details', 'ww-card sv-role-setup'); setup.open = this.cardsOpen;
    const summary = el('summary', '', msg('Elegir cartas y sets'));
    summary.addEventListener('click', e => { e.preventDefault(); this.cardsOpen = !this.cardsOpen; setup.open = this.cardsOpen; });
    setup.append(summary);
    const presets = el('select', 'sv-select'); setDisplayAttribute(presets, 'aria-label', msg('Set de cartas'));
    for (const [value, name] of [['', msg('Elegir set')], ['basic', msg('Básico')], ['classic', msg('Clásico')], ['bonds', msg('Vínculos')]]) { const o = el('option', '', name); o.value = String(value); presets.append(o); }
    let saved: Record<string, RoleCounts> = {};
    try { const raw = JSON.parse(localStorage.getItem('studyvillage-role-sets') || '{}'); saved = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; } catch { /* no saved sets */ }
    for (const key of Object.keys(saved)) { const o = el('option', '', key); o.value = `saved:${key}`; presets.append(o); }
    presets.disabled = !v.me.isLeader;
    presets.addEventListener('change', () => { if (presets.value) this.ctx.send({ kind: 'configure', counts: presets.value.startsWith('saved:') ? saved[presets.value.slice(6)] : presetRoles(presets.value, v.players.length) }); });
    setup.append(presets);
    const grid = el('div', 'sv-role-catalog');
    for (const role of Object.keys(ROLE_INFO) as WerewolfRole[]) {
      const card = el('article', 'sv-role-card'); card.append(colorIcon(role, 38), el('h4', '', roleInfo(role).name), el('p', '', roleInfo(role).goal));
      const amount = el('input'); amount.type = 'number'; amount.min = '0'; amount.max = role === 'werewolf' ? '3' : '1';
      amount.value = String(role === 'villager' ? v.deck.filter(r => r === role).length : v.counts[role] ?? 0);
      amount.disabled = !v.me.isLeader || role === 'villager'; setDisplayAttribute(amount, 'aria-label', msg("Cantidad: {p0}", { p0: roleInfo(role).name }));
      amount.addEventListener('change', () => this.ctx.send({ kind: 'configure', counts: { ...v.counts, [role]: Number(amount.value) } }));
      card.append(amount); grid.append(card);
    }
    setup.append(grid, el('p', 'ww-muted', msg('Las plazas sin carta especial se completan con ciudadanos.')));
    if (v.deckError) setup.append(el('p', 'ww-error', v.deckError));
    if (v.me.isLeader) {
      const input = el('input', 'sv-input'); setDisplayAttribute(input, "placeholder", msg('Nombre del set')); input.maxLength = 40;
      const save = btn(msg('Guardar set')); save.addEventListener('click', () => { const name = input.value.trim(); if (!name) return; saved[name] = v.counts; localStorage.setItem('studyvillage-role-sets', JSON.stringify(Object.fromEntries(Object.entries(saved).slice(-12)))); this.render(); });
      setup.append(input, save);
    }
    return setup;
  }

  private table(v: WerewolvesView): HTMLElement {
    const table = el('div', 'ww-table');
    const selectable = this.selectableTargets(v);
    const tally = new Map<string, number>();
    for (const p of v.players) if (p.votesFor && p.votesFor !== 'skip') tally.set(p.votesFor, (tally.get(p.votesFor) ?? 0) + 1);
    const packMarks = new Map<string, number>();
    for (const p of v.players) if (p.wolfTarget) packMarks.set(p.wolfTarget, (packMarks.get(p.wolfTarget) ?? 0) + 1);

    for (const p of v.players) {
      const seat = btn('', 'ww-seat');
      seat.classList.toggle('is-me', p.id === v.me.id);
      seat.classList.toggle('is-dead', !p.alive);
      seat.classList.toggle('is-selected', this.selected === p.id);
      const canPick = selectable.includes(p.id);
      seat.classList.toggle('is-pickable', canPick);
      seat.disabled = !canPick && !(v.phase === 'lobby' && p.bot && v.me.isLeader);
      seat.setAttribute('aria-label', `${p.name}${p.alive ? '' : t(' (eliminado)')}${p.role ? `, ${roleInfo(p.role).name}` : ''}`);

      const avatar = el('span', 'ww-avatar', p.name.slice(0, 1).toUpperCase());
      avatar.style.backgroundColor = p.color;
      const badge = el('span', 'ww-role-badge');
      badge.append(colorIcon(!p.alive ? 'dead' : p.role ?? 'unknown', 22, p.role ? roleInfo(p.role).name : t('Carta oculta')));
      avatar.append(badge);
      const name = el('span', 'ww-seat-name', p.id === v.me.id ? msg("{p0} (tú)", { p0: p.name }) : p.name);
      const status = el('span', 'ww-seat-status', this.seatStatus(v, p, tally.get(p.id) ?? 0));
      seat.append(avatar, name, status);
      if (packMarks.get(p.id)) {
        const mark = el('span', 'ww-pack-mark');
        mark.append(colorIcon('werewolf', 16), el('span', '', `×${packMarks.get(p.id)}`));
        seat.append(mark);
      }
      if (v.phase === 'lobby' && p.bot && v.me.isLeader) {
        setDisplayAttribute(seat, "title", msg('Quitar bot'));
        seat.classList.add('is-removable');
        seat.addEventListener('click', () => this.ctx.send({ kind: 'remove_bot', id: p.id }));
      } else if (canPick) {
        seat.addEventListener('click', () => { this.selected = this.selected === p.id ? null : p.id; this.render(); });
      }
      table.append(seat);
    }
    if (v.phase === 'lobby') {
      for (let i = v.players.length; i < Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, v.players.length + 1)); i++) {
        const empty = el('div', 'ww-seat is-empty');
        empty.append(el('span', 'ww-avatar'), el('span', 'ww-seat-name', msg('Sitio libre')));
        table.append(empty);
      }
    }
    return table;
  }

  private seatStatus(v: WerewolvesView, p: WerewolvesView['players'][number], votes: number): string {
    if (!p.alive) return p.role ? roleInfo(p.role).name : t('Eliminado');
    if (v.phase === 'lobby') return p.bot ? 'Bot' : p.id === v.leaderId ? t('Anfitrión') : t('Listo');
    if (v.phase === 'reveal') return p.ready ? t('Listo') : t('Mirando su carta…');
    if (v.phase === 'day' || v.phase === 'verdict') {
      const target = p.votesFor === 'skip' ? 'nadie' : v.players.find((x) => x.id === p.votesFor)?.name;
      const got = votes ? `${votes} voto${votes === 1 ? '' : 's'}` : '';
      return [got, target ? `vota a ${target}` : ''].filter(Boolean).join(' · ') || 'Pensando…';
    }
    if (v.phase === 'end' && p.role) return roleInfo(p.role).name;
    return p.role && p.id !== v.me.id ? roleInfo(p.role).name : '';
  }

  private selectableTargets(v: WerewolvesView): string[] {
    if (v.turn && !v.me.acted) return v.turn.step === 'witch' ? (v.turn.canPoison ? v.turn.targets : []) : v.turn.targets;
    if (v.turn?.step === 'wolves') return v.turn.targets;
    if (v.phase === 'day' && v.me.alive) return v.players.filter((p) => p.alive && p.id !== v.me.id).map((p) => p.id);
    return [];
  }

  private myCard(v: WerewolvesView): HTMLElement {
    const card = el('div', 'ww-card');
    if (v.phase === 'lobby' || !v.me.role) {
      card.append(el('h3', '', v.phase === 'lobby' ? msg('Cartas en juego') : msg('Partida en curso')));
      if (!v.deck.length) card.append(el('p', 'ww-muted', msg("Hacen falta al menos {p0} jugadores para repartir cartas.", { p0: MIN_PLAYERS })));
      const counts = new Map<WerewolfRole, number>();
      for (const r of v.deck) counts.set(r, (counts.get(r) ?? 0) + 1);
      const list = el('ul', 'ww-deck');
      for (const [role, n] of counts) {
        const item = el('li');
        item.append(colorIcon(role, 22), el('strong', '', `${n} × ${n === 1 ? roleInfo(role).name : roleInfo(role).plural}`), el('span', '', roleInfo(role).goal));
        list.append(item);
      }
      card.append(list);
      if (v.phase !== 'lobby') card.append(el('p', 'ww-muted', msg('Estás mirando. Podrás sentarte en la siguiente partida.')));
      return card;
    }
    const role = v.me.role;
    card.classList.add('is-role', `is-${roleInfo(role).team}`);
    const art = el('div', 'ww-card-art');
    art.append(colorIcon(role, 56, roleInfo(role).name));
    card.append(art, el('div', 'ww-card-team', roleInfo(role).team === 'lobos' ? msg('Equipo lobos') : msg('Equipo aldea')),
      el('h3', '', roleInfo(role).name), el('p', '', roleInfo(role).goal));
    if (v.loverId) card.append(el('p', 'ww-muted', msg("Tu vínculo: {p0}", { p0: v.players.find(p => p.id === v.loverId)?.name ?? '' })));
    if (v.peeked.length) card.append(el('p', 'ww-muted', msg("Has visto a: {p0}", { p0: v.peeked.map(id => v.players.find(p => p.id === id)?.name).join(', ') })));
    if (!v.me.alive && v.phase !== 'end') card.append(el('p', 'ww-muted', msg('Has sido eliminado. Puedes seguir mirando en silencio.')));
    const allies = v.players.filter((p) => p.id !== v.me.id && p.role === 'werewolf' && role === 'werewolf');
    if (allies.length) card.append(el('p', 'ww-muted', msg("Tu manada: {p0}.", { p0: allies.map((p) => p.name).join(', ') })));
    if (v.seerSeen.length && role === 'seer') {
      const seen = el('ul', 'ww-seen');
      for (const s of v.seerSeen) {
        const who = v.players.find((p) => p.id === s.id)?.name ?? '¿?';
        const li = el('li');
        li.append(colorIcon(s.role, 18), el('span', '', `${who}: ${roleInfo(s.role).name}`));
        seen.append(li);
      }
      card.append(el('h4', '', msg('Lo que has visto')), seen);
    }
    return card;
  }

  private actionBox(v: WerewolvesView): HTMLElement {
    const box = el('div', 'ww-action');
    const name = (id: string | null) => v.players.find((p) => p.id === id)?.name ?? '';
    const primary = (label: DisplayText, action: () => void, enabled = true) => {
      const b = btn(label, 'ww-btn ww-btn-primary');
      b.disabled = !enabled;
      b.addEventListener('click', action);
      box.append(b);
      return b;
    };
    const secondary = (label: DisplayText, action: () => void) => {
      const b = btn(label, 'ww-btn');
      b.addEventListener('click', action);
      box.append(b);
      return b;
    };

    if (v.phase === 'hunter' && v.hunterTargets.length) {
      for (const id of v.hunterTargets) primary(msg("Disparar a {p0}", { p0: name(id) }), () => this.ctx.send({ kind: 'hunter', target: id }));
      secondary(msg('No disparar'), () => this.ctx.send({ kind: 'hunter', target: null })); return box;
    }
    if (v.phase === 'night' && v.me.alive && v.me.role === 'girl' && v.step === 'wolves' && !v.me.acted) {
      box.append(el('p', '', msg('Espiar revela un lobo. Riesgo de ser descubierta: 33 %.')));
      primary(msg('Espiar'), () => this.ctx.send({ kind: 'peek', spy: true }));
      secondary(msg('No espiar'), () => this.ctx.send({ kind: 'peek', spy: false })); return box;
    }
    if (v.turn?.step === 'cupid' && !v.me.acted) {
      const selects = [el('select', 'sv-select'), el('select', 'sv-select')];
      selects.forEach((input, i) => { setDisplayAttribute(input, 'aria-label', msg("Enamorado {p0}", { p0: i + 1 })); for (const id of v.turn!.targets) { const o = el('option', '', name(id)); o.value = id; input.append(o); } box.append(input); });
      if (selects[1].options.length > 1) selects[1].selectedIndex = 1;
      primary(msg('Unir enamorados'), () => this.ctx.send({ kind: 'cupid', targets: [selects[0].value, selects[1].value] })); return box;
    }
    switch (v.phase) {
      case 'hunter': box.append(el('p', '', msg('El cazador decide su último disparo…'))); break;
      case 'lobby': {
        if (!v.me.seated) {
          box.append(el('p', '', msg('Siéntate junto al fuego para jugar.')));
          primary(msg('Sentarme a la mesa'), () => this.ctx.send({ kind: 'join', ...this.ctx.me() }));
          break;
        }
        if (v.me.isLeader) {
          const need = MIN_PLAYERS - v.players.length;
          box.append(el('p', '', need > 0 ? msg("Faltan {p0} jugador{p1}. Espera a tus vecinos o añade bots.", { p0: need, p1: need === 1 ? '' : 'es' }) : msg('Todo listo. Cuando empieces, cada uno recibirá una carta al azar.')));
          const add = secondary(msg('Añadir bot'), () => this.ctx.send({ kind: 'add_bot' }));
          add.disabled = v.players.length >= MAX_PLAYERS;
          primary(msg('Repartir cartas'), () => this.ctx.send({ kind: 'start' }), v.players.length >= MIN_PLAYERS && !v.deckError);
          if (v.players.some((p) => p.bot)) box.append(el('p', 'ww-muted', msg('Pulsa un bot para quitarlo.')));
        } else {
          box.append(el('p', '', msg("Esperando a que {p0} reparta las cartas…", { p0: name(v.leaderId) || t('el anfitrión') })));
        }
        secondary(msg('Levantarme'), () => this.ctx.send({ kind: 'leave' }));
        break;
      }
      case 'reveal':
        if (v.me.seated) {
          if (v.me.acted) box.append(el('p', '', msg('Esperando a los demás…')));
          else primary(msg('Entendido'), () => this.ctx.send({ kind: 'ready' }));
        }
        break;
      case 'night': {
        const t = v.turn;
        if (!t) {
          box.classList.add('is-sleeping');
          box.append(el('p', 'ww-sleep', v.me.alive ? msg('Cierra los ojos… no es tu turno.') : msg('Observas la noche en silencio.')));
          break;
        }
        if (t.step === 'wolves') {
          box.append(el('p', '', v.me.acted ? msg('Has elegido. Puedes cambiar mientras tu manada decide.') : msg('Elige a quién atacar esta noche.')));
          primary(this.selected ? msg("Atacar a {p0}", { p0: name(this.selected) }) : msg('Elige una víctima'), () => this.selected && this.ctx.send({ kind: 'wolf_vote', target: this.selected }), !!this.selected);
        } else if (v.me.acted) {
          box.append(el('p', '', msg('Hecho. Vuelve a cerrar los ojos.')));
        } else if (t.step === 'seer') {
          box.append(el('p', '', msg('Elige la carta de quién quieres mirar.')));
          primary(this.selected ? msg("Mirar la carta de {p0}", { p0: name(this.selected) }) : msg('Elige a alguien'), () => this.selected && this.ctx.send({ kind: 'seer_look', target: this.selected }), !!this.selected);
        } else if (t.step === 'guard') {
          box.append(el('p', '', t.lastGuarded ? msg("Elige a quién proteger (anoche: {p0}).", { p0: name(t.lastGuarded) }) : msg('Elige a quién proteger esta noche. Puedes ser tú.')));
          primary(this.selected ? msg("Proteger a {p0}", { p0: name(this.selected) }) : msg('Elige a alguien'), () => this.selected && this.ctx.send({ kind: 'guard', target: this.selected }), !!this.selected);
        } else {
          box.append(el('p', '', t.victim ? msg("Los lobos han atacado a {p0}.", { p0: name(t.victim) }) : msg('Esta noche los lobos no han atacado a nadie.')));
          if (t.canHeal) {
            const toggle = el('label', 'ww-check');
            const input = el('input');
            input.type = 'checkbox';
            input.checked = this.heal;
            input.addEventListener('change', () => { this.heal = input.checked; this.render(); });
            toggle.append(input, el('span', '', msg("Salvar a {p0} (poción de vida)", { p0: name(t.victim) })));
            box.append(toggle);
          }
          box.append(el('p', 'ww-muted', t.canPoison ? msg('Pulsa a alguien si quieres envenenarlo (opcional).') : msg('Ya usaste tu poción de veneno.')));
          const label = [this.heal ? 'salvar' : '', this.selected ? `envenenar a ${name(this.selected)}` : ''].filter(Boolean).join(' y ');
          primary(label ? msg("Usar: {p0}", { p0: label }) : msg('No usar pociones'), () => this.ctx.send({ kind: 'witch', heal: this.heal, poison: this.selected }));
        }
        break;
      }
      case 'dawn':
        if (v.nightDeaths.length) {
          for (const id of v.nightDeaths) {
            const p = v.players.find((x) => x.id === id);
            const row = el('p', 'ww-death');
            row.append(colorIcon('dead', 20), el('span', '', `${p?.name ?? '¿?'} · ${p?.role ? roleInfo(p.role).name : ''}`));
            box.append(row);
          }
        } else box.append(el('p', '', msg('Todos despiertan sanos y salvos.')));
        if (v.me.isLeader) secondary(msg('Empezar el día'), () => this.ctx.send({ kind: 'continue' }));
        break;
      case 'day': {
        if (!v.me.alive) { box.append(el('p', 'ww-muted', msg('Los eliminados no votan.'))); break; }
        const mine = v.players.find((p) => p.id === v.me.id)?.votesFor;
        if (mine) box.append(el('p', '', msg("Tu voto: {p0}. Puedes cambiarlo.", { p0: mine === 'skip' ? 'no eliminar a nadie' : name(mine) })));
        else box.append(el('p', '', msg('Pulsa a alguien y vota.')));
        primary(this.selected ? msg("Votar a {p0}", { p0: name(this.selected) }) : msg('Elige a alguien'), () => this.selected && this.ctx.send({ kind: 'vote', target: this.selected }), !!this.selected);
        secondary(msg('No eliminar a nadie'), () => this.ctx.send({ kind: 'vote', target: 'skip' }));
        break;
      }
      case 'verdict': {
        const p = v.verdict?.id ? v.players.find((x) => x.id === v.verdict!.id) : null;
        if (p) {
          const row = el('p', 'ww-death');
          row.append(colorIcon(p.role ?? 'dead', 22), el('span', '', msg("{p0} era {p1}.", { p0: p.name, p1: p.role ? roleInfo(p.role).name.toLowerCase() : '¿?' })));
          box.append(row);
        } else box.append(el('p', '', v.verdict?.tie ? msg('Empate: nadie es eliminado.') : msg('Nadie es eliminado hoy.')));
        if (v.me.isLeader) secondary(msg('Caer la noche'), () => this.ctx.send({ kind: 'continue' }));
        break;
      }
      case 'end': {
        const banner = el('div', `ww-winner is-${v.winner}`);
        banner.append(colorIcon(v.winner === 'lobos' ? 'werewolf' : 'trophy', 36), el('strong', '', v.winner === 'lovers' ? msg('Ganan los enamorados') : v.winner === 'lobos' ? msg('Ganan los hombres lobo') : msg('Gana la aldea')));
        box.append(banner);
        if (v.me.isLeader) primary(msg('Jugar otra vez'), () => this.ctx.send({ kind: 'play_again' }));
        if (v.me.seated) secondary(msg('Levantarme'), () => this.ctx.send({ kind: 'leave' }));
        break;
      }
    }
    return box;
  }

  private logBox(v: WerewolvesView): HTMLElement {
    const box = el('ol', 'ww-log');
    setDisplayAttribute(box, 'aria-label', msg('Narrador'));
    for (const entry of [...v.log].reverse().slice(0, 12)) {
      const li = el('li');
      li.append(colorIcon(entry.icon, 16), el('span', '', msg(entry.text, Object.fromEntries(Object.entries(entry.params ?? {}).map(([key, value]) => [key, key === 'name' || key === 'target' ? value : typeof value === 'string' ? msg(value) : value])))));
      box.append(li);
    }
    return box;
  }
}
