import { GameCameraDock } from './game-camera-ui';
import { StudyPanel } from './study-ui';
import { StudyQuiz, type QuizAction, type QuizView } from '../minigames/study-quiz';
import { OllamaGarticBots } from '../ai/gartic-bots';
import {
  HostOllamaGateway,
  MultiplayerStudySession,
  OLLAMA_NOT_DETECTED_MESSAGE,
  type FlashcardDeck,
  type FlashcardDifficulty,
  type FlashcardItem,
  type FlashcardStyle,
} from '../ai/ollama-gateway';
import { GarticGame, type GarticAction, type GarticView } from '../minigames/gartic-phone';
import { SharedRoom } from '../minigames/room';
import { WerewolvesGame, type WerewolvesAction, type WerewolvesView } from '../minigames/werewolves';
import { GroupProjectsBoard, type ProjectsAction, type ProjectsView } from '../projects/group-projects';
import { SecureNotesStore, type SecureNote } from '../notes/secure-notes';
import type { AppActions, AppView } from '../protocol/types';
import { GarticPanel } from './gartic-ui';
import { NotesPanel } from './notes-ui';
import { ProjectsPanel } from './projects-ui';
import { WerewolvesPanel } from './werewolves-ui';
import { WhiteboardRegistry } from '../whiteboard/boards-registry';
import {
  DEFAULT_AREA_OBJECTS,
  WORLD_AREAS,
  type BuiltinAreaId,
} from '../world/areas';
import {
  EnvironmentController,
  TIME_OF_DAY_LABELS,
  WEATHER_LABELS,
  type ParticleQuality,
  type TimeOfDay,
  type WeatherKind,
} from '../world/environment';
import {
  InteractiveObjectRegistry,
  type InteractiveObjectConfig,
  type ObjectPermissionScope,
  type ObjectVisibilityScope,
} from '../world/interactive-objects';
import { generateFurniturePixelSprite } from '../ai/study-ai';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  textContent = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function appendChildren<T extends HTMLElement>(parent: T, ...children: (Node | null | undefined)[]): T {
  for (const c of children) if (c) parent.append(c);
  return parent;
}

