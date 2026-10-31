import {
  HostOllamaGateway,
  MultiplayerStudySession,
  OLLAMA_NOT_DETECTED_MESSAGE,
  type FlashcardDeck,
  type FlashcardDifficulty,
  type FlashcardItem,
  type FlashcardStyle,
} from '../ai/ollama-gateway';
import { CollaborativeProjectManager } from '../editor/projects';
import { ARCADE_TRIVIA_BANK } from '../minigames/framework';
import { GarticPhoneEngine, type GarticGameMode } from '../minigames/gartic-phone';
import { WEREWOLF_ROLE_LABELS, WerewolvesEngine } from '../minigames/werewolves';
import {
  SecureNotesStore,
  renderSafeMarkdownWithLatex,
  type NoteVisibility,
} from '../notes/secure-notes';
import type { AppView } from '../protocol/types';
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
  navigateToPane(pane: 'world' | 'house' | 'board' | 'editor' | 'contacts' | 'diagnostics'): void;
  notify(msg: string): void;
  requestStageRedraw(): void;
}

export class WorldExpansionUIController {
  readonly objectRegistry: InteractiveObjectRegistry;
  readonly environment: EnvironmentController;
  readonly boardRegistry: WhiteboardRegistry;
  readonly notesStore: SecureNotesStore;
  readonly projectManager: CollaborativeProjectManager;
  readonly ollamaGateway: HostOllamaGateway;
  readonly studySession: MultiplayerStudySession;

  private werewolvesEngine: WerewolvesEngine;
  private garticEngine: GarticPhoneEngine;
  private callbacks: WorldExpansionCallbacks;

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
  private activeModalKind:
    | 'werewolves'
    | 'gartic'
    | 'arcade'
    | 'notes'
    | 'ollama_study'
    | 'object_inspector'
    | null = null;
  private inspectedObjectId: string | null = null;
  private selectedNoteId: string | null = null;
  private selectedNotebookId = 'notebook:general';
  private noteSearchQuery = '';
  private triviaIndex = 0;
  private triviaScore = 0;

  // Embedded Gartic drawing canvas state
  private garticStrokeHistory: ImageData[] = [];
  private garticRedoStack: ImageData[] = [];

  // Multi-file Project Workspace DOM inside Editor Pane
  private projectContainer!: HTMLElement;
  private selectedProjectId = 'project:community-main';
  private flashcardCreationMode: 'manual' | 'ai' = 'manual';
  private editingFlashcardId: string | null = null;