function btn(label: string, className = 'sv-button sv-button-small'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

export interface WorldExpansionCallbacks {
  getView(): AppView | null;
  getCurrentArea(): BuiltinAreaId;
  setCurrentArea(area: BuiltinAreaId): void;
  openBoardById(boardId: string, label: string): void;
  navigateToPane(pane: 'world' | 'house' | 'board' | 'contacts' | 'diagnostics'): void;
  notify(msg: string): void;
  requestStageRedraw(): void;
  /** A full-screen activity opened or closed: the stage must stop taking keys. */
  activityChanged(open: boolean): void;
  actions: Pick<AppActions, 'sendApp' | 'onApp' | 'setCameraActivity' | 'toggleGameCamera'>;
}

type ActivityKind = 'werewolves' | 'gartic' | 'notes' | 'projects';
type ModalKind = ActivityKind | 'ollama_study' | 'object_inspector';

export class WorldExpansionUIController {
  readonly objectRegistry: InteractiveObjectRegistry;
  readonly environment: EnvironmentController;
  readonly boardRegistry: WhiteboardRegistry;
  readonly notesStore: SecureNotesStore;
  readonly ollamaGateway: HostOllamaGateway;
  readonly studySession: MultiplayerStudySession;

  private callbacks: WorldExpansionCallbacks;
  private cameraDock: GameCameraDock;

  // Shared activities: one authority (the village host, or this device offline).
  readonly werewolvesRoom: SharedRoom<WerewolvesAction, WerewolvesView>;
  readonly garticRoom: SharedRoom<GarticAction, GarticView, GarticGame>;
  readonly studyRoom: SharedRoom<QuizAction, QuizView, StudyQuiz>;
  private studyPanel: StudyPanel;
  private garticBots: OllamaGarticBots;
  readonly projectsRoom: SharedRoom<ProjectsAction, ProjectsView, GroupProjectsBoard>;
  private werewolvesPanel: WerewolvesPanel;
  private garticPanel: GarticPanel;
  private projectsPanel: ProjectsPanel;
  private notesPanel: NotesPanel;
  private activityUnsubscribe: (() => void) | null = null;

  // Stage bar & modals
  private stageToolbar!: HTMLElement;
  private todSelect!: HTMLSelectElement;
  private weatherSelect!: HTMLSelectElement;
  private autoCycleCheckbox!: HTMLInputElement;
  private ambientAudioCheckbox!: HTMLInputElement;
  private particleSelect!: HTMLSelectElement;

  // Modals
  private modalOverlay!: HTMLElement;
  private modalCard!: HTMLElement;
  private activityOverlay!: HTMLElement;
  private activeModalKind: ModalKind | null = null;
  private inspectedObjectId: string | null = null;
  private flashcardCreationMode: 'manual' | 'ai' = 'manual';
  private editingFlashcardId: string | null = null;

  constructor(callbacks: WorldExpansionCallbacks) {
    this.callbacks = callbacks;
    this.cameraDock = new GameCameraDock(() => callbacks.actions.toggleGameCamera());
    this.objectRegistry = new InteractiveObjectRegistry(DEFAULT_AREA_OBJECTS);
    this.environment = new EnvironmentController();
    this.boardRegistry = new WhiteboardRegistry();
    this.notesStore = new SecureNotesStore('local-owner');
    this.ollamaGateway = new HostOllamaGateway();

    const defaultDeck = this.ollamaGateway.listDecks()[0];
    this.studySession = new MultiplayerStudySession(defaultDeck, {
      id: 'local-host',
      displayName: 'Explorador',
      color: '#df8a72',
    });

    const context = () => {
      const view = this.callbacks.getView();
      const joined = view?.network.phase === 'JOINED';
      return { selfId: view?.identity.fingerprint || 'local-host', hostId: joined ? view!.network.hostId : null };
    };
    const me = () => { const a = this.getActor(); return { name: a.displayName, color: a.color }; };
    this.werewolvesRoom = new SharedRoom('werewolves', callbacks.actions, context, () => new WerewolvesGame(undefined, context().selfId));
    this.garticRoom = new SharedRoom('gartic', callbacks.actions, context, () => new GarticGame(undefined, context().selfId));
    this.studyRoom = new SharedRoom('study', callbacks.actions, context, () => new StudyQuiz(context().selfId));
    this.garticBots = new OllamaGarticBots(this.ollamaGateway, this.garticRoom, m => callbacks.notify(m));
    this.studyPanel = new StudyPanel({ actor: () => this.getActor(), close: () => this.closeModal(), notify: m => callbacks.notify(m), gateway: this.ollamaGateway, room: this.studyRoom, bots: this.garticBots });
    this.projectsRoom = new SharedRoom('projects', callbacks.actions, context, () => new GroupProjectsBoard());
    this.werewolvesPanel = new WerewolvesPanel({ send: (a) => this.werewolvesRoom.act(a), close: () => this.closeModal(), me });
    this.garticPanel = new GarticPanel({ send: (a) => this.garticRoom.act(a), close: () => this.closeModal(), me, advanced: container => this.garticBotSettings(container) });
    this.projectsPanel = new ProjectsPanel({
      send: (a) => this.projectsRoom.act(a),
      close: () => this.closeModal(),
      notify: (m) => this.callbacks.notify(m),
      me: () => {
        const a = this.getActor();
        const v = this.callbacks.getView();
        return { id: a.id, name: a.displayName, color: a.color, online: v?.network.phase === 'JOINED', isHost: !!v?.network.isHost };
      },
    });
    this.notesPanel = new NotesPanel({
      store: this.notesStore,
      actorId: () => this.getActor().id,
      close: () => this.closeModal(),
      notify: (m) => this.callbacks.notify(m),
      makeDeck: (note) => this.deckFromNote(note),
      makeAiDeck: null,
    });
  }

  /** Called on every view change so activities follow the session (online, offline, new host). */
  syncSession(): void {
    this.werewolvesRoom.sync();
    this.garticRoom.sync();
    this.studyRoom.sync();
    const view = this.callbacks.getView();
    if (!view) return;
    this.cameraDock.update(view);
    // «Working now» only means something for people who are actually here.
    const present = new Set(view.network.members.filter((m) => m.connected).map((m) => m.identity.fingerprint));
    present.add(view.identity.fingerprint);
    this.projectsRoom.mutate((board) => board.prune(present));
    this.studyRoom.mutate(engine => engine.prune(present));
  }

  isModalOpen(): boolean { return this.activeModalKind !== null; }

  openActivity(kind: ActivityKind): void { this.openModal(kind); }

  private deckFromNote(note: SecureNote): void {
    const actor = this.getActor();
    const deck = this.ollamaGateway.createManualDeck(`Apunte: ${note.title}`, actor.id, 'shared_read');
    this.studySession.setDeck(deck);
    this.flashcardCreationMode = 'manual';
    this.editingFlashcardId = null;
    this.callbacks.notify(`Mazo «${deck.title}» listo para añadir tarjetas.`);
    this.studyPanel.openDeck(deck.id);
    this.openModal('ollama_study');
  }

  private getActor(): { id: string; displayName: string; color: string; isHost: boolean } {
    const v = this.callbacks.getView();
    if (!v) {
      return { id: 'local-host', displayName: 'Explorador', color: '#df8a72', isHost: true };
    }
    const isOnline = v.network.phase === 'JOINED';
    return {
      id: v.identity.fingerprint || 'local-host',
      displayName: v.identity.displayName || 'Explorador',
      color: v.identity.color || '#df8a72',
      isHost: !isOnline || v.network.isHost,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Environment settings and station dialogs
  // ---------------------------------------------------------------------------

  mountStageControls(settings: HTMLElement, shell: HTMLElement): void {
    this.stageToolbar = el('div', 'sv-world-expansion-bar');
    this.stageToolbar.dataset.testid = 'world-expansion-bar';

    // Row 2: Environment Controls (Day/Night + Weather + Audio + Particles)
    const envRow = el('div', 'sv-expansion-row sv-env-row');
    const envLabel = el('span', 'sv-field-label', 'Ambiente:');

    this.todSelect = el('select', 'sv-select');
    this.todSelect.setAttribute('aria-label', 'Hora del día');
    this.todSelect.dataset.testid = 'env-time-select';
    for (const [tod, label] of Object.entries(TIME_OF_DAY_LABELS) as [TimeOfDay, string][]) {
      const opt = el('option', '', label);
      opt.value = tod;
      this.todSelect.append(opt);
    }
    this.todSelect.value = this.environment.getState().timeOfDay;
    this.todSelect.addEventListener('change', () => {
      this.environment.update({
        timeOfDay: this.todSelect.value as TimeOfDay,
        cycleMode: 'manual',
      });
      this.autoCycleCheckbox.checked = false;
      this.callbacks.requestStageRedraw();
    });

    this.weatherSelect = el('select', 'sv-select');
    this.weatherSelect.setAttribute('aria-label', 'Clima del vecindario');
    this.weatherSelect.dataset.testid = 'env-weather-select';
    for (const [w, label] of Object.entries(WEATHER_LABELS) as [WeatherKind, string][]) {
      const opt = el('option', '', label);
      opt.value = w;
      this.weatherSelect.append(opt);
    }
    this.weatherSelect.value = this.environment.getState().weather;
    this.weatherSelect.addEventListener('change', () => {
      this.environment.update({ weather: this.weatherSelect.value as WeatherKind });
      this.callbacks.requestStageRedraw();
    });

    const autoWrap = el('label', 'sv-env-toggle');
    this.autoCycleCheckbox = el('input');
    this.autoCycleCheckbox.type = 'checkbox';
    this.autoCycleCheckbox.checked = this.environment.getState().cycleMode === 'auto';
    this.autoCycleCheckbox.addEventListener('change', () => {
      this.environment.update({ cycleMode: this.autoCycleCheckbox.checked ? 'auto' : 'manual' });
      this.callbacks.requestStageRedraw();
    });
    appendChildren(autoWrap, this.autoCycleCheckbox, el('span', '', 'Ciclo solar'));

    const audioWrap = el('label', 'sv-env-toggle');
    this.ambientAudioCheckbox = el('input');
    this.ambientAudioCheckbox.type = 'checkbox';
    this.ambientAudioCheckbox.checked = this.environment.getState().ambientAudioEnabled;
    this.ambientAudioCheckbox.addEventListener('change', () => {
      this.environment.update({ ambientAudioEnabled: this.ambientAudioCheckbox.checked });
    });
    appendChildren(audioWrap, this.ambientAudioCheckbox, el('span', '', '🔊 Sonido'));

    this.particleSelect = el('select', 'sv-select');
    this.particleSelect.setAttribute('aria-label', 'Densidad de partículas');
    for (const [val, label] of [
      ['medium', 'Partículas: Media'],
      ['high', 'Partículas: Alta'],
      ['low', 'Partículas: Baja'],
      ['off', 'Partículas: Off'],
    ] as const) {
      const opt = el('option', '', label);
      opt.value = val;
      this.particleSelect.append(opt);
    }
    this.particleSelect.value = this.environment.getState().particleQuality;
    this.particleSelect.addEventListener('change', () => {
      this.environment.update({ particleQuality: this.particleSelect.value as ParticleQuality });
      this.callbacks.requestStageRedraw();
    });

    const sound = el('select', 'sv-select');
    sound.setAttribute('aria-label', 'Sonido de fondo');
    for (const [value, label] of [['weather', 'Según el clima'], ['rain', 'Lluvia'], ['wind', 'Viento'], ['brown_noise', 'Ruido marrón']]) {
      const option = el('option', '', label); option.value = value; sound.append(option);
    }
    sound.value = this.environment.getState().ambientSound;
    sound.addEventListener('change', () => this.environment.update({ ambientSound: sound.value as 'weather' | 'rain' | 'wind' | 'brown_noise' }));
    const volume = el('input', 'sv-input');
    volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '0.05';
    volume.value = String(this.environment.getState().ambientVolume);
    volume.setAttribute('aria-label', 'Volumen del ambiente');
    volume.addEventListener('input', () => this.environment.update({ ambientVolume: Number(volume.value) }));
    const soundLabel = el('label', 'sv-stack', 'Sonido de fondo'); soundLabel.append(sound);
    const volumeLabel = el('label', 'sv-stack', 'Volumen del ambiente'); volumeLabel.append(volume);
    envRow.append(el('h3', '', 'Ambiente'), soundLabel, volumeLabel);

    appendChildren(
      envRow,
      envLabel,
      this.todSelect,
      this.weatherSelect,
      autoWrap,
      audioWrap,
      this.particleSelect,
    );

    appendChildren(this.stageToolbar, envRow);
    settings.append(this.stageToolbar);

    // Universal Modal Overlay
    this.modalOverlay = el('div', 'sv-lock-overlay sv-ai-modal-overlay');
    this.modalOverlay.hidden = true;
    this.modalOverlay.dataset.testid = 'expansion-modal-overlay';
    this.modalCard = el('section', 'sv-card sv-ai-modal-card sv-expansion-modal-card');
    this.modalCard.setAttribute('role', 'dialog');
    this.modalCard.setAttribute('aria-modal', 'true');
    this.modalOverlay.append(this.modalCard);
    // Games, notes and projects take the whole window, like opening an app.
    this.activityOverlay = el('div', 'sv-activity');
    this.activityOverlay.hidden = true;
    this.activityOverlay.setAttribute('role', 'dialog');
    this.activityOverlay.setAttribute('aria-modal', 'true');
    this.activityOverlay.dataset.testid = 'expansion-modal-overlay';
    this.modalOverlay.dataset.testid = 'expansion-card-overlay';
    shell.append(this.modalOverlay, this.activityOverlay);

    this.refreshStageControls();
  }

  refreshStageControls(): void {
    const envState = this.environment.getState();
    if (this.todSelect && document.activeElement !== this.todSelect) {
      this.todSelect.value = envState.timeOfDay;
    }
    if (this.weatherSelect && document.activeElement !== this.weatherSelect) {
      this.weatherSelect.value = envState.weather;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Interactive Station Triggering & Object Inspector (Part 3)
  // ---------------------------------------------------------------------------

  interactWithWorldObject(obj: InteractiveObjectConfig): void {
    const actor = this.getActor();
    if (!this.objectRegistry.canUse(obj, actor.id, actor.isHost)) {
      this.callbacks.notify(`🔒 No tienes permiso para usar «${obj.displayName}».`);
      return;
    }

    switch (obj.kind) {
      case 'campfire_werewolves':
        this.openModal('werewolves');
        break;
      case 'drawing_table_gartic':
        this.openModal('gartic');
        break;
      case 'whiteboard':
        this.callbacks.openBoardById(obj.linkedBoardId || `board:${obj.id}`, obj.displayName);
        break;
      case 'computer_project':
        this.openModal('projects');
        break;
      case 'bookshelf_notes':
      case 'study_desk':
        this.openModal('notes');
        break;
      case 'flashcard_podium':
      case 'ai_tutor_console':
        this.openModal('ollama_study');
        break;
      case 'voice_table':
        this.callbacks.notify(`En «${obj.displayName}» se oye a quien esté en la plaza. Abre «Voz» en el móvil para hablar o compartir pantalla.`);
        break;
      default:
        this.openObjectInspector(obj.id);
        break;
    }
  }

  openObjectInspector(objectId: string): void {
    this.inspectedObjectId = objectId;
    this.openModal('object_inspector');
  }

  openModal(kind: ModalKind): void {
    this.closeModal();
    this.activeModalKind = kind;
    this.callbacks.activityChanged(true);
    if (kind === 'werewolves' || kind === 'gartic' || kind === 'notes' || kind === 'projects' || kind === 'ollama_study') {
      this.activityOverlay.hidden = false;
      this.activityOverlay.dataset.kind = kind;
      if (kind === 'ollama_study') { this.studyPanel.mount(this.activityOverlay); return; }
      if (kind === 'notes') { this.notesPanel.mount(this.activityOverlay); return; }
      const [room, panel] = kind === 'werewolves'
        ? [this.werewolvesRoom, this.werewolvesPanel] as const
        : kind === 'gartic' ? [this.garticRoom, this.garticPanel] as const : [this.projectsRoom, this.projectsPanel] as const;
      panel.mount(this.activityOverlay);
      // Each room/panel pair shares one view type; TypeScript cannot see that through the union.
      this.activityUnsubscribe = (room as SharedRoom<unknown, unknown>).subscribe((view, error) => (panel as { update(v: unknown, e: string | null): void }).update(view, error));
      room.refresh();
      if (kind === 'werewolves' || kind === 'gartic') {
        this.cameraDock.mount(this.activityOverlay);
        this.callbacks.actions.setCameraActivity(kind);
        const current = this.callbacks.getView(); if (current) this.cameraDock.update(current);
      }
      if ((kind === 'werewolves' || kind === 'gartic') && room.canStop()) {
        const stop = btn('Terminar partida', 'sv-activity-stop');
        let armed = false;
        stop.addEventListener('click', () => {
          if (!armed) { armed = true; stop.textContent = '¿Terminar para todos?'; setTimeout(() => { armed = false; stop.textContent = 'Terminar partida'; }, 3000); return; }
          if (kind === 'gartic') this.garticBots.cancel();
          room.stop(); armed = false; stop.textContent = 'Terminar partida';
        });
        this.activityOverlay.append(stop);
      }
      return;
    }
    this.modalOverlay.hidden = false;
    this.renderActiveModal();
  }

  closeModal(): void {
    const wasOpen = this.activeModalKind !== null;
    this.cameraDock.unmount();
    this.callbacks.actions.setCameraActivity(null);
    this.activityUnsubscribe?.();
    this.activityUnsubscribe = null;
    this.werewolvesPanel.unmount();
    this.garticPanel.unmount();
    this.projectsPanel.unmount();
    this.notesPanel.unmount();
    this.studyPanel.unmount();
    this.activeModalKind = null;
    this.modalOverlay.hidden = true;
    this.activityOverlay.hidden = true;
    this.modalCard.replaceChildren();
    if (wasOpen) this.callbacks.activityChanged(false);
  }

  private renderModalHeader(eyebrowText: string, titleText: string, inspectableObjectId?: string): HTMLElement {
    const head = el('div', 'sv-ai-modal-head');
    const titleWrap = el('div');
    appendChildren(titleWrap, el('div', 'sv-eyebrow', eyebrowText), el('h2', '', titleText));

    const actions = el('div', 'sv-inline');
    if (inspectableObjectId) {
      const cfgBtn = btn('⚙️ Personalizar Objeto / Sprite', 'sv-button sv-button-small');
      cfgBtn.addEventListener('click', () => this.openObjectInspector(inspectableObjectId));
      actions.append(cfgBtn);
    }
    const closeB = btn('Cerrar ×', 'sv-button sv-button-small');
    closeB.dataset.testid = 'expansion-modal-close';
    closeB.addEventListener('click', () => this.closeModal());
    actions.append(closeB);
    appendChildren(head, titleWrap, actions);
    return head;
  }

  private renderActiveModal(): void {
    this.modalCard.replaceChildren();
    if (this.activeModalKind === 'ollama_study') this.renderOllamaAndStudyModal();
    else if (this.activeModalKind === 'object_inspector') this.renderObjectInspectorModal();
  }

  // ---------------------------------------------------------------------------
  // 3. Object Inspector & Sprite Customizer Modal (Part 3)
  // ---------------------------------------------------------------------------

  private renderObjectInspectorModal(): void {
    const obj = this.inspectedObjectId ? this.objectRegistry.get(this.inspectedObjectId) : null;
    if (!obj) {
      this.closeModal();
      return;
    }
    const actor = this.getActor();
    const canEdit = this.objectRegistry.canConfigure(obj, actor.id, actor.isHost);

    const head = this.renderModalHeader(
      'SISTEMA DE OBJETOS INTERACTIVOS · SPRITES Y PERMISOS',
      `Configurar: ${obj.displayName}`,
    );

    const desc = el('p', 'sv-subtle', obj.description);

    const form = el('div', 'sv-stack');
    const nameInput = el('input', 'sv-input');
    nameInput.value = obj.displayName;
    nameInput.maxLength = 48;
    nameInput.disabled = !canEdit;

    const colorInput = el('input', 'sv-color-input');
    colorInput.type = 'color';
    colorInput.value = obj.customColor || '#9c7349';
    colorInput.disabled = !canEdit;

    const visSelect = el('select', 'sv-select');
    for (const [v, l] of [
      ['everyone', 'Visible para toda la aldea'],
      ['participants', 'Solo participantes conectados'],
      ['owner_only', 'Solo propietario / anfitrión'],
    ] as [ObjectVisibilityScope, string][]) {
      const o = el('option', '', l);
      o.value = v;
      visSelect.append(o);
    }
    visSelect.value = obj.visibility;
    visSelect.disabled = !canEdit;

    const usePermSelect = el('select', 'sv-select');
    for (const [v, l] of [
      ['public', 'Uso: Cualquier persona'],
      ['participants', 'Uso: Miembros de la sesión'],
      ['host_only', 'Uso: Solo anfitrión'],
      ['owner_only', 'Uso: Solo propietario'],
    ] as [ObjectPermissionScope, string][]) {
      const o = el('option', '', l);
      o.value = v;
      usePermSelect.append(o);
    }
    usePermSelect.value = obj.usePermission;
    usePermSelect.disabled = !canEdit;

    const spriteRow = el('div', 'sv-inline');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/webp,image/jpeg';
    fileInput.hidden = true;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 512 * 1024) {
        this.callbacks.notify('El sprite supera 512 KB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          try {
            this.objectRegistry.assignCustomSprite(obj.id, reader.result, colorInput.value, actor.id, actor.isHost);
            this.callbacks.requestStageRedraw();
            this.callbacks.notify(`Sprite PNG aplicado a «${obj.displayName}».`);
            this.renderActiveModal();
          } catch (e) {
            this.callbacks.notify(e instanceof Error ? e.message : 'Error al asignar sprite.');
          }
        }
      };
      reader.readAsDataURL(file);
    });

    const uploadBtn = btn('📁 Subir Sprite PNG/WebP');
    uploadBtn.disabled = !canEdit;
    uploadBtn.addEventListener('click', () => fileInput.click());

    const aiSpriteBtn = btn('✨ Generar Sprite Pixel-Art IA', 'sv-button sv-button-small sv-button-primary');
    aiSpriteBtn.disabled = !canEdit;
    aiSpriteBtn.addEventListener('click', () => {
      void generateFurniturePixelSprite({ kind: 'table', prompt: nameInput.value || obj.defaultLabel }).then(
        ({ dataUrl }) => {
          this.objectRegistry.assignCustomSprite(obj.id, dataUrl, colorInput.value, actor.id, actor.isHost);
          this.callbacks.requestStageRedraw();
          this.callbacks.notify(`Sprite Pixel-Art generado para «${obj.displayName}».`);
          this.renderActiveModal();
        },
      );
    });

    const resetSpriteBtn = btn('Restaurar sprite original');
    resetSpriteBtn.disabled = !canEdit;
    resetSpriteBtn.addEventListener('click', () => {
      this.objectRegistry.assignCustomSprite(obj.id, null, null, actor.id, actor.isHost);
      this.callbacks.requestStageRedraw();
      this.renderActiveModal();
    });

    appendChildren(spriteRow, uploadBtn, aiSpriteBtn, resetSpriteBtn, fileInput);

    const saveBtn = btn('Guardar cambios del objeto', 'sv-button sv-button-primary');
    saveBtn.disabled = !canEdit;
    saveBtn.addEventListener('click', () => {
      try {
        this.objectRegistry.renameObject(obj.id, nameInput.value, actor.id, actor.isHost);
        this.objectRegistry.assignCustomSprite(
          obj.id,
          obj.customSpriteDataUrl,
          colorInput.value,
          actor.id,
          actor.isHost,
        );
        this.objectRegistry.updatePermissions(
          obj.id,
          {
            visibility: visSelect.value as ObjectVisibilityScope,
            usePermission: usePermSelect.value as ObjectPermissionScope,
          },
          actor.id,
          actor.isHost,
        );
        this.callbacks.requestStageRedraw();
        this.callbacks.notify(`Objeto «${nameInput.value}» actualizado.`);
        this.closeModal();
      } catch (err) {
        this.callbacks.notify(err instanceof Error ? err.message : 'No se pudo guardar.');
      }
    });

    appendChildren(
      form,
      el('span', 'sv-field-label', 'Nombre visible sobre el objeto'),
      nameInput,
      el('span', 'sv-field-label', 'Color base y Sprite personalizado'),
      colorInput,
      spriteRow,
      el('span', 'sv-field-label', 'Visibilidad y permisos de interacción'),
      visSelect,
      usePermSelect,
      saveBtn,
    );

    appendChildren(this.modalCard, head, desc, form);
  }

  // ---------------------------------------------------------------------------
  // 8. Optional Local Ollama Gateway, Flashcards & Multiplayer Study Session (Part 10)
  // ---------------------------------------------------------------------------

  private renderOllamaAndStudyModal(): void { /* StudyPanel owns its own view. */ }

  private garticBotSettings(container: HTMLElement): void {
    if (!this.getActor().isHost) { container.append(el('p', '', 'Solo el anfitrión configura la IA.')); return; }
    container.append(el('p', '', 'Necesita Ollama local, un modelo con visión y generación de trazos. No se añaden respuestas prefabricadas.'));
    const status = el('p', '', this.garticBots.ready() ? 'Modelo comprobado.' : 'Sin modelo compatible comprobado.');
    const detect = btn('Detectar Ollama');
    detect.onclick = () => { detect.disabled = true; void this.ollamaGateway.probeOllamaModels().then(result => {
      if (!result.reachable || !result.availableModels.length) throw new Error('No se pudo detectar Ollama.');
      this.ollamaGateway.configure({ enabled: true, selectedModel: result.availableModels[0] }, true);
      model.replaceChildren(); for (const name of result.availableModels) { const o = el('option', '', name); o.value = name; model.append(o); }
      status.textContent = 'Elige el modelo y comprueba su compatibilidad.';
    }).catch(e => { status.textContent = String(e instanceof Error ? e.message : e); }).finally(() => { detect.disabled = false; }); };
    const model = el('select', 'sv-select'); model.setAttribute('aria-label', 'Modelo para bots');
    for (const name of this.ollamaGateway.getStatus().availableModels) { const o = el('option', '', name); o.value = name; model.append(o); }
    model.value = this.ollamaGateway.getConfig().selectedModel;
    model.onchange = () => { this.garticBots.disable(); this.ollamaGateway.configure({ selectedModel: model.value, enabled: true }, true); status.textContent = 'Comprueba el nuevo modelo.'; };
    const check = btn('Comprobar compatibilidad');
    check.onclick = () => { check.disabled = true; status.textContent = 'Comprobando visión y dibujo…'; void this.garticBots.enable().then(() => { status.textContent = 'Modelo compatible. Ya puedes añadir bots.'; }).catch(e => { status.textContent = e instanceof Error ? e.message : 'Modelo incompatible.'; }).finally(() => { check.disabled = false; }); };
    const disable = btn('Desactivar bots'); disable.onclick = () => { this.garticBots.disable(); status.textContent = 'Bots desactivados.'; };
    const timeout = el('input', 'sv-input'); timeout.type = 'number'; timeout.min = '5'; timeout.max = '120'; timeout.value = String(this.ollamaGateway.getConfig().timeoutMs / 1000);
    timeout.setAttribute('aria-label', 'Tiempo máximo de inferencia (segundos)'); timeout.onchange = () => this.ollamaGateway.configure({ timeoutMs: Math.max(5000, Math.min(120000, Number(timeout.value) * 1000 || 20000)) }, true);
    const rate = el('input', 'sv-input'); rate.type = 'number'; rate.min = '1'; rate.max = '60'; rate.value = String(this.ollamaGateway.getConfig().maxRequestsPerMinute);
    rate.setAttribute('aria-label', 'Solicitudes máximas por minuto'); rate.onchange = () => this.ollamaGateway.configure({ maxRequestsPerMinute: Math.max(1, Math.min(60, Number(rate.value) || 6)) }, true);
    container.append(detect, model, check, disable, status, el('p', '', 'Límites de inferencia: segundos por solicitud y solicitudes por minuto.'), timeout, rate);
  }

  dispose(): void {
    this.closeModal(); this.garticBots.dispose(); this.werewolvesRoom.dispose(); this.garticRoom.dispose(); this.studyRoom.dispose(); this.projectsRoom.dispose(); this.environment.dispose();
  }
}