  constructor(callbacks: WorldExpansionCallbacks) {
    this.callbacks = callbacks;
    this.objectRegistry = new InteractiveObjectRegistry(DEFAULT_AREA_OBJECTS);
    this.environment = new EnvironmentController();
    this.boardRegistry = new WhiteboardRegistry();
    this.notesStore = new SecureNotesStore('local-owner');
    this.projectManager = new CollaborativeProjectManager('local-host');
    this.ollamaGateway = new HostOllamaGateway();

    const defaultDeck = this.ollamaGateway.listDecks()[0];
    this.studySession = new MultiplayerStudySession(defaultDeck, {
      id: 'local-host',
      displayName: 'Explorador',
      color: '#df8a72',
    });

    this.werewolvesEngine = new WerewolvesEngine({
      id: 'local-host',
      displayName: 'Explorador',
      color: '#df8a72',
    });
    this.garticEngine = new GarticPhoneEngine({
      id: 'local-host',
      displayName: 'Explorador',
      color: '#df8a72',
    });
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
    shell.append(this.modalOverlay);

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
      case 'arcade_machine':
        this.openModal('arcade');
        break;
      case 'whiteboard':
        this.callbacks.openBoardById(obj.linkedBoardId || `board:${obj.id}`, obj.displayName);
        break;
      case 'computer_project':
        this.callbacks.navigateToPane('editor');
        this.callbacks.notify(`💻 Abierto «${obj.displayName}»: explora archivos, pestañas y solicita ejecución al anfitrión.`);
        break;
      case 'bookshelf_notes':
        this.openModal('notes');
        break;
      case 'flashcard_podium':
      case 'ai_tutor_console':
        this.openModal('ollama_study');
        break;
      case 'study_desk':
        this.openModal('notes');
        this.callbacks.notify(`🪑 Sentado en «${obj.displayName}»: toma apuntes seguros o genera tarjetas de repaso.`);
        break;
      case 'voice_table':
        this.callbacks.notify(`🎙️ En «${obj.displayName}»: usa los controles de Voz y Pantalla HD en el panel derecho.`);
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

  openModal(
    kind: 'werewolves' | 'gartic' | 'arcade' | 'notes' | 'ollama_study' | 'object_inspector',
  ): void {
    this.activeModalKind = kind;
    this.modalOverlay.hidden = false;
    this.renderActiveModal();
  }

  closeModal(): void {
    this.activeModalKind = null;
    this.modalOverlay.hidden = true;
    this.modalCard.replaceChildren();
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
    switch (this.activeModalKind) {
      case 'werewolves':
        this.renderWerewolvesModal();
        break;
      case 'gartic':
        this.renderGarticModal();
        break;
      case 'arcade':
        this.renderArcadeModal();
        break;
      case 'notes':
        this.renderSecureNotesModal();
        break;
      case 'ollama_study':
        this.renderOllamaAndStudyModal();
        break;
      case 'object_inspector':
        this.renderObjectInspectorModal();
        break;
    }
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
  // 4. Werewolves / Loup-Garou UI (Part 5)
  // ---------------------------------------------------------------------------

  private renderWerewolvesModal(): void {
    const actor = this.getActor();
    // Ensure current actor is joined if in LOBBY
    const lobby = this.werewolvesEngine.getLobbyState();
    if (lobby.phase === 'LOBBY' && !lobby.participants.some((p) => p.id === actor.id)) {
      try {
        this.werewolvesEngine.join({ id: actor.id, displayName: actor.displayName, color: actor.color });
      } catch {
        // Ignore if full
      }
    }

    // Sync online village members into the lobby if available
    const appView = this.callbacks.getView();
    if (appView && lobby.phase === 'LOBBY') {
      for (const m of appView.network.members) {
        if (m.connected && !this.werewolvesEngine.getLobbyState().participants.some((p) => p.id === m.identity.fingerprint)) {
          try {
            this.werewolvesEngine.join({
              id: m.identity.fingerprint,
              displayName: m.identity.displayName,
              color: m.identity.color,
            });
          } catch {
            // Max 6 players
          }
        }
      }
    }

    const view = this.werewolvesEngine.getPlayerView(actor.id);
    const updatedLobby = this.werewolvesEngine.getLobbyState();

    const head = this.renderModalHeader(
      'PLAZA COMUNITARIA · DEDUCCIÓN SOCIAL (3 A 6 JUGADORES)',
      '🐺 Hombres Lobo de StudyVillage (Loup-Garou)',
      'community:campfire-werewolves',
    );
    this.modalCard.append(head);

    if (view.subPhase === 'LOBBY') {
      const info = el(
        'p',
        'sv-subtle',
        'Reúne entre 3 y 6 jugadores alrededor de la hoguera. Cada jugador recibe un rol secreto (Hombre Lobo, Vidente, Guardián, Bruja o Aldeano). Si sois menos de 3 humanos conectados, puedes completar la mesa con compañeros Bot.',
      );

      const listWrap = el('div', 'sv-quiz-card');
      listWrap.append(
        el('strong', '', `Jugadores en la hoguera (${updatedLobby.participants.length}/6 — mínimo 3):`),
      );
      const pList = el('div', 'sv-inline');
      for (const p of updatedLobby.participants) {
        const badge = el(
          'span',
          'sv-latex-chip',
          `${p.displayName}${p.id === updatedLobby.leaderId ? ' ★ Líder' : ''}${p.isBot ? ' 🤖' : ''}`,
        );
        pList.append(badge);
      }
      listWrap.append(pList);

      const controls = el('div', 'sv-inline');
      const addBotsBtn = btn('🤖 Completar mesa con Bots (4 jugadores)', 'sv-button sv-button-small');
      addBotsBtn.dataset.testid = 'werewolves-add-bots-btn';
      addBotsBtn.addEventListener('click', () => {
        this.werewolvesEngine.addCompanionBots(4);
        this.renderActiveModal();
      });

      const startBtn = btn('🔥 Iniciar Partida de Hombres Lobo', 'sv-button sv-button-small sv-button-primary');
      startBtn.dataset.testid = 'werewolves-start-btn';
      startBtn.disabled = updatedLobby.participants.length < 3;
      startBtn.addEventListener('click', () => {
        try {
          this.werewolvesEngine.startGame(updatedLobby.leaderId);
          this.renderActiveModal();
        } catch (err) {
          this.callbacks.notify(err instanceof Error ? err.message : 'No se pudo iniciar.');
        }
      });

      appendChildren(controls, addBotsBtn, startBtn);
      appendChildren(this.modalCard, info, listWrap, controls);
      return;
    }

    // Active Game or Finished state
    const roleMeta = view.ownRole ? WEREWOLF_ROLE_LABELS[view.ownRole] : null;
    const roleBanner = el('div', 'sv-quiz-card');
    roleBanner.dataset.testid = 'werewolves-role-banner';
    appendChildren(
      roleBanner,
      el(
        'strong',
        '',
        `Tu rol secreto: ${roleMeta ? roleMeta.name : 'Espectador'} · Estado: ${view.ownAlive ? 'Vivo ❤️' : 'Eliminado 👻'}`,
      ),
      el('p', 'sv-subtle', roleMeta ? roleMeta.description : 'Observando la partida.'),
    );
    this.modalCard.append(roleBanner);

    // Phase Card
    const phaseCard = el('div', 'sv-quiz-card');
    const phaseTitle =
      view.subPhase === 'NIGHT'
        ? `🌙 Noche ${view.dayNumber} — Acciones Secretas`
        : view.subPhase === 'FINISHED'
          ? `🏆 Partida Finalizada — ${view.winReason}`
          : `☀️ Día ${view.dayNumber} — Debate y Votación de la Aldea`;
    phaseCard.append(el('strong', '', phaseTitle));

    if (view.subPhase === 'NIGHT' && view.ownAlive) {
      const actionRow = el('div', 'sv-inline');
      const livingTargets = view.players.filter((p) => p.alive && p.id !== actor.id);

      if (view.ownRole === 'werewolf') {
        phaseCard.append(el('p', 'sv-subtle', 'Elige en secreto a qué aldeano atacar esta noche:'));
        for (const t of livingTargets) {
          const b = btn(`🐺 Atacar a ${t.displayName}`);
          b.addEventListener('click', () => {
            this.werewolvesEngine.submitNightAction(actor.id, { kind: 'werewolf_attack', targetId: t.id });
            this.werewolvesEngine.resolveNightPhase();
            this.renderActiveModal();
          });
          actionRow.append(b);
        }
      } else if (view.ownRole === 'seer') {
        phaseCard.append(el('p', 'sv-subtle', '🔮 Elige a un jugador vivo para revelar su rol secreto:'));
        for (const t of livingTargets) {
          const b = btn(`🔮 Investigar a ${t.displayName}`);
          b.addEventListener('click', () => {
            this.werewolvesEngine.submitNightAction(actor.id, { kind: 'seer_inspect', targetId: t.id });
            this.renderActiveModal();
          });
          actionRow.append(b);
        }
        if (view.seerInspectionResult) {
          phaseCard.append(
            el(
              'p',
              'sv-quiz-feedback is-correct',
              `🔮 Visión de la Vidente: ${view.seerInspectionResult.targetName} es ${
                WEREWOLF_ROLE_LABELS[view.seerInspectionResult.role].name
              }.`,
            ),
          );
        }
      } else if (view.ownRole === 'doctor') {
        phaseCard.append(el('p', 'sv-subtle', '🛡️ Elige a quién proteger esta noche (puedes protegerte a ti mismo):'));
        for (const t of view.players.filter((p) => p.alive)) {
          const b = btn(`🛡️ Proteger a ${t.displayName}`);
          b.addEventListener('click', () => {
            this.werewolvesEngine.submitNightAction(actor.id, { kind: 'doctor_protect', targetId: t.id });
            this.werewolvesEngine.resolveNightPhase();
            this.renderActiveModal();
          });
          actionRow.append(b);
        }
      } else if (view.ownRole === 'witch') {
        phaseCard.append(el('p', 'sv-subtle', '🧪 Usa tus pociones o pasa a la mañana:'));
        if (view.witchSaveRemaining && view.witchPreviewVictimId) {
          const victim = view.players.find((p) => p.id === view.witchPreviewVictimId);
          const healB = btn(`💚 Salvar a ${victim?.displayName || 'la víctima'}`);
          healB.addEventListener('click', () => {
            this.werewolvesEngine.submitNightAction(actor.id, { kind: 'witch_heal' });
            this.werewolvesEngine.resolveNightPhase();
            this.renderActiveModal();
          });
          actionRow.append(healB);
        }
        if (view.witchPoisonRemaining) {
          for (const t of livingTargets) {
            const poisonB = btn(`☠️ Envenenar a ${t.displayName}`);
            poisonB.addEventListener('click', () => {
              this.werewolvesEngine.submitNightAction(actor.id, { kind: 'witch_poison', targetId: t.id });
              this.werewolvesEngine.resolveNightPhase();
              this.renderActiveModal();
            });
            actionRow.append(poisonB);
          }
        }
      } else {
        phaseCard.append(el('p', 'sv-subtle', 'Duermes tranquilamente mientras los roles nocturnos actúan…'));
      }

      const resolveNightBtn = btn('🌅 Amanecer (Resolver Noche)', 'sv-button sv-button-small sv-button-primary');
      resolveNightBtn.dataset.testid = 'werewolves-resolve-night-btn';
      resolveNightBtn.addEventListener('click', () => {
        this.werewolvesEngine.resolveNightPhase();
        this.renderActiveModal();
      });
      actionRow.append(resolveNightBtn);
      phaseCard.append(actionRow);
    } else if (view.subPhase === 'DAY_VOTING' || view.subPhase === 'DAY_DISCUSSION') {
      phaseCard.append(
        el('p', 'sv-subtle', 'Debatid quién actúa de forma sospechosa y emitid un único voto por persona viva:'),
      );
      const voteRow = el('div', 'sv-inline');
      if (view.ownAlive) {
        for (const candidate of view.players.filter((p) => p.alive && p.id !== actor.id)) {
          const vBtn = btn(`🗳️ Votar a ${candidate.displayName}`);
          vBtn.addEventListener('click', () => {
            this.werewolvesEngine.submitDayVote(actor.id, candidate.id);
            this.werewolvesEngine.resolveDayVotes();
            this.renderActiveModal();
          });
          voteRow.append(vBtn);
        }
        const abstainBtn = btn('🏳️ Abstenerse');
        abstainBtn.addEventListener('click', () => {
          this.werewolvesEngine.submitDayVote(actor.id, 'abstain');
          this.werewolvesEngine.resolveDayVotes();
          this.renderActiveModal();
        });
        voteRow.append(abstainBtn);
      } else {
        const nextBtn = btn('Resolver votación del día', 'sv-button sv-button-small sv-button-primary');
        nextBtn.addEventListener('click', () => {
          this.werewolvesEngine.resolveDayVotes();
          this.renderActiveModal();
        });
        voteRow.append(nextBtn);
      }
      phaseCard.append(voteRow);
    } else if (view.subPhase === 'FINISHED') {
      const restartBtn = btn('🔄 Nueva Partida en la Hoguera', 'sv-button sv-button-small sv-button-primary');
      restartBtn.addEventListener('click', () => {
        this.werewolvesEngine = new WerewolvesEngine({
          id: actor.id,
          displayName: actor.displayName,
          color: actor.color,
        });
        this.renderActiveModal();
      });
      phaseCard.append(restartBtn);
    }

    this.modalCard.append(phaseCard);

    // Players status grid
    const playersGrid = el('div', 'sv-flashcard-grid');
    for (const p of view.players) {
      const pCard = el('div', `sv-quiz-card${p.alive ? '' : ' is-eliminated'}`);
      const roleTag = p.knownRole ? WEREWOLF_ROLE_LABELS[p.knownRole].name : '❓ Rol oculto';
      appendChildren(
        pCard,
        el('strong', '', `${p.displayName} ${p.alive ? '❤️ Vivo' : '💀 Eliminado'}`),
        el('span', 'sv-tiny', roleTag),
      );
      playersGrid.append(pCard);
    }
    this.modalCard.append(playersGrid);

    // Public Chronicle Log
    const logBox = el('div', 'sv-editor-console');
    const logPre = el('pre', 'sv-editor-console-pre', view.publicLog.join('\n'));
    logBox.append(logPre);
    this.modalCard.append(logBox);
  }

  // ---------------------------------------------------------------------------
  // 5. Gartic Phone–Style Drawing & Guessing UI (Part 6)
  // ---------------------------------------------------------------------------

  private renderGarticModal(): void {
    const actor = this.getActor();
    const lobby = this.garticEngine.getLobbyState();
    if (lobby.phase === 'LOBBY' && !lobby.participants.some((p) => p.id === actor.id)) {
      try {
        this.garticEngine.join({ id: actor.id, displayName: actor.displayName, color: actor.color });
      } catch {
        // Ignore if full
      }
    }

    const view = this.garticEngine.getPlayerView(actor.id);
    const updatedLobby = this.garticEngine.getLobbyState();

    const head = this.renderModalHeader(
      'PLAZA COMUNITARIA · TELÉFONO ESCACHARRADO DE DIBUJO',
      '🎨 Gartic Phone de la Aldea',
      'community:drawing-table-gartic',
    );
    this.modalCard.append(head);

    if (view.subPhase === 'LOBBY') {
      const info = el(
        'p',
        'sv-subtle',
        'Escribe una frase creativa, dibuja lo que te llegue sin ver la frase original y adivina los dibujos de tus vecinos. Al final se revela toda la cadena paso a paso.',
      );

      const modeRow = el('div', 'sv-inline');
      const modeSelect = el('select', 'sv-select');
      for (const [m, label] of [
        ['classic', 'Modo: Clásico (Frase → Dibujo → Adivinar)'],
        ['fast', 'Modo: Rápido'],
        ['extended', 'Modo: Extendido'],
        ['theme', 'Modo: Temático de Estudio'],
      ] as [GarticGameMode, string][]) {
        const o = el('option', '', label);
        o.value = m;
        modeSelect.append(o);
      }
      modeSelect.value = view.settings.mode;
      modeSelect.addEventListener('change', () => {
        this.garticEngine.updateSettings(updatedLobby.leaderId, { mode: modeSelect.value as GarticGameMode });
      });

      const addBotsBtn = btn('🤖 Añadir artistas Bot (3 jugadores)', 'sv-button sv-button-small');
      addBotsBtn.dataset.testid = 'gartic-add-bots-btn';
      addBotsBtn.addEventListener('click', () => {
        this.garticEngine.addCompanionBots(3);
        this.renderActiveModal();
      });

      const startBtn = btn('🎨 Empezar Gartic Phone', 'sv-button sv-button-small sv-button-primary');
      startBtn.dataset.testid = 'gartic-start-btn';
      startBtn.disabled = updatedLobby.participants.length < 2;
      startBtn.addEventListener('click', () => {
        this.garticEngine.startGame(updatedLobby.leaderId);
        this.renderActiveModal();
      });

      appendChildren(modeRow, modeSelect, addBotsBtn, startBtn);

      const pBox = el('div', 'sv-quiz-card');
      pBox.append(el('strong', '', `Artistas en la mesa (${updatedLobby.participants.length}/6):`));
      const chips = el('div', 'sv-inline');
      for (const p of updatedLobby.participants) {
        chips.append(el('span', 'sv-latex-chip', `${p.displayName}${p.isBot ? ' 🤖' : ''}`));
      }
      pBox.append(chips);

      appendChildren(this.modalCard, info, pBox, modeRow);
      return;
    }

    if (view.subPhase === 'ACTIVE_ROUND') {
      const roundBox = el('div', 'sv-quiz-card');
      roundBox.append(
        el(
          'strong',
          '',
          `Ronda ${view.currentRound + 1} de ${view.totalRounds} · ${
            view.roundKind === 'PROMPT'
              ? '✍️ Escribe una idea inicial'
              : view.roundKind === 'DRAW'
                ? '🖌️ ¡Te toca dibujar!'
                : '🔍 ¡Adivina qué representa este dibujo!'
          }`,
        ),
      );

      if (view.roundKind === 'PROMPT') {
        const promptInput = el('input', 'sv-input');
        promptInput.placeholder = 'Ej. Un búho resolviendo una integral en la pizarra…';
        promptInput.maxLength = 120;
        promptInput.dataset.testid = 'gartic-prompt-input';
        const submitB = btn('Enviar frase →', 'sv-button sv-button-small sv-button-primary');
        submitB.dataset.testid = 'gartic-submit-prompt-btn';
        submitB.addEventListener('click', () => {
          this.garticEngine.submitRoundEntry(actor.id, {
            text: promptInput.value.trim() || 'Un gato programador tomando café',
          });
          this.renderActiveModal();
        });
        appendChildren(roundBox, promptInput, submitB);
      } else if (view.roundKind === 'DRAW') {
        const targetPrompt = view.previousStep?.text || 'Algo misterioso en la aldea';
        roundBox.append(el('p', 'sv-quiz-feedback is-correct', `Frase a dibujar: «${targetPrompt}»`));

        // Embedded Gartic Canvas with brush size, palette, eraser, undo/redo, clear
        const canvasToolbar = el('div', 'sv-inline');
        const drawCanvas = el('canvas', 'sv-canvas');
        drawCanvas.width = 480;
        drawCanvas.height = 270;
        drawCanvas.style.maxWidth = '480px';
        drawCanvas.style.border = '2px solid #43301f';
        drawCanvas.style.background = '#fffdf5';
        const dctx = drawCanvas.getContext('2d')!;
        dctx.fillStyle = '#fffdf5';
        dctx.fillRect(0, 0, 480, 270);
        this.garticStrokeHistory = [dctx.getImageData(0, 0, 480, 270)];
        this.garticRedoStack = [];

        let activeColor = '#231c18';
        let brushWidth = 4;
        let isEraser = false;
        let drawing = false;
        let lastPt = { x: 0, y: 0 };

        const colors = ['#231c18', '#c25f3c', '#3d78a2', '#4e9a5c', '#e6a145', '#7a6ba8'];
        for (const hex of colors) {
          const sw = btn('', 'sv-color-swatch');
          sw.style.backgroundColor = hex;
          sw.addEventListener('click', () => {
            activeColor = hex;
            isEraser = false;
          });
          canvasToolbar.append(sw);
        }

        const sizeSel = el('select', 'sv-select');
        for (const [w, l] of [
          ['2', 'Fino'],
          ['5', 'Medio'],
          ['10', 'Grueso'],
        ]) {
          const o = el('option', '', l);
          o.value = w;
          sizeSel.append(o);
        }
        sizeSel.value = '5';
        sizeSel.addEventListener('change', () => {
          brushWidth = Number(sizeSel.value);
        });

        const eraserB = btn('🧽 Borrador');
        eraserB.addEventListener('click', () => {
          isEraser = !isEraser;
        });

        const undoB = btn('↶ Deshacer');
        undoB.addEventListener('click', () => {
          if (this.garticStrokeHistory.length > 1) {
            const popped = this.garticStrokeHistory.pop()!;
            this.garticRedoStack.push(popped);
            dctx.putImageData(this.garticStrokeHistory[this.garticStrokeHistory.length - 1], 0, 0);
          }
        });

        const redoB = btn('↷ Rehacer');
        redoB.addEventListener('click', () => {
          const next = this.garticRedoStack.pop();
          if (next) {
            this.garticStrokeHistory.push(next);
            dctx.putImageData(next, 0, 0);
          }
        });

        const clearB = btn('🗑️ Limpiar');
        clearB.addEventListener('click', () => {
          dctx.fillStyle = '#fffdf5';
          dctx.fillRect(0, 0, 480, 270);
          this.garticStrokeHistory.push(dctx.getImageData(0, 0, 480, 270));
        });

        appendChildren(canvasToolbar, sizeSel, eraserB, undoB, redoB, clearB);

        const toLocal = (ev: PointerEvent) => {
          const r = drawCanvas.getBoundingClientRect();
          return {
            x: ((ev.clientX - r.left) * 480) / (r.width || 480),
            y: ((ev.clientY - r.top) * 270) / (r.height || 270),
          };
        };

        drawCanvas.addEventListener('pointerdown', (ev) => {
          drawing = true;
          lastPt = toLocal(ev);
          drawCanvas.setPointerCapture(ev.pointerId);
        });
        drawCanvas.addEventListener('pointermove', (ev) => {
          if (!drawing) return;
          const pt = toLocal(ev);
          dctx.strokeStyle = isEraser ? '#fffdf5' : activeColor;
          dctx.lineWidth = isEraser ? brushWidth * 2.5 : brushWidth;
          dctx.lineCap = 'round';
          dctx.beginPath();
          dctx.moveTo(lastPt.x, lastPt.y);
          dctx.lineTo(pt.x, pt.y);
          dctx.stroke();
          lastPt = pt;
        });
        const finishStroke = () => {
          if (!drawing) return;
          drawing = false;
          this.garticStrokeHistory.push(dctx.getImageData(0, 0, 480, 270));
          this.garticRedoStack = [];
        };
        drawCanvas.addEventListener('pointerup', finishStroke);
        drawCanvas.addEventListener('pointercancel', finishStroke);

        const submitDrawBtn = btn('✅ Enviar Dibujo →', 'sv-button sv-button-small sv-button-primary');
        submitDrawBtn.dataset.testid = 'gartic-submit-draw-btn';
        submitDrawBtn.addEventListener('click', () => {
          this.garticEngine.submitRoundEntry(actor.id, {
            drawingDataUrl: drawCanvas.toDataURL('image/png'),
          });
          this.renderActiveModal();
        });

        appendChildren(roundBox, canvasToolbar, drawCanvas, submitDrawBtn);
      } else {
        // GUESS round: show ONLY the previous drawing
        if (view.previousStep?.drawingDataUrl) {
          const img = el('img');
          img.src = view.previousStep.drawingDataUrl;
          img.alt = 'Dibujo para adivinar';
          img.style.maxWidth = '380px';
          img.style.border = '2px solid #43301f';
          roundBox.append(img);
        }
        const guessInput = el('input', 'sv-input');
        guessInput.placeholder = 'Escribe qué crees que es este dibujo…';
        guessInput.maxLength = 120;
        guessInput.dataset.testid = 'gartic-guess-input';
        const submitGuessB = btn('Enviar respuesta →', 'sv-button sv-button-small sv-button-primary');
        submitGuessB.dataset.testid = 'gartic-submit-guess-btn';
        submitGuessB.addEventListener('click', () => {
          this.garticEngine.submitRoundEntry(actor.id, {
            text: guessInput.value.trim() || '¡Un misterio artístico!',
          });
          this.renderActiveModal();
        });
        appendChildren(roundBox, guessInput, submitGuessB);
      }

      this.modalCard.append(roundBox);
      return;
    }

    // REVEAL or FINISHED Phase
    const revealHeader = el('div', 'sv-inline');
    revealHeader.append(
      el(
        'strong',
        '',
        `🎬 Álbum de Revelación · Cadena ${view.revealChainIndex + 1} de ${view.revealedChains.length}`,
      ),
    );
    if (view.subPhase === 'REVEAL') {
      const nextStepBtn = btn('Siguiente paso ▶', 'sv-button sv-button-small sv-button-primary');
      nextStepBtn.dataset.testid = 'gartic-next-reveal-btn';
      nextStepBtn.addEventListener('click', () => {
        this.garticEngine.nextRevealStep(view.leaderId);
        this.renderActiveModal();
      });
      revealHeader.append(nextStepBtn);
    }
    const newGameBtn = btn('🔄 Nueva Partida', 'sv-button sv-button-small');
    newGameBtn.addEventListener('click', () => {
      this.garticEngine = new GarticPhoneEngine({
        id: actor.id,
        displayName: actor.displayName,
        color: actor.color,
      });
      this.renderActiveModal();
    });
    revealHeader.append(newGameBtn);
    this.modalCard.append(revealHeader);

    const activeChain = view.revealedChains[view.revealChainIndex];
    if (activeChain) {
      const chainWrap = el('div', 'sv-quiz-list');
      const maxStep = view.subPhase === 'FINISHED' ? activeChain.steps.length - 1 : view.revealStepIndex;
      for (let i = 0; i <= Math.min(maxStep, activeChain.steps.length - 1); i++) {
        const step = activeChain.steps[i];
        const stepCard = el('div', 'sv-quiz-card');
        stepCard.append(
          el(
            'strong',
            '',
            `Paso ${i + 1} (${step.kind === 'PROMPT' ? 'Frase inicial' : step.kind === 'DRAW' ? 'Dibujo' : 'Adivinanza'}) por ${step.authorName}:`,
          ),
        );
        if (step.kind === 'DRAW' && step.drawingDataUrl) {
          const img = el('img');
          img.src = step.drawingDataUrl;
          img.alt = `Dibujo de ${step.authorName}`;
          img.style.maxWidth = '320px';
          img.style.border = '1px solid #cdb994';
          stepCard.append(img);
        } else {
          stepCard.append(el('p', 'sv-quiz-feedback is-correct', `«${step.text || ''}»`));
        }
        chainWrap.append(stepCard);
      }

      // Reaction bar
      const reactRow = el('div', 'sv-inline');
      for (const emoji of ['😂', '🎨', '👏', '🤯', '❤️']) {
        const count = activeChain.reactions[emoji]?.length ?? 0;
        const rBtn = btn(`${emoji} ${count > 0 ? count : ''}`);
        rBtn.addEventListener('click', () => {
          this.garticEngine.addReaction(activeChain.chainId, emoji, actor.id);
          this.renderActiveModal();
        });
        reactRow.append(rBtn);
      }
      chainWrap.append(reactRow);
      this.modalCard.append(chainWrap);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Arcade Station Trivia Modal (Part 11)
  // ---------------------------------------------------------------------------

  private renderArcadeModal(): void {
    const head = this.renderModalHeader(
      'PLAZA COMUNITARIA · RECREATIVA ARCADE EXTENSIBLE',
      '🕹️ Arcade de la Aldea: Reto Rápido de Estudio',
      'community:arcade-station',
    );
    const q = ARCADE_TRIVIA_BANK[this.triviaIndex % ARCADE_TRIVIA_BANK.length];
    const scoreBar = el('p', 'sv-subtle', `Puntuación actual: ${this.triviaScore} pts · Categoría: ${q.category}`);

    const card = el('div', 'sv-quiz-card');
    card.append(el('strong', 'sv-quiz-question', q.question));
    const opts = el('div', 'sv-quiz-options');
    const feedback = el('p', 'sv-quiz-feedback');
    feedback.hidden = true;

    q.options.forEach((optText, idx) => {
      const b = btn(optText, 'sv-button sv-button-small sv-quiz-option');
      b.addEventListener('click', () => {
        const ok = idx === q.correctIndex;
        if (ok) this.triviaScore += 10;
        b.classList.add(ok ? 'is-correct' : 'is-wrong');
        feedback.hidden = false;
        feedback.className = `sv-quiz-feedback ${ok ? 'is-correct' : 'is-wrong'}`;
        feedback.textContent = `${ok ? '✓ ¡Correcto! (+10 pts)' : '✗ Respuesta incorrecta.'} ${q.explanation}`;
      });
      opts.append(b);
    });

    const nextB = btn('Siguiente reto ▶', 'sv-button sv-button-small sv-button-primary');
    nextB.addEventListener('click', () => {
      this.triviaIndex = (this.triviaIndex + 1) % ARCADE_TRIVIA_BANK.length;
      this.renderActiveModal();
    });

    appendChildren(card, opts, feedback, nextB);
    appendChildren(this.modalCard, head, scoreBar, card);
  }

  // ---------------------------------------------------------------------------
  // 7. Secure Non-Executable Notes System Modal (Part 9)
  // ---------------------------------------------------------------------------

  private renderSecureNotesModal(): void {
    const actor = this.getActor();
    const head = this.renderModalHeader(
      'BIBLIOTECA DE ESTUDIO · APUNTES MARKDOWN + LATEX SIN EJECUCIÓN DE CÓDIGO',
      '📓 Cuadernos y Apuntes Seguros',
      'study:notes-archive',
    );

    const notebooks = this.notesStore.listNotebooks();
    const notes = this.notesStore.listNotes(actor.id, this.selectedNotebookId, this.noteSearchQuery);
    const activeNote =
      (this.selectedNoteId ? this.notesStore.getNote(this.selectedNoteId, actor.id) : null) ||
      notes[0] ||
      null;
    if (activeNote) this.selectedNoteId = activeNote.id;

    // Top filter & action bar
    const topBar = el('div', 'sv-inline');
    const nbSelect = el('select', 'sv-select');
    for (const nb of notebooks) {
      const o = el('option', '', `📁 ${nb.name}`);
      o.value = nb.id;
      nbSelect.append(o);
    }
    nbSelect.value = this.selectedNotebookId;
    nbSelect.addEventListener('change', () => {
      this.selectedNotebookId = nbSelect.value;
      this.selectedNoteId = null;
      this.renderActiveModal();
    });

    const searchInput = el('input', 'sv-input');
    searchInput.placeholder = 'Buscar apuntes por título o contenido…';
    searchInput.value = this.noteSearchQuery;
    searchInput.style.maxWidth = '220px';
    searchInput.addEventListener('input', () => {
      this.noteSearchQuery = searchInput.value;
      this.renderActiveModal();
    });

    const newNoteBtn = btn('+ Nuevo Apunte', 'sv-button sv-button-small sv-button-primary');
    newNoteBtn.dataset.testid = 'secure-notes-new-btn';
    newNoteBtn.addEventListener('click', () => {
      const created = this.notesStore.createNote({
        notebookId: this.selectedNotebookId,
        title: `Apunte de estudio ${notes.length + 1}`,
        ownerId: actor.id,
        visibility: 'private',
      });
      this.selectedNoteId = created.id;
      this.renderActiveModal();
    });

    appendChildren(topBar, nbSelect, searchInput, newNoteBtn);

    // Note selector pills
    const noteTabs = el('div', 'sv-inline');
    for (const n of notes) {
      const tab = btn(
        `${n.visibility === 'private' ? '🔒' : '🌐'} ${n.title}`,
        `sv-button sv-button-small${n.id === activeNote?.id ? ' sv-button-primary' : ''}`,
      );
      tab.addEventListener('click', () => {
        this.selectedNoteId = n.id;
        this.renderActiveModal();
      });
      noteTabs.append(tab);
    }

    this.modalCard.append(head, topBar, noteTabs);

    if (!activeNote) {
      this.modalCard.append(el('p', 'sv-subtle', 'No hay apuntes en este cuaderno. Crea uno nuevo.'));
      return;
    }

    const metaRow = el('div', 'sv-inline');
    const titleInput = el('input', 'sv-input');
    titleInput.value = activeNote.title;
    titleInput.maxLength = 120;
    titleInput.dataset.testid = 'secure-note-title-input';

    const visSelect = el('select', 'sv-select');
    for (const [v, l] of [
      ['private', '🔒 Privado (solo yo)'],
      ['shared_read', '👁️ Compartido (lectura)'],
      ['shared_write', '✍️ Compartido (edición)'],
    ] as [NoteVisibility, string][]) {
      const o = el('option', '', l);
      o.value = v;
      visSelect.append(o);
    }
    visSelect.value = activeNote.visibility;

    const aiReady = this.ollamaGateway.isAiReady();

    const toManualDeckBtn = btn('🃏 Crear Flashcards Manuales', 'sv-button sv-button-small sv-button-primary');
    toManualDeckBtn.dataset.testid = 'note-to-manual-deck-btn';
    toManualDeckBtn.addEventListener('click', () => {
      const deck = this.ollamaGateway.createManualDeck(
        `Apunte: ${activeNote.title}`,
        actor.id,
        'shared_read',
      );
      this.studySession.setDeck(deck);
      this.flashcardCreationMode = 'manual';
      this.editingFlashcardId = null;
      this.callbacks.notify(`🃏 Mazo manual «${deck.title}» listo para añadir tarjetas.`);
      this.openModal('ollama_study');
    });

    const toFlashcardsBtn = btn(
      aiReady ? '✨ Generar con IA (Ollama)' : `✨ Generar con IA (${OLLAMA_NOT_DETECTED_MESSAGE})`,
      'sv-button sv-button-small',
    );
    toFlashcardsBtn.dataset.testid = 'note-to-flashcards-btn';
    toFlashcardsBtn.disabled = !aiReady;
    toFlashcardsBtn.title = aiReady
      ? 'Generar flashcards usando el modelo Ollama detectado'
      : OLLAMA_NOT_DETECTED_MESSAGE;
    toFlashcardsBtn.addEventListener('click', () => {
      if (!this.ollamaGateway.isAiReady()) {
        this.callbacks.notify(OLLAMA_NOT_DETECTED_MESSAGE);
        return;
      }
      void this.ollamaGateway
        .generateFlashcardDeck({
          requesterId: actor.id,
          isHost: actor.isHost,
          sourceType: 'note',
          sourceNoteId: activeNote.id,
          topic: activeNote.title,
          content: activeNote.content,
          count: 4,
          difficulty: 'mixed',
          style: 'conceptual',
          includeHints: true,
          includeExplanations: true,
        })
        .then((deck) => {
          this.ollamaGateway.saveDeck(deck);
          this.studySession.setDeck(deck);
          this.callbacks.notify(`🃏 Mazo «${deck.title}» generado a partir de tu apunte.`);
          this.openModal('ollama_study');
        })
        .catch((err: unknown) => {
          this.callbacks.notify(err instanceof Error ? err.message : OLLAMA_NOT_DETECTED_MESSAGE);
        });
    });

    appendChildren(metaRow, titleInput, visSelect, toManualDeckBtn, toFlashcardsBtn);

    // Split Markdown Editor & Sanitized Non-Executable Preview
    const splitGrid = el('div', 'sv-notes-split');
    const contentArea = el('textarea', 'sv-editor-area');
    contentArea.value = activeNote.content;
    contentArea.style.minHeight = '220px';
    contentArea.dataset.testid = 'secure-note-content-input';

    const previewBox = el('div', 'sv-note-preview');
    previewBox.dataset.testid = 'secure-note-preview';
    previewBox.innerHTML = renderSafeMarkdownWithLatex(activeNote.content);

    const saveNoteChanges = () => {
      try {
        this.notesStore.updateNote(
          activeNote.id,
          {
            title: titleInput.value,
            content: contentArea.value,
            visibility: visSelect.value as NoteVisibility,
          },
          actor.id,
        );
        previewBox.innerHTML = renderSafeMarkdownWithLatex(contentArea.value);
      } catch (e) {
        this.callbacks.notify(e instanceof Error ? e.message : 'Error al guardar apunte.');
      }
    };

    contentArea.addEventListener('input', saveNoteChanges);
    titleInput.addEventListener('change', saveNoteChanges);
    visSelect.addEventListener('change', saveNoteChanges);

    appendChildren(splitGrid, contentArea, previewBox);
    appendChildren(
      this.modalCard,
      metaRow,
      splitGrid,
      el(
        'p',
        'sv-tiny',
        'Seguridad garantizada: Este visor escapa todo HTML crudo, bloquea <script>/<iframe>/eventos inline y solo permite enlaces https/http/mailto.',
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // 8. Optional Local Ollama Gateway, Flashcards & Multiplayer Study Session (Part 10)
  // ---------------------------------------------------------------------------

  private renderOllamaAndStudyModal(): void {
    const actor = this.getActor();
    const cfg = this.ollamaGateway.getConfig();
    const status = this.ollamaGateway.getStatus();
    const aiReady = this.ollamaGateway.isAiReady();

    const head = this.renderModalHeader(
      'BIBLIOTECA DE ESTUDIO · FLASHCARDS MANUALES Y OLLAMA LOCAL OPCIONAL',
      '🃏 Mazos de Flashcards, Estudio en Grupo y Ollama',
      'study:flashcard-podium',
    );
    this.modalCard.append(head);

    // Section A: Honest Local Ollama Status & Detection Panel (No fake models or placeholders)
    const ollamaCard = el('div', 'sv-quiz-card');
    ollamaCard.dataset.testid = 'ollama-gateway-panel';
    const isDetected = status.reachable && status.availableModels.length > 0;

    const statusHeader = el(
      'strong',
      '',
      isDetected
        ? `🟢 Ollama detectado (${status.activeModel})`
        : OLLAMA_NOT_DETECTED_MESSAGE,
    );
    statusHeader.dataset.testid = 'ollama-status-message';

    appendChildren(
      ollamaCard,
      statusHeader,
      el(
        'p',
        'sv-subtle',
        isDetected
          ? `Modelos instalados verificados (${status.availableModels.length}): ${status.availableModels.join(', ')}`
          : 'Las flashcards funcionan al 100% de forma manual sin IA. Si instalas e inicias Ollama localmente en http://127.0.0.1:11434, pulsa «Reintentar / Detectar Ollama».',
      ),
    );

    const ollamaControls = el('div', 'sv-inline');
    const enableToggle = el('input');
    enableToggle.type = 'checkbox';
    enableToggle.checked = cfg.enabled;
    enableToggle.disabled = !actor.isHost;
    enableToggle.dataset.testid = 'ollama-enable-checkbox';
    enableToggle.addEventListener('change', () => {
      this.ollamaGateway.configure({ enabled: enableToggle.checked }, actor.isHost);
      this.renderActiveModal();
    });
    const enableLabel = el('label', 'sv-env-toggle');
    appendChildren(enableLabel, enableToggle, el('span', '', 'Habilitar uso de Ollama'));

    const shareToggle = el('input');
    shareToggle.type = 'checkbox';
    shareToggle.checked = cfg.allowParticipants;
    shareToggle.disabled = !actor.isHost || !isDetected;
    shareToggle.dataset.testid = 'ollama-share-checkbox';
    shareToggle.addEventListener('change', () => {
      this.ollamaGateway.configure({ allowParticipants: shareToggle.checked }, actor.isHost);
      this.renderActiveModal();
    });
    const shareLabel = el('label', 'sv-env-toggle');
    appendChildren(shareLabel, shareToggle, el('span', '', 'Permitir uso a invitados'));

    // Verified installed models selector — never shows fake model names
    const modelSelect = el('select', 'sv-select');
    modelSelect.dataset.testid = 'ollama-model-select';
    modelSelect.disabled = !actor.isHost || !isDetected;
    if (isDetected) {
      for (const mName of status.availableModels) {
        const opt = el('option', '', mName);
        opt.value = mName;
        modelSelect.append(opt);
      }
      modelSelect.value = cfg.selectedModel || status.activeModel || status.availableModels[0];
    } else {
      const emptyOpt = el('option', '', OLLAMA_NOT_DETECTED_MESSAGE);
      emptyOpt.value = '';
      modelSelect.append(emptyOpt);
      modelSelect.value = '';
    }
    modelSelect.addEventListener('change', () => {
      if (modelSelect.value) {
        this.ollamaGateway.configure({ selectedModel: modelSelect.value }, actor.isHost);
        this.renderActiveModal();
      }
    });

    const detectBtn = btn('🔄 Reintentar / Detectar Ollama', 'sv-button sv-button-small');
    detectBtn.dataset.testid = 'ollama-probe-btn';
    detectBtn.addEventListener('click', () => {
      detectBtn.textContent = 'Detectando…';
      void this.ollamaGateway.probeOllamaModels().then((st) => {
        if (st.reachable && st.availableModels.length > 0) {
          this.ollamaGateway.configure({ enabled: true }, actor.isHost);
          this.callbacks.notify(`Ollama detectado con ${st.availableModels.length} modelo(s).`);
        } else {
          this.callbacks.notify(OLLAMA_NOT_DETECTED_MESSAGE);
        }
        this.renderActiveModal();
      });
    });

    appendChildren(ollamaControls, enableLabel, shareLabel, modelSelect, detectBtn);
    ollamaCard.append(ollamaControls);
    this.modalCard.append(ollamaCard);

    // Ensure studySession is synced with latest persisted version of the active deck
    const allDecks = this.ollamaGateway.listDecks();
    const activeDeck =
      this.ollamaGateway.getDeck(this.studySession.getState().deckId) || allDecks[0];
    if (activeDeck && activeDeck.id !== this.studySession.getState().deckId) {
      this.studySession.setDeck(activeDeck);
    }

    // Section B: Deck Management & Mode Switcher ("Create Manually" alongside "Generate with AI")
    const modeCard = el('div', 'sv-quiz-card');
    modeCard.dataset.testid = 'flashcard-creation-panel';

    const modeSwitchRow = el('div', 'sv-inline');
    modeSwitchRow.style.justifyContent = 'space-between';
    const modeButtons = el('div', 'sv-segment');

    const createManualModeBtn = btn('✍️ Create Manually (Crear Manualmente)', 'sv-segment-button');
    createManualModeBtn.dataset.testid = 'mode-create-manual-btn';
    createManualModeBtn.classList.toggle('is-active', this.flashcardCreationMode === 'manual');
    createManualModeBtn.addEventListener('click', () => {
      this.flashcardCreationMode = 'manual';
      this.renderActiveModal();
    });

    const generateAiModeBtn = btn('✨ Generate with AI (Generar con IA)', 'sv-segment-button');
    generateAiModeBtn.dataset.testid = 'mode-generate-ai-btn';
    generateAiModeBtn.classList.toggle('is-active', this.flashcardCreationMode === 'ai');
    generateAiModeBtn.addEventListener('click', () => {
      this.flashcardCreationMode = 'ai';
      this.renderActiveModal();
    });

    appendChildren(modeButtons, createManualModeBtn, generateAiModeBtn);
    appendChildren(
      modeSwitchRow,
      el('strong', '', 'Creación y Organización de Flashcards'),
      modeButtons,
    );
    modeCard.append(modeSwitchRow);

    if (this.flashcardCreationMode === 'ai') {
      const genSection = el('div', 'sv-stack');
      genSection.dataset.testid = 'ai-flashcards-section';
      if (!aiReady) {
        const warn = el(
          'p',
          'sv-subtle',
          `${OLLAMA_NOT_DETECTED_MESSAGE} Activa y detecta un modelo real de Ollama para generar con IA, o usa «Create Manually» para crear y editar tarjetas sin IA.`,
        );
        warn.dataset.testid = 'ai-unavailable-notice';
        genSection.append(warn);
      }

      const genRow = el('div', 'sv-inline');
      const topicInput = el('input', 'sv-input');
      topicInput.placeholder = 'Tema o apuntes para generar con Ollama…';
      topicInput.style.flex = '1';
      topicInput.disabled = !aiReady;
      topicInput.dataset.testid = 'flashcard-gen-topic-input';

      const diffSelect = el('select', 'sv-select');
      diffSelect.disabled = !aiReady;
      for (const [d, l] of [
        ['mixed', 'Dificultad: Mixta'],
        ['easy', 'Fácil'],
        ['medium', 'Media'],
        ['hard', 'Difícil'],
      ]) {
        const o = el('option', '', l);
        o.value = d;
        diffSelect.append(o);
      }

      const styleSelect = el('select', 'sv-select');
      styleSelect.disabled = !aiReady;
      for (const [s, l] of [
        ['conceptual', 'Estilo: Conceptual'],
        ['concise', 'Conciso'],
        ['exam', 'Preparación Examen'],
        ['detailed', 'Detallado'],
      ]) {
        const o = el('option', '', l);
        o.value = s;
        styleSelect.append(o);
      }

      const genBtn = btn('⚡ Generate with AI', 'sv-button sv-button-small sv-button-primary');
      genBtn.dataset.testid = 'flashcard-gen-submit-btn';
      genBtn.disabled = !aiReady;
      genBtn.addEventListener('click', () => {
        if (!this.ollamaGateway.isAiReady()) {
          this.callbacks.notify(OLLAMA_NOT_DETECTED_MESSAGE);
          return;
        }
        const topic = topicInput.value.trim();
        if (!topic) {
          this.callbacks.notify('Escribe un tema o concepto para generar con Ollama.');
          return;
        }
        void this.ollamaGateway
          .generateFlashcardDeck({
            requesterId: actor.id,
            isHost: actor.isHost,
            sourceType: 'topic',
            topic,
            content: topic,
            count: 4,
            difficulty: diffSelect.value as FlashcardDifficulty | 'mixed',
            style: styleSelect.value as FlashcardStyle,
            includeHints: true,
            includeExplanations: true,
          })
          .then((deck: FlashcardDeck) => {
            this.ollamaGateway.saveDeck(deck);
            this.studySession.setDeck(deck);
            this.flashcardCreationMode = 'manual';
            this.callbacks.notify(`Mazo «${deck.title}» generado con Ollama. Puedes editar las tarjetas manualmente.`);
            this.renderActiveModal();
          })
          .catch((err: unknown) => {
            this.callbacks.notify(err instanceof Error ? err.message : OLLAMA_NOT_DETECTED_MESSAGE);
          });
      });

      appendChildren(genRow, topicInput, diffSelect, styleSelect, genBtn);
      genSection.append(genRow);
      modeCard.append(genSection);
    } else {
      // Manual Flashcard & Deck Creation / Editing UI
      const manualSection = el('div', 'sv-stack');
      manualSection.dataset.testid = 'manual-flashcards-section';

      // Create New Deck or Rename Active Deck row
      const deckManageRow = el('div', 'sv-inline');
      const newDeckInput = el('input', 'sv-input');
      newDeckInput.placeholder = 'Título para nuevo mazo manual…';
      newDeckInput.style.flex = '1';
      newDeckInput.dataset.testid = 'manual-deck-title-input';

      const createDeckBtn = btn('+ Nuevo Mazo', 'sv-button sv-button-small');
      createDeckBtn.dataset.testid = 'manual-deck-create-btn';
      createDeckBtn.addEventListener('click', () => {
        const title = newDeckInput.value.trim() || 'Nuevo Mazo de Estudio';
        const created = this.ollamaGateway.createManualDeck(title, actor.id, 'shared_read');
        this.studySession.setDeck(created);
        this.editingFlashcardId = null;
        this.callbacks.notify(`📚 Mazo «${created.title}» creado.`);
        this.renderActiveModal();
      });

      const renameDeckInput = el('input', 'sv-input');
      renameDeckInput.value = activeDeck ? activeDeck.title : '';
      renameDeckInput.placeholder = 'Renombrar mazo actual…';
      renameDeckInput.style.flex = '1';
      renameDeckInput.dataset.testid = 'manual-deck-rename-input';

      const renameDeckBtn = btn('Renombrar Mazo', 'sv-button sv-button-small');
      renameDeckBtn.dataset.testid = 'manual-deck-rename-btn';
      renameDeckBtn.addEventListener('click', () => {
        if (!activeDeck) return;
        const updated = this.ollamaGateway.renameDeck(
          activeDeck.id,
          renameDeckInput.value,
          actor.id,
          actor.isHost,
        );
        if (updated) {
          this.studySession.setDeck(updated);
          this.callbacks.notify(`Mazo renombrado a «${updated.title}».`);
          this.renderActiveModal();
        }
      });

      appendChildren(deckManageRow, newDeckInput, createDeckBtn, renameDeckInput, renameDeckBtn);
      manualSection.append(deckManageRow);

      // Find card being edited if any
      const editingCard: FlashcardItem | null =
        (activeDeck && this.editingFlashcardId
          ? activeDeck.cards.find((c) => c.id === this.editingFlashcardId) || null
          : null);

      const formBox = el('div', 'sv-stack');
      formBox.dataset.testid = 'manual-card-form';
      formBox.append(
        el(
          'span',
          'sv-field-label',
          editingCard
            ? `✏️ Editando tarjeta en «${activeDeck?.title || ''}»`
            : `➕ Añadir tarjeta manual a «${activeDeck?.title || ''}»`,
        ),
      );

      const qInput = el('input', 'sv-input');
      qInput.placeholder = 'Pregunta (Question)…';
      qInput.value = editingCard ? editingCard.question : '';
      qInput.dataset.testid = 'manual-card-question';

      const aInput = el('input', 'sv-input');
      aInput.placeholder = 'Respuesta (Answer)…';
      aInput.value = editingCard ? editingCard.answer : '';
      aInput.dataset.testid = 'manual-card-answer';

      const metaInputsRow = el('div', 'sv-inline');
      const hintInput = el('input', 'sv-input');
      hintInput.placeholder = 'Pista opcional (Hint)…';
      hintInput.style.flex = '1';
      hintInput.value = editingCard?.hint || '';
      hintInput.dataset.testid = 'manual-card-hint';

      const tagsInput = el('input', 'sv-input');
      tagsInput.placeholder = 'Etiquetas separadas por coma (Tags)…';
      tagsInput.style.flex = '1';
      tagsInput.value = editingCard ? editingCard.tags.join(', ') : '';
      tagsInput.dataset.testid = 'manual-card-tags';

      const cardDiffSelect = el('select', 'sv-select');
      cardDiffSelect.dataset.testid = 'manual-card-difficulty';
      for (const [d, l] of [
        ['easy', 'Fácil'],
        ['medium', 'Media'],
        ['hard', 'Difícil'],
      ]) {
        const o = el('option', '', l);
        o.value = d;
        cardDiffSelect.append(o);
      }
      cardDiffSelect.value = editingCard ? editingCard.difficulty : 'medium';
      appendChildren(metaInputsRow, hintInput, tagsInput, cardDiffSelect);

      const expInput = el('input', 'sv-input');
      expInput.placeholder = 'Explicación adicional opcional (Explanation)…';
      expInput.value = editingCard?.explanation || '';
      expInput.dataset.testid = 'manual-card-explanation';

      const actionRow = el('div', 'sv-inline');
      const saveCardBtn = btn(
        editingCard ? '💾 Guardar Cambios en Tarjeta' : '➕ Guardar Tarjeta Manual',
        'sv-button sv-button-small sv-button-primary',
      );
      saveCardBtn.dataset.testid = 'manual-card-submit-btn';
      saveCardBtn.addEventListener('click', () => {
        if (!activeDeck) return;
        const question = qInput.value.trim();
        const answer = aInput.value.trim();
        if (!question || !answer) {
          this.callbacks.notify('La tarjeta necesita al menos una pregunta y una respuesta.');
          return;
        }
        const tags = tagsInput.value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        const hint = hintInput.value.trim() || undefined;
        const explanation = expInput.value.trim() || undefined;
        const difficulty = cardDiffSelect.value as FlashcardDifficulty;

        if (editingCard) {
          const updated = this.ollamaGateway.updateCard(
            activeDeck.id,
            editingCard.id,
            { question, answer, hint, tags, explanation, difficulty },
            actor.id,
            actor.isHost,
          );
          if (updated) {
            this.studySession.setDeck(updated);
            this.editingFlashcardId = null;
            this.callbacks.notify('Tarjeta actualizada.');
            this.renderActiveModal();
          }
        } else {
          const updated = this.ollamaGateway.addManualCard(
            activeDeck.id,
            { question, answer, hint, tags, explanation, difficulty },
            actor.id,
            actor.isHost,
          );
          if (updated) {
            this.studySession.setDeck(updated);
            this.callbacks.notify('Tarjeta manual añadida al mazo.');
            this.renderActiveModal();
          }
        }
      });

      actionRow.append(saveCardBtn);
      if (editingCard) {
        const cancelEditBtn = btn('Cancelar edición', 'sv-button sv-button-small');
        cancelEditBtn.addEventListener('click', () => {
          this.editingFlashcardId = null;
          this.renderActiveModal();
        });
        actionRow.append(cancelEditBtn);
      }

      appendChildren(formBox, qInput, aInput, metaInputsRow, expInput, actionRow);
      manualSection.append(formBox);
      modeCard.append(manualSection);
    }

    this.modalCard.append(modeCard);

    // Section C: Active Multiplayer Study Session Podium (Interactive Flip-Card Review)
    const sessionState = this.studySession.getState();
    const currentCard = this.studySession.getCurrentCard();
    const progress = this.studySession.getUserProgress(actor.id);

    const sessionCard = el('div', 'sv-quiz-card');
    sessionCard.dataset.testid = 'multiplayer-study-session-card';

    const deckSelectorRow = el('div', 'sv-inline');
    const deckSelect = el('select', 'sv-select');
    deckSelect.dataset.testid = 'study-deck-select';
    for (const d of this.ollamaGateway.listDecks()) {
      const o = el('option', '', `📚 ${d.title} (${d.cards.length} tarjetas)`);
      o.value = d.id;
      deckSelect.append(o);
    }
    deckSelect.value = sessionState.deckId;
    deckSelect.addEventListener('change', () => {
      const chosen = this.ollamaGateway.getDeck(deckSelect.value);
      if (chosen) {
        this.studySession.setDeck(chosen);
        this.editingFlashcardId = null;
        this.renderActiveModal();
      }
    });

    const visDeckSelect = el('select', 'sv-select');
    visDeckSelect.dataset.testid = 'study-deck-visibility-select';
    for (const [v, l] of [
      ['private', '🔒 Mazo Privado'],
      ['shared_read', '👁️ Compartido (lectura)'],
      ['shared_write', '✍️ Compartido (colaborativo)'],
    ] as const) {
      const o = el('option', '', l);
      o.value = v;
      visDeckSelect.append(o);
    }
    if (activeDeck) {
      visDeckSelect.value = activeDeck.visibility ?? 'shared_write';
    }
    visDeckSelect.addEventListener('change', () => {
      if (!activeDeck) return;
      this.ollamaGateway.setDeckVisibility(
        activeDeck.id,
        visDeckSelect.value as 'private' | 'shared_read' | 'shared_write',
        actor.id,
        actor.isHost,
      );
      this.renderActiveModal();
    });

    deckSelectorRow.append(
      deckSelect,
      visDeckSelect,
      el(
        'span',
        'sv-tiny',
        `Progreso guardado: ${progress.mastered} dominadas · ${progress.reviewAgain} por repasar / ${progress.total} total`,
      ),
    );
    sessionCard.append(deckSelectorRow);

    if (currentCard) {
      const cardDisplay = el('div', 'sv-flashcard');
      cardDisplay.dataset.testid = 'study-session-flip-card';
      cardDisplay.style.minHeight = '130px';
      cardDisplay.style.cursor = 'pointer';
      cardDisplay.title = 'Haz clic para voltear la tarjeta (Pregunta ↔ Respuesta)';
      cardDisplay.classList.toggle('is-flipped', sessionState.answerRevealed);
      cardDisplay.addEventListener('click', () => {
        this.studySession.flipCard();
        this.renderActiveModal();
      });

      appendChildren(
        cardDisplay,
        el(
          'span',
          'sv-eyebrow',
          `TARJETA ${sessionState.currentCardIndex + 1} DE ${sessionState.totalCards} · DIFICULTAD: ${currentCard.difficulty.toUpperCase()} · CLIC PARA VOLTEAR`,
        ),
        el('strong', 'sv-flashcard-front', currentCard.question),
      );
      if (currentCard.tags.length > 0) {
        cardDisplay.append(el('span', 'sv-tiny', `🏷️ ${currentCard.tags.join(', ')}`));
      }
      if (sessionState.hintVisible && currentCard.hint) {
        cardDisplay.append(el('p', 'sv-subtle', `💡 Pista: ${currentCard.hint}`));
      }
      if (sessionState.answerRevealed) {
        cardDisplay.append(el('p', 'sv-flashcard-back', `✅ Respuesta: ${currentCard.answer}`));
        if (currentCard.explanation) {
          cardDisplay.append(el('p', 'sv-tiny', `Explicación: ${currentCard.explanation}`));
        }
      }
      sessionCard.append(cardDisplay);

      const sessionControls = el('div', 'sv-inline');
      const prevB = btn('◀ Anterior');
      prevB.dataset.testid = 'study-session-prev-btn';
      prevB.addEventListener('click', () => {
        this.studySession.previousCard();
        this.renderActiveModal();
      });

      const hintB = btn('💡 Pista');
      hintB.dataset.testid = 'study-session-hint-btn';
      hintB.addEventListener('click', () => {
        this.studySession.toggleHint();
        this.renderActiveModal();
      });

      const revealB = btn(
        sessionState.answerRevealed ? '🔄 Ocultar Respuesta' : '👁️ Voltear / Revelar Respuesta',
        'sv-button sv-button-small sv-button-primary',
      );
      revealB.dataset.testid = 'study-session-reveal-btn';
      revealB.addEventListener('click', () => {
        this.studySession.flipCard();
        this.renderActiveModal();
      });

      const nextB = btn('Siguiente ▶');
      nextB.dataset.testid = 'study-session-next-btn';
      nextB.addEventListener('click', () => {
        this.studySession.nextCard();
        this.renderActiveModal();
      });

      const masteredB = btn('✓ Dominada', 'sv-button sv-button-small');
      masteredB.dataset.testid = 'study-session-mastered-btn';
      masteredB.addEventListener('click', () => {
        this.studySession.recordSelfAssessment(actor.id, currentCard.id, 'mastered');
        this.studySession.nextCard();
        this.renderActiveModal();
      });

      const reviewB = btn('↻ Repasar luego', 'sv-button sv-button-small');
      reviewB.dataset.testid = 'study-session-review-btn';
      reviewB.addEventListener('click', () => {
        this.studySession.recordSelfAssessment(actor.id, currentCard.id, 'review_again');
        this.studySession.nextCard();
        this.renderActiveModal();
      });

      appendChildren(sessionControls, prevB, hintB, revealB, nextB, masteredB, reviewB);
      sessionCard.append(sessionControls);
    } else {
      sessionCard.append(
        el('p', 'sv-subtle', 'Este mazo aún no tiene tarjetas. Usa el formulario superior para añadir tarjetas manualmente.'),
      );
    }

    // Section D: Card List Organizer (Edit, Delete, Reorder Up/Down for all cards in active deck)
    if (activeDeck && activeDeck.cards.length > 0) {
      const listWrap = el('div', 'sv-stack');
      listWrap.style.marginTop = '10px';
      listWrap.dataset.testid = 'manual-card-list';
      listWrap.append(
        el('span', 'sv-field-label', `Organizar tarjetas del mazo (${activeDeck.cards.length}):`),
      );

      activeDeck.cards.forEach((cardItem, idx) => {
        const row = el('div', 'sv-inline');
        row.style.justifyContent = 'space-between';
        row.style.padding = '6px 8px';
        row.style.border = '1px solid rgba(53, 88, 70, 0.16)';
        row.style.borderRadius = '8px';
        row.dataset.testid = `deck-card-row-${idx}`;

        const summary = el(
          'span',
          'sv-tiny',
          `${idx + 1}. ${cardItem.question} → ${cardItem.answer}${cardItem.tags.length ? ` [${cardItem.tags.join(', ')}]` : ''}`,
        );
        const btnGroup = el('div', 'sv-inline');

        const upBtn = btn('↑', 'sv-button sv-button-small');
        upBtn.dataset.testid = `card-move-up-${idx}`;
        upBtn.disabled = idx === 0;
        upBtn.title = 'Subir tarjeta';
        upBtn.addEventListener('click', () => {
          const updated = this.ollamaGateway.reorderCard(activeDeck.id, cardItem.id, 'up', actor.id, actor.isHost);
          if (updated) {
            this.studySession.setDeck(updated);
            this.renderActiveModal();
          }
        });

        const downBtn = btn('↓', 'sv-button sv-button-small');
        downBtn.dataset.testid = `card-move-down-${idx}`;
        downBtn.disabled = idx === activeDeck.cards.length - 1;
        downBtn.title = 'Bajar tarjeta';
        downBtn.addEventListener('click', () => {
          const updated = this.ollamaGateway.reorderCard(activeDeck.id, cardItem.id, 'down', actor.id, actor.isHost);
          if (updated) {
            this.studySession.setDeck(updated);
            this.renderActiveModal();
          }
        });

        const editBtn = btn('✏️ Editar', 'sv-button sv-button-small');
        editBtn.dataset.testid = `card-edit-${idx}`;
        editBtn.addEventListener('click', () => {
          this.flashcardCreationMode = 'manual';
          this.editingFlashcardId = cardItem.id;
          this.renderActiveModal();
        });

        const delBtn = btn('🗑️ Borrar', 'sv-button sv-button-small sv-danger-text');
        delBtn.dataset.testid = `card-delete-${idx}`;
        delBtn.addEventListener('click', () => {
          const updated = this.ollamaGateway.deleteCard(activeDeck.id, cardItem.id, actor.id, actor.isHost);
          if (updated) {
            this.studySession.setDeck(updated);
            if (this.editingFlashcardId === cardItem.id) this.editingFlashcardId = null;
            this.renderActiveModal();
          }
        });

        appendChildren(btnGroup, upBtn, downBtn, editBtn, delBtn);
        appendChildren(row, summary, btnGroup);
        listWrap.append(row);
      });

      sessionCard.append(listWrap);
    }

    this.modalCard.append(sessionCard);
  }

  // ---------------------------------------------------------------------------
  // 9. Collaborative Multi-File Project Explorer & Host Execution Approval (Part 8)
  // ---------------------------------------------------------------------------

  mountProjectWorkspaceInEditor(
    editorPane: HTMLElement,
    editorArea: HTMLTextAreaElement,
    editorLangSelect: HTMLSelectElement,
  ): void {
    this.projectContainer = el('div', 'sv-collab-project-workspace');
    this.projectContainer.dataset.testid = 'collab-project-workspace';
    editorPane.insertBefore(this.projectContainer, editorArea);
    this.renderProjectWorkspace(editorArea, editorLangSelect);
  }

  renderProjectWorkspace(editorArea: HTMLTextAreaElement, editorLangSelect: HTMLSelectElement): void {
    if (!this.projectContainer) return;
    this.projectContainer.replaceChildren();
    const actor = this.getActor();
    const proj = this.projectManager.getProject(this.selectedProjectId);
    const activeFile = proj.files[proj.activeTabPath] ?? Object.values(proj.files)[0];

    const headerRow = el('div', 'sv-expansion-row');
    headerRow.append(
      el('strong', '', `📂 ${proj.name} · Revisión Hash: ${this.getCurrentProjectHash()}`),
    );

    const fileActions = el('div', 'sv-inline');
    const newFileBtn = btn('+ Nuevo Archivo', 'sv-button sv-button-small');
    newFileBtn.dataset.testid = 'project-new-file-btn';
    newFileBtn.addEventListener('click', () => {
      const count = Object.keys(proj.files).length + 1;
      const newPath = `src/modulo_${count}.ts`;
      const created = this.projectManager.createFile(
        proj.id,
        newPath,
        `// Archivo ${newPath}\nconsole.log("Ejecutando ${newPath} en StudyVillage");\n`,
        actor.id,
        actor.isHost,
      );
      editorArea.value = created.content;
      this.renderProjectWorkspace(editorArea, editorLangSelect);
    });

    const proposeExecBtn = btn(
      '🛡️ Solicitar Ejecución Supervisada (Hash SHA)',
      'sv-button sv-button-small sv-button-primary',
    );
    proposeExecBtn.dataset.testid = 'project-propose-exec-btn';
    proposeExecBtn.addEventListener('click', () => {
      if (!activeFile) return;
      // Save current editor buffer into active project file first
      this.projectManager.updateFileContent(
        proj.id,
        activeFile.path,
        editorArea.value,
        actor.id,
        actor.isHost,
      );
      const proposal = this.projectManager.proposeExecution({
        projectId: proj.id,
        entrypointPath: activeFile.path,
        proposerId: actor.id,
        proposerName: actor.displayName,
        isHost: actor.isHost,
      });
      this.callbacks.notify(
        `Solicitud de ejecución creada (${proposal.revisionHash}). El anfitrión debe aprobarla antes de ejecutar.`,
      );
      this.renderProjectWorkspace(editorArea, editorLangSelect);
    });

    appendChildren(fileActions, newFileBtn, proposeExecBtn);
    appendChildren(headerRow, fileActions);

    // File Tabs Bar
    const tabsBar = el('div', 'sv-inline');
    for (const filePath of Object.keys(proj.files).sort()) {
      const f = proj.files[filePath];
      const isCurrent = f.path === activeFile?.path;
      const tabBtn = btn(
        `${f.folder ? `${f.folder}/` : ''}${f.name}`,
        `sv-button sv-button-small${isCurrent ? ' sv-button-primary' : ''}`,
      );
      tabBtn.addEventListener('click', () => {
        if (activeFile) {
          this.projectManager.updateFileContent(
            proj.id,
            activeFile.path,
            editorArea.value,
            actor.id,
            actor.isHost,
          );
        }
        proj.activeTabPath = f.path;
        editorArea.value = f.content;
        if (f.language === 'python' || f.language === 'cpp' || f.language === 'typescript') {
          editorLangSelect.value = f.language;
        }
        this.renderProjectWorkspace(editorArea, editorLangSelect);
      });
      tabsBar.append(tabBtn);
    }

    this.projectContainer.append(headerRow, tabsBar);

    // Host Execution Approval Queue (if any proposals exist)
    const proposals = this.projectManager.listProposals(proj.id).slice(0, 3);
    if (proposals.length > 0) {
      const queueBox = el('div', 'sv-quiz-card');
      queueBox.dataset.testid = 'host-execution-approval-box';
      queueBox.append(el('strong', '', '🛡️ Cola de Autorización de Ejecución del Anfitrión (Anti-TOCTOU):'));
      for (const prop of proposals) {
        const row = el('div', 'sv-approval-row');
        appendChildren(
          row,
          el(
            'strong',
            '',
            `${prop.proposerName} solicita ejecutar: \`${prop.commandDisplay}\` · Estado: ${prop.status.toUpperCase()}`,
          ),
          el(
            'small',
            '',
            `Directorio: ${prop.workingDirectory} · Hash fijado: ${prop.revisionHash} · Entorno: ${prop.envSummary.join(', ')}`,
          ),
        );
        if (prop.status === 'pending_host_approval' && actor.isHost) {
          const actRow = el('div', 'sv-inline');
          const approveB = btn('✓ Aprobar y Ejecutar en Sandbox', 'sv-button sv-button-small sv-button-primary');
          approveB.dataset.testid = `approve-exec-${prop.requestId}`;
          approveB.addEventListener('click', () => {
            void this.projectManager
              .decideExecutionProposal({
                requestId: prop.requestId,
                hostId: actor.id,
                isHost: actor.isHost,
                approve: true,
              })
              .then(() => {
                this.renderProjectWorkspace(editorArea, editorLangSelect);
              });
          });
          const denyB = btn('✗ Rechazar', 'sv-button sv-button-small');
          denyB.addEventListener('click', () => {
            void this.projectManager
              .decideExecutionProposal({
                requestId: prop.requestId,
                hostId: actor.id,
                isHost: actor.isHost,
                approve: false,
              })
              .then(() => {
                this.renderProjectWorkspace(editorArea, editorLangSelect);
              });
          });
          appendChildren(actRow, approveB, denyB);
          row.append(actRow);
        }
        if (prop.outputLines.length > 0) {
          row.append(el('pre', 'sv-editor-console-pre', prop.outputLines.join('\n')));
        }
        queueBox.append(row);
      }
      this.projectContainer.append(queueBox);
    }
  }

  private getCurrentProjectHash(): string {
    const proj = this.projectManager.getProject(this.selectedProjectId);
    const files = Object.values(proj.files);
    return `v${proj.revision} (${files.length} archivos)`;
  }
}
