import './style.css';
import {
  LIMITS, type AppActions, type AppView, type BoardPoint, type BoardStroke,
  type FurnitureKind, type Position, type PublicHouse,
} from '../protocol/types';
import { insertAtSelection, SNIPPETS } from '../editor/snippets';
import {
  FURNITURE_KINDS, FURNITURE_LABELS, HOUSE_SPAWN, addFurniture, deleteFurniture,
  hitFurniture, moveFurniture, setFurnitureAlias, stepHousePosition,
} from '../house/model';
import { drawHouseInterior } from '../house/draw';
import { BOARD_COLORS, boardAtCapacity, clampBoardPoint, makeStroke, newestOwnStroke, nextSequence, visibleStrokes } from '../whiteboard/model';
import { drawBoard } from '../whiteboard/draw';
import { WORLD_SPAWN, closestDoor, occupiedParcels, pointInRect, stepPosition, worldObstacles } from '../world/model';
import { drawWorld, type DrawPerson } from '../world/draw';

type Pane = 'world' | 'house' | 'board' | 'editor' | 'contacts' | 'diagnostics';
type DiagnosticKind = Parameters<AppActions['runDiagnostic']>[0];
type MediaMount = { wrapper: HTMLElement; element: HTMLMediaElement; stream: MediaStream };

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', label = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (label) element.textContent = label;
  return element;
}

function append<T extends HTMLElement>(parent: T, ...children: (Node | null | undefined)[]): T {
  for (const child of children) if (child) parent.append(child);
  return parent;
}

function button(label: string, className = 'sv-button'): HTMLButtonElement {
  const element = node('button', className, label);
  element.type = 'button';
  return element;
}

function field(labelText: string, control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): HTMLLabelElement {
  const label = node('label', 'sv-field');
  append(label, node('span', 'sv-field-label', labelText), control);
  return label;
}

function select(options: readonly { value: string; label: string }[]): HTMLSelectElement {
  const element = node('select', 'sv-select');
  for (const item of options) {
    const option = node('option');
    option.value = item.value;
    option.textContent = item.label;
    element.append(option);
  }
  return element;
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function setInput(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  if (document.activeElement !== element && element.value !== value) element.value = value;
}

function show(element: HTMLElement, visible: boolean): void { element.hidden = !visible; }

const PHASE_LABEL: Record<AppView['network']['phase'], string> = {
  IDLE: 'Sin sesión', SIGNALING: 'Preparando conexión', CONNECTING: 'Conectando',
  AUTHENTICATING: 'Verificando identidad', PENDING_APPROVAL: 'Esperando aprobación',
  JOINED: 'En la aldea', RECONNECTING: 'Reconectando', DENIED: 'Acceso denegado',
  EXPIRED_INVITE: 'Invitación caducada', NETWORK_FAILED: 'Sin conexión',
  KICKED: 'Has salido de la sesión', CLOSED: 'Sesión cerrada',
};

const SCREEN_LABEL: Record<AppView['network']['media']['screenPhase'], string> = {
  OFF: 'Pantalla apagada', REQUESTING_OS_PERMISSION: 'Esperando permiso del sistema',
  CAPTURING_LOCAL: 'Captura local activa', NEGOTIATING: 'Conectando emisión',
  SENDING: 'Compartiendo pantalla', DENIED: 'Permiso denegado',
  NOT_SUPPORTED: 'Captura no disponible aquí', SOURCE_ENDED: 'La fuente terminó',
  NETWORK_FAILED: 'Fallo al compartir',
};

class StudyUI {
  readonly root: HTMLElement;
  readonly actions: AppActions;
  private view: AppView | null = null;
  private pane: Pane = 'world';
  private houseOwnerId: string | null = null;
  private waitingHouseId: string | null = null;
  private selectedFurnitureId: string | null = null;
  private previewHouse: PublicHouse | null = null;
  private drag: { id: string; offsetX: number; offsetY: number; baseHouse: PublicHouse } | null = null;
  private localPosition: Position = { ...WORLD_SPAWN };
  private keys = new Set<string>();
  private raf = 0;
  private lastFrame = 0;
  private lastMoveSent = 0;
  private localNotice: string | null = null;
  private offlineStrokes: BoardStroke[] = [];
  private pendingStrokes: BoardStroke[] = [];
  private hiddenAuthors = new Set<string>();
  private boardDraft: { points: BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number } | null = null;
  private mediaMounts = new Map<string, MediaMount>();
  private lastEditorFromView = '';
  private editorDirty = false;
  private lastListsSignature = '';
  private lastLayersSignature = '';

  private shell!: HTMLElement;
  private statusBadge!: HTMLElement;
  private profileName!: HTMLElement;
  private profileColor!: HTMLElement;
  private nameInput!: HTMLInputElement;
  private colorInput!: HTMLInputElement;
  private saveIdentityInput!: HTMLInputElement;
  private saveIdentityButton!: HTMLButtonElement;
  private identityStatus!: HTMLElement;
  private lockOverlay!: HTMLElement;
  private lockMessage!: HTMLElement;
  private unlockToggleButton!: HTMLButtonElement;
  private lockDismissed = false;
  private unlockInput!: HTMLInputElement;
  private phaseText!: HTMLElement;
  private joinInput!: HTMLInputElement;
  private openButton!: HTMLButtonElement;
  private joinButton!: HTMLButtonElement;
  private leaveButton!: HTMLButtonElement;
  private inviteBox!: HTMLElement;
  private inviteValue!: HTMLInputElement;
  private copyInviteButton!: HTMLButtonElement;
  private rotateInviteButton!: HTMLButtonElement;
  private noticeBox!: HTMLElement;
  private noticeText!: HTMLElement;
  private title!: HTMLElement;
  private subtitle!: HTMLElement;
  private canvasPane!: HTMLElement;
  private stageCanvas!: HTMLCanvasElement;
  private boardPane!: HTMLElement;
  private boardCanvas!: HTMLCanvasElement;
  private boardToolButtons = new Map<BoardStroke['tool'], HTMLButtonElement>();
  private boardTool: BoardStroke['tool'] = 'pen';
  private boardColor!: HTMLInputElement;
  private boardWidth!: HTMLSelectElement;
  private boardStatus!: HTMLElement;
  private boardLayers!: HTMLElement;
  private boardExportMode!: HTMLSelectElement;
  private boardUndoButton!: HTMLButtonElement;
  private editorPane!: HTMLElement;
  private editorArea!: HTMLTextAreaElement;
  private editorStatus!: HTMLElement;
  private editorOpenButton!: HTMLButtonElement;
  private snippetSelect!: HTMLSelectElement;
  private contactsPane!: HTMLElement;
  private contactsList!: HTMLElement;
  private friendCodeValue!: HTMLElement;
  private importInput!: HTMLInputElement;
  private diagnosticsPane!: HTMLElement;
  private diagnosticList!: HTMLElement;
  private navButtons = new Map<Pane, HTMLButtonElement>();
  private contextTitle!: HTMLElement;
  private contextText!: HTMLElement;
  private housesList!: HTMLElement;
  private peopleList!: HTMLElement;
  private approvalBox!: HTMLElement;
  private approvalList!: HTMLElement;
  private houseEditBox!: HTMLElement;
  private houseNameInput!: HTMLInputElement;
  private houseAccessSelect!: HTMLSelectElement;
  private houseThemeSelect!: HTMLSelectElement;
  private furnitureKindSelect!: HTMLSelectElement;
  private furnitureCount!: HTMLElement;
  private furnitureList!: HTMLElement;
  private furnitureDetail!: HTMLElement;
  private aliasInput!: HTMLInputElement;
  private mediaBox!: HTMLElement;
  private mediaAudience!: HTMLElement;
  private mediaStatus!: HTMLElement;
  private mediaError!: HTMLElement;
  private micButton!: HTMLButtonElement;
  private muteButton!: HTMLButtonElement;
  private deafenButton!: HTMLButtonElement;
  private pttButton!: HTMLButtonElement;
  private screenButton!: HTMLButtonElement;
  private stopScreenButton!: HTMLButtonElement;
  private mediaTiles!: HTMLElement;

  constructor(root: HTMLElement, actions: AppActions) {
    this.root = root;
    this.actions = actions;
    this.build();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.raf = requestAnimationFrame(this.tick);
  }

  update(view: AppView): void {
    this.view = view;
    this.pendingStrokes = this.pendingStrokes.filter((stroke) => !view.network.strokes.some((received) => received.id === stroke.id));
    const ownMember = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    if (this.waitingHouseId && ownMember?.houseId === this.waitingHouseId) {
      this.houseOwnerId = this.waitingHouseId;
      this.waitingHouseId = null;
      this.localPosition = { ...HOUSE_SPAWN };
      this.pane = 'house';
      this.localNotice = null;
    }
    if (this.waitingHouseId && view.network.error) {
      this.waitingHouseId = null;
      this.localNotice = null;
    }
    if (this.houseOwnerId && this.houseOwnerId !== view.identity.fingerprint
      && (view.network.phase !== 'JOINED' || ownMember?.houseId !== this.houseOwnerId)) {
      this.houseOwnerId = null;
      this.pane = 'world';
      this.localPosition = { ...WORLD_SPAWN };
    }
    if (this.waitingHouseId && view.network.phase !== 'JOINED') this.waitingHouseId = null;
    this.refresh();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    for (const mount of this.mediaMounts.values()) mount.element.srcObject = null;
    this.mediaMounts.clear();
    this.root.replaceChildren();
  }

  private build(): void {
    this.shell = node('div', 'sv-app');
    const header = node('header', 'sv-header');
    const brand = node('div', 'sv-brand');
    const logo = node('div', 'sv-logo');
    append(logo, node('span', 'sv-logo-roof'), node('span', 'sv-logo-door'));
    const wordmark = node('div');
    append(wordmark, node('strong', 'sv-brand-name', 'studyvillage'), node('span', 'sv-brand-tag', 'un lugar para crear juntos'));
    append(brand, logo, wordmark);
    const headerActions = node('div', 'sv-header-actions');
    this.statusBadge = node('span', 'sv-status-pill', 'Sin sesión');
    const headerHome = button('Mi casa ↗', 'sv-button sv-button-primary');
    headerHome.addEventListener('click', () => this.enterOwnHouse());
    append(headerActions, this.statusBadge, headerHome);
    append(header, brand, headerActions);

    const layout = node('div', 'sv-layout');
    const sidebar = node('aside', 'sv-sidebar');
    const main = node('main', 'sv-main');
    const inspector = node('aside', 'sv-inspector');
    this.buildSidebar(sidebar);
    this.buildMain(main);
    this.buildInspector(inspector);
    append(layout, sidebar, main, inspector);
    const footer = node('footer', 'sv-footer');
    append(footer, node('span', '', 'HECHO PARA ESTUDIAR Y COMPARTIR'), node('span', '', 'Archivos y proyectos: solo en tu equipo'));
    append(this.shell, header, layout, footer);
    this.root.replaceChildren(this.shell);

    this.lockOverlay = node('div', 'sv-lock-overlay');
    const lockCard = node('form', 'sv-lock-card');
    append(lockCard, node('div', 'sv-lock-icon', '⌂'), node('h2', '', 'Tu identidad está protegida'),
      node('p', '', 'Introduce tu contraseña para volver a abrirla en este equipo.'));
    this.unlockInput = node('input', 'sv-input');
    this.unlockInput.type = 'password';
    this.unlockInput.autocomplete = 'current-password';
    this.unlockInput.required = true;
    append(lockCard, field('Contraseña', this.unlockInput));
    const unlockButton = button('Desbloquear identidad', 'sv-button sv-button-primary');
    unlockButton.type = 'submit';
    lockCard.append(unlockButton);
    this.lockMessage = node('p', 'sv-error');
    this.lockMessage.setAttribute('role', 'status');
    const stayOffline = button('Continuar sin conexión', 'sv-button sv-button-outline');
    stayOffline.addEventListener('click', () => { this.lockDismissed = true; this.refresh(); });
    append(lockCard, this.lockMessage, stayOffline);
    lockCard.addEventListener('submit', (event) => {
      event.preventDefault();
      const passphrase = this.unlockInput.value;
      this.run(() => this.actions.unlockIdentity(passphrase));
      this.unlockInput.value = '';
    });
    this.lockOverlay.append(lockCard);
    this.shell.append(this.lockOverlay);
  }

  private buildSidebar(sidebar: HTMLElement): void {
    const profile = node('section', 'sv-card sv-profile');
    const eyebrow = node('div', 'sv-eyebrow', 'TU RINCÓN');
    const profileRow = node('div', 'sv-profile-row');
    this.profileColor = node('div', 'sv-profile-avatar', '●');
    const profileInfo = node('div');
    this.profileName = node('strong', '', 'Tu nombre');
    append(profileInfo, this.profileName, node('span', 'sv-tiny', 'Identidad local'));
    append(profileRow, this.profileColor, profileInfo);
    const profileForm = node('form', 'sv-stack sv-profile-form');
    this.nameInput = node('input', 'sv-input');
    this.nameInput.maxLength = 32;
    this.nameInput.required = true;
    this.colorInput = node('input', 'sv-color-input');
    this.colorInput.type = 'color';
    append(profileForm, field('Nombre visible', this.nameInput), field('Color', this.colorInput));
    const saveProfile = button('Guardar perfil', 'sv-button sv-button-small');
    saveProfile.type = 'submit';
    profileForm.append(saveProfile);
    profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.run(() => this.actions.updateProfile(this.nameInput.value.trim(), this.colorInput.value));
    });
    append(profile, eyebrow, profileRow, profileForm);

    const nav = node('nav', 'sv-nav');
    nav.setAttribute('aria-label', 'Secciones');
    const entries: [Pane, string, string][] = [
      ['world', '⌂', 'La aldea'], ['house', '▣', 'Mi casa'], ['board', '✎', 'Pizarra'],
      ['editor', '⌘', 'Editor local'], ['contacts', '♧', 'Contactos'], ['diagnostics', '✦', 'Diagnóstico'],
    ];
    for (const [pane, icon, title] of entries) {
      const item = button('', 'sv-nav-item');
      append(item, node('span', 'sv-nav-icon', icon), node('span', '', title));
      item.addEventListener('click', () => this.navigate(pane));
      this.navButtons.set(pane, item);
      nav.append(item);
    }

    const session = node('section', 'sv-card sv-session-card');
    append(session, node('div', 'sv-eyebrow', 'SESIÓN'), node('h3', '', 'Conectar la aldea'));
    this.phaseText = node('p', 'sv-subtle', 'Sin sesión');
    session.append(this.phaseText);
    this.openButton = button('Abrir mi aldea', 'sv-button sv-button-primary sv-wide');
    this.openButton.addEventListener('click', () => this.run(() => this.actions.openVillage()));
    this.joinInput = node('input', 'sv-input');
    this.joinInput.placeholder = 'Pega una invitación';
    this.joinInput.setAttribute('aria-label', 'Código de invitación');
    const joinForm = node('form', 'sv-join-form');
    this.joinButton = button('Unirme', 'sv-button sv-button-small');
    this.joinButton.type = 'submit';
    append(joinForm, this.joinInput, this.joinButton);
    joinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.joinInput.value.trim()) this.run(() => this.actions.joinVillage(this.joinInput.value.trim()));
    });
    this.inviteBox = node('div', 'sv-invite-box');
    this.inviteValue = node('input', 'sv-input sv-code-input');
    this.inviteValue.readOnly = true;
    this.inviteValue.setAttribute('aria-label', 'Invitación actual');
    this.copyInviteButton = button('Copiar', 'sv-button sv-button-small');
    this.copyInviteButton.addEventListener('click', () => this.run(() => this.actions.copyInvite()));
    this.rotateInviteButton = button('Renovar código', 'sv-link-button');
    this.rotateInviteButton.addEventListener('click', () => this.run(() => this.actions.rotateInvite()));
    append(this.inviteBox, node('span', 'sv-field-label', 'Invitación actual'), this.inviteValue,
      this.copyInviteButton, this.rotateInviteButton);
    this.leaveButton = button('Salir de la sesión', 'sv-link-button sv-danger-text');
    this.leaveButton.addEventListener('click', () => {
      if (this.view?.network.isHost && !window.confirm('¿Cerrar el vecindario para todas las personas? Tu casa y tus archivos locales se conservan.')) return;
      this.run(() => this.actions.leave());
    });
    append(session, this.openButton, joinForm, this.inviteBox, this.leaveButton);
    append(sidebar, profile, nav, session);
  }

  private buildMain(main: HTMLElement): void {
    this.noticeBox = node('div', 'sv-notice');
    this.noticeText = node('span');
    const closeNotice = button('×', 'sv-icon-button');
    closeNotice.setAttribute('aria-label', 'Cerrar aviso');
    closeNotice.addEventListener('click', () => {
      this.localNotice = null;
      this.actions.dismissNotice();
      this.refresh();
    });
    append(this.noticeBox, this.noticeText, closeNotice);
    const heading = node('div', 'sv-page-heading');
    const headingCopy = node('div');
    this.title = node('h1', '', 'La aldea');
    this.subtitle = node('p', 'sv-subtle', 'Un espacio tranquilo para estudiar a tu ritmo.');
    append(headingCopy, node('div', 'sv-eyebrow', 'STUDYVILLAGE · TU ESPACIO'), this.title, this.subtitle);
    const headingAction = button('Ir a mi casa →', 'sv-button sv-button-outline');
    headingAction.addEventListener('click', () => this.enterOwnHouse());
    append(heading, headingCopy, headingAction);

    this.canvasPane = node('section', 'sv-stage-pane');
    const stageWrap = node('div', 'sv-canvas-wrap');
    this.stageCanvas = node('canvas', 'sv-canvas');
    this.stageCanvas.width = 768;
    this.stageCanvas.height = 432;
    this.stageCanvas.setAttribute('aria-label', 'Aldea interactiva');
    this.stageCanvas.tabIndex = 0;
    this.stageCanvas.addEventListener('pointerdown', this.onStagePointerDown);
    this.stageCanvas.addEventListener('pointermove', this.onStagePointerMove);
    this.stageCanvas.addEventListener('pointerup', this.onStagePointerUp);
    this.stageCanvas.addEventListener('pointercancel', this.onStagePointerUp);
    append(stageWrap, this.stageCanvas);
    const stageHint = node('div', 'sv-stage-hint');
    append(stageHint, node('span', 'sv-keycap', 'W A S D'), node('span', '', 'Muévete'),
      node('span', 'sv-keycap', 'E'), node('span', '', 'Entra / sal'));
    append(this.canvasPane, stageWrap, stageHint);

    this.buildBoard();
    this.buildEditor();
    this.buildContacts();
    this.buildDiagnostics();
    append(main, this.noticeBox, heading, this.canvasPane, this.boardPane, this.editorPane, this.contactsPane, this.diagnosticsPane);
  }

  private buildBoard(): void {
    this.boardPane = node('section', 'sv-panel sv-board-pane');
    const toolbar = node('div', 'sv-toolbar');
    const tools = node('div', 'sv-segment');
    const labels: [BoardStroke['tool'], string][] = [['pen', 'Lápiz'], ['line', 'Línea'], ['rectangle', 'Rectángulo']];
    for (const [tool, label] of labels) {
      const item = button(label, 'sv-segment-button');
      item.addEventListener('click', () => { this.boardTool = tool; this.refreshBoardControls(); });
      this.boardToolButtons.set(tool, item);
      tools.append(item);
    }
    this.boardColor = node('input', 'sv-color-input');
    this.boardColor.type = 'color';
    this.boardColor.value = BOARD_COLORS[0];
    this.boardColor.setAttribute('aria-label', 'Color del trazo');
    this.boardWidth = select([{ value: '2', label: 'Fino' }, { value: '4', label: 'Medio' }, { value: '8', label: 'Grueso' }]);
    this.boardWidth.setAttribute('aria-label', 'Grosor del trazo');
    this.boardUndoButton = button('↶ Deshacer', 'sv-button sv-button-small');
    this.boardUndoButton.addEventListener('click', () => this.undoStroke());
    append(toolbar, tools, this.boardColor, this.boardWidth, this.boardUndoButton);
    const wrap = node('div', 'sv-canvas-wrap');
    this.boardCanvas = node('canvas', 'sv-canvas');
    this.boardCanvas.width = 768;
    this.boardCanvas.height = 432;
    this.boardCanvas.setAttribute('aria-label', 'Pizarra para dibujar');
    this.boardCanvas.addEventListener('pointerdown', this.onBoardPointerDown);
    this.boardCanvas.addEventListener('pointermove', this.onBoardPointerMove);
    this.boardCanvas.addEventListener('pointerup', this.onBoardPointerUp);
    this.boardCanvas.addEventListener('pointercancel', this.onBoardPointerUp);
    wrap.append(this.boardCanvas);
    const bottom = node('div', 'sv-board-bottom');
    this.boardStatus = node('p', 'sv-subtle');
    const exportGroup = node('div', 'sv-inline');
    this.boardExportMode = select([
      { value: 'all', label: 'Todas las capas' }, { value: 'visible', label: 'Capas visibles' },
    ]);
    this.boardExportMode.setAttribute('aria-label', 'Capas que se exportarán');
    const exportButton = button('↓ Exportar PNG', 'sv-button sv-button-small');
    exportButton.addEventListener('click', () => this.exportBoard());
    append(exportGroup, this.boardExportMode, exportButton);
    append(bottom, this.boardStatus, exportGroup);
    this.boardLayers = node('div', 'sv-layers');
    append(this.boardPane, toolbar, wrap, bottom, node('h3', 'sv-section-title', 'Capas por autor'), this.boardLayers);
  }

  private buildEditor(): void {
    this.editorPane = node('section', 'sv-panel sv-editor-pane');
    const top = node('div', 'sv-editor-top');
    const copy = node('div');
    append(copy, node('div', 'sv-eyebrow', 'SOLO EN TU EQUIPO'), node('h2', '', 'Tu cuaderno de código'),
      node('p', 'sv-subtle', 'Abre un archivo desde un mueble propio. El texto no viaja por la aldea.'));
    this.editorOpenButton = button('Abrir archivo local', 'sv-button sv-button-outline');
    this.editorOpenButton.addEventListener('click', () => this.openEditorFile());
    append(top, copy, this.editorOpenButton);
    this.editorArea = node('textarea', 'sv-editor-area');
    this.editorArea.spellcheck = false;
    this.editorArea.setAttribute('aria-label', 'Editor local');
    this.editorArea.placeholder = 'Escribe una idea, un apunte o un fragmento de código…';
    this.editorArea.addEventListener('input', () => { this.editorDirty = true; this.refreshEditorStatus(); });
    this.editorStatus = node('span', 'sv-subtle', 'Sin cambios');
    this.snippetSelect = select(SNIPPETS.map((item) => ({ value: item.id, label: item.label })));
    this.snippetSelect.setAttribute('aria-label', 'Plantilla para insertar');
    const insertButton = button('Insertar plantilla', 'sv-button sv-button-small');
    insertButton.addEventListener('click', () => this.insertSnippet());
    const saveButton = button('Guardar', 'sv-button sv-button-primary');
    saveButton.addEventListener('click', () => {
      const content = this.editorArea.value;
      this.run(async () => { await this.actions.saveEditor(content); this.editorDirty = false; this.refreshEditorStatus(); });
    });
    const exportButton = button('Exportar copia', 'sv-button sv-button-outline');
    exportButton.addEventListener('click', () => this.run(() => this.actions.exportEditor(this.editorArea.value)));
    const footer = node('div', 'sv-editor-actions');
    append(footer, this.editorStatus, this.snippetSelect, insertButton, exportButton, saveButton);
    append(this.editorPane, top, this.editorArea, footer);
  }

  private buildContacts(): void {
    this.contactsPane = node('section', 'sv-panel');
    const intro = node('div', 'sv-panel-intro');
    append(intro, node('div', 'sv-eyebrow', 'TU AGENDA'), node('h2', '', 'Personas de confianza'),
      node('p', 'sv-subtle', 'Comparte tu tarjeta pública o añade contactos desde un archivo. Tu clave privada nunca aparece en la tarjeta.'));
    const codeCard = node('div', 'sv-contact-code');
    append(codeCard, node('span', 'sv-field-label', 'MI CÓDIGO DE AMISTAD'));
    this.friendCodeValue = node('strong', 'sv-friend-code');
    codeCard.append(this.friendCodeValue);
    const codeButtons = node('div', 'sv-inline');
    const exportButton = button('↓ Exportar mi tarjeta', 'sv-button sv-button-primary');
    exportButton.addEventListener('click', () => this.run(() => this.actions.exportContact()));
    const rotateButton = button('Renovar código', 'sv-button sv-button-outline');
    rotateButton.addEventListener('click', () => this.run(() => this.actions.rotateFriendCode()));
    append(codeButtons, exportButton, rotateButton);
    codeCard.append(codeButtons);
    const importCard = node('div', 'sv-contact-import');
    append(importCard, node('h3', '', 'Añadir contacto'), node('p', 'sv-subtle', 'Selecciona una tarjeta .json que te haya enviado esa persona.'));
    this.importInput = node('input', 'sv-file-input');
    this.importInput.type = 'file';
    this.importInput.accept = '.json,application/json';
    this.importInput.setAttribute('aria-label', 'Importar contacto');
    this.importInput.addEventListener('change', () => {
      const file = this.importInput.files?.[0];
      if (file) this.run(() => this.actions.importContact(file));
      this.importInput.value = '';
    });
    importCard.append(this.importInput);
    this.contactsList = node('div', 'sv-contact-list');
    append(this.contactsPane, intro, codeCard, importCard, node('h3', 'sv-section-title', 'Contactos guardados'), this.contactsList);
  }

  private buildDiagnostics(): void {
    this.diagnosticsPane = node('section', 'sv-panel');
    append(this.diagnosticsPane, node('div', 'sv-eyebrow', 'COMPROBACIONES LOCALES'),
      node('h2', '', 'Diagnóstico'),
      node('p', 'sv-subtle', 'Estas pruebas muestran lo que se ha observado en este equipo. Las pruebas no verificadas siguen marcadas como tales.'));
    const controls = node('div', 'sv-diagnostic-controls');
    const items: [DiagnosticKind, string][] = [
      ['capabilities', 'Capacidades'], ['microphone', 'Micrófono'], ['screen', 'Pantalla'],
      ['stop', 'Detener captura'], ['loopback', 'Bucle local'],
    ];
    for (const [kind, label] of items) {
      const item = button(label, 'sv-button sv-button-outline');
      item.addEventListener('click', () => this.run(() => this.actions.runDiagnostic(kind)));
      controls.append(item);
    }
    this.diagnosticList = node('div', 'sv-diagnostic-list');
    const standalone = node('a', 'sv-link-button', 'Abrir diagnóstico con vista previa y exportación ↗');
    standalone.href = '?diagnostic=1';
    append(this.diagnosticsPane, controls, standalone, this.diagnosticList);
  }

  private buildInspector(inspector: HTMLElement): void {
    const context = node('section', 'sv-card sv-context-card');
    append(context, node('div', 'sv-eyebrow', 'AHORA MISMO'));
    this.contextTitle = node('h3');
    this.contextText = node('p', 'sv-subtle');
    append(context, this.contextTitle, this.contextText);
    this.housesList = node('div', 'sv-house-list');
    this.peopleList = node('div', 'sv-people-list');
    append(context, this.housesList, this.peopleList);

    this.approvalBox = node('section', 'sv-card sv-approval-card');
    append(this.approvalBox, node('div', 'sv-eyebrow', 'SOLICITUDES'), node('h3', '', 'Llaman a la puerta'));
    this.approvalList = node('div', 'sv-approval-list');
    this.approvalBox.append(this.approvalList);

    this.buildHouseEditor();
    this.buildMedia();
    const identityCard = node('section', 'sv-card');
    append(identityCard, node('div', 'sv-eyebrow', 'IDENTIDAD'), node('h3', '', 'Guardar protegida'));
    this.unlockToggleButton = button('Desbloquear identidad', 'sv-button sv-button-small');
    this.unlockToggleButton.addEventListener('click', () => { this.lockDismissed = false; this.refresh(); this.unlockInput.focus(); });
    identityCard.append(this.unlockToggleButton);
    this.identityStatus = node('p', 'sv-subtle');
    identityCard.append(this.identityStatus);
    const saveForm = node('form', 'sv-stack');
    this.saveIdentityInput = node('input', 'sv-input');
    this.saveIdentityInput.type = 'password';
    this.saveIdentityInput.autocomplete = 'new-password';
    this.saveIdentityInput.minLength = 12;
    this.saveIdentityInput.required = true;
    this.saveIdentityButton = button('Cifrar y guardar', 'sv-button sv-button-small');
    this.saveIdentityButton.type = 'submit';
    append(saveForm, field('Contraseña (12+ caracteres)', this.saveIdentityInput), this.saveIdentityButton);
    saveForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const passphrase = this.saveIdentityInput.value;
      this.run(() => this.actions.saveIdentity(passphrase));
      this.saveIdentityInput.value = '';
    });
    identityCard.append(saveForm);
    append(inspector, context, this.approvalBox, this.houseEditBox, this.mediaBox, identityCard);
  }

  private buildHouseEditor(): void {
    this.houseEditBox = node('section', 'sv-card sv-house-editor');
    append(this.houseEditBox, node('div', 'sv-eyebrow', 'DECORA TU ESPACIO'), node('h3', '', 'Mi casa'));
    this.houseNameInput = node('input', 'sv-input');
    this.houseNameInput.maxLength = 32;
    this.houseNameInput.addEventListener('change', () => this.patchOwnHouse({ name: this.houseNameInput.value.trim().slice(0, 32) || 'Mi casa' }));
    this.houseAccessSelect = select([
      { value: 'open', label: 'Puerta abierta' }, { value: 'ask', label: 'Pedir permiso' }, { value: 'locked', label: 'Cerrada' },
    ]);
    this.houseAccessSelect.addEventListener('change', () => this.patchOwnHouse({ access: this.houseAccessSelect.value as PublicHouse['access'] }));
    this.houseThemeSelect = select([{ value: 'mint', label: 'Menta' }, { value: 'peach', label: 'Melocotón' }]);
    this.houseThemeSelect.addEventListener('change', () => this.patchOwnHouse({ theme: this.houseThemeSelect.value as PublicHouse['theme'] }));
    append(this.houseEditBox, field('Nombre público', this.houseNameInput), field('Acceso', this.houseAccessSelect), field('Ambiente', this.houseThemeSelect));
    const furnitureHeader = node('div', 'sv-list-heading');
    this.furnitureCount = node('span', 'sv-tiny');
    append(furnitureHeader, node('strong', '', 'Muebles'), this.furnitureCount);
    this.furnitureList = node('div', 'sv-furniture-list');
    this.furnitureKindSelect = select(FURNITURE_KINDS.map((kind) => ({ value: kind, label: FURNITURE_LABELS[kind] })));
    const addButton = button('+ Añadir', 'sv-button sv-button-small');
    addButton.addEventListener('click', () => {
      const view = this.view;
      if (!view) return;
      const house = addFurniture(view.ownHouse, this.furnitureKindSelect.value as FurnitureKind, view.identity.fingerprint, crypto.randomUUID());
      if (house === view.ownHouse) this.notify('La casa ya tiene el máximo de 32 muebles.');
      else { this.selectedFurnitureId = house.furniture[house.furniture.length - 1].id; this.actions.updateOwnHouse(house); }
    });
    const addRow = node('div', 'sv-inline');
    append(addRow, this.furnitureKindSelect, addButton);
    this.furnitureDetail = node('div', 'sv-furniture-detail');
    this.aliasInput = node('input', 'sv-input');
    this.aliasInput.maxLength = 40;
    this.aliasInput.placeholder = 'Nombre público opcional';
    this.aliasInput.addEventListener('change', () => {
      const view = this.view;
      if (!view || !this.selectedFurnitureId) return;
      const updated = setFurnitureAlias(view.ownHouse, this.selectedFurnitureId, this.aliasInput.value, view.identity.fingerprint);
      if (updated !== view.ownHouse) this.actions.updateOwnHouse(updated);
    });
    const deleteButton = button('Quitar mueble', 'sv-link-button sv-danger-text');
    deleteButton.addEventListener('click', () => {
      const view = this.view;
      if (!view || !this.selectedFurnitureId) return;
      const updated = deleteFurniture(view.ownHouse, this.selectedFurnitureId, view.identity.fingerprint);
      if (updated !== view.ownHouse) this.actions.updateOwnHouse(updated);
      this.selectedFurnitureId = null;
      this.refresh();
    });
    append(this.furnitureDetail, field('Alias visible para todos', this.aliasInput), deleteButton);
    append(this.houseEditBox, furnitureHeader, this.furnitureList, addRow, this.furnitureDetail,
      node('p', 'sv-tiny', 'Arrastra los muebles dentro de tu casa para colocarlos.'));
  }

  private buildMedia(): void {
    this.mediaBox = node('section', 'sv-card sv-media-card');
    append(this.mediaBox, node('div', 'sv-eyebrow', 'EN ESTA CASA'), node('h3', '', 'Audio y pantalla'));
    this.mediaAudience = node('p', 'sv-subtle');
    this.mediaStatus = node('p', 'sv-tiny');
    this.mediaError = node('p', 'sv-error');
    const controls = node('div', 'sv-media-controls');
    this.micButton = button('Activar micro', 'sv-button sv-button-small');
    this.micButton.addEventListener('click', () => this.run(() => this.actions.toggleMicrophone()));
    this.muteButton = button('Silenciar', 'sv-button sv-button-small');
    this.muteButton.addEventListener('click', () => { if (this.view) this.actions.setMuted(!this.view.network.media.muted); });
    this.deafenButton = button('No escuchar', 'sv-button sv-button-small');
    this.deafenButton.addEventListener('click', () => { if (this.view) this.actions.setDeafened(!this.view.network.media.deafened); });
    this.pttButton = button('Pulsar para hablar', 'sv-button sv-button-small');
    this.pttButton.addEventListener('click', () => { if (this.view) this.actions.setPushToTalk(!this.view.network.media.pushToTalk); });
    this.screenButton = button('Compartir pantalla', 'sv-button sv-button-small');
    this.screenButton.addEventListener('click', () => this.run(() => this.actions.startScreen()));
    this.stopScreenButton = button('Detener pantalla', 'sv-button sv-button-small sv-danger-text');
    this.stopScreenButton.addEventListener('click', () => this.actions.stopScreen());
    append(controls, this.micButton, this.muteButton, this.deafenButton, this.pttButton, this.screenButton, this.stopScreenButton);
    this.mediaTiles = node('div', 'sv-media-tiles');
    append(this.mediaBox, this.mediaAudience, this.mediaStatus, this.mediaError, controls, this.mediaTiles,
      node('p', 'sv-tiny', 'La captura puede mostrar notificaciones y contraseñas. Elige una ventana cuando el sistema lo permita.'),
      node('p', 'sv-tiny', 'Con pulsar para hablar activo, mantén la barra espaciadora.'));
  }

  private refresh(): void {
    const view = this.view;
    if (!view) return;
    const phase = view.network.phase;
    const joined = phase === 'JOINED';
    const ready = !view.lockedIdentity;
    setText(this.statusBadge, PHASE_LABEL[phase]);
    this.statusBadge.classList.toggle('is-online', joined);
    setText(this.profileName, view.identity.displayName);
    this.profileColor.style.backgroundColor = view.identity.color;
    setInput(this.nameInput, view.identity.displayName);
    setInput(this.colorInput, /^#[0-9a-fA-F]{6}$/.test(view.identity.color) ? view.identity.color : '#e88d79');
    setText(this.phaseText, view.network.hostGraceRemainingMs !== null
      ? `Reconectando al anfitrión · ${Math.ceil(view.network.hostGraceRemainingMs / 1000)} s restantes`
      : PHASE_LABEL[phase]);
    this.openButton.disabled = !ready || !['IDLE', 'CLOSED', 'DENIED', 'EXPIRED_INVITE', 'NETWORK_FAILED', 'KICKED'].includes(phase);
    this.joinButton.disabled = this.openButton.disabled;
    this.joinInput.disabled = this.openButton.disabled;
    show(this.inviteBox, view.network.isHost && !!view.network.invite);
    setInput(this.inviteValue, view.network.invite || '');
    this.copyInviteButton.disabled = !view.network.invite;
    this.rotateInviteButton.disabled = !joined || !view.network.isHost;
    show(this.leaveButton, !['IDLE', 'CLOSED'].includes(phase));
    const notice = view.network.error || this.localNotice || view.notice;
    show(this.noticeBox, !!notice);
    setText(this.noticeText, notice || '');
    show(this.lockOverlay, view.lockedIdentity && !this.lockDismissed);
    show(this.unlockToggleButton, view.lockedIdentity);
    setText(this.lockMessage, view.notice || '');
    setText(this.identityStatus, view.identitySaved
      ? 'Identidad cifrada en este equipo. No se usa el llavero del sistema.'
      : 'Puedes cifrarla para recuperarla al volver. Sin guardar, vive solo en esta sesión.');
    this.saveIdentityButton.disabled = view.lockedIdentity;
    this.refreshPane();
    this.refreshLists();
    this.refreshHouseEditor();
    this.refreshBoardControls();
    this.refreshEditor();
    this.refreshContacts();
    this.refreshDiagnostics();
    this.refreshMedia();
  }

  private refreshPane(): void {
    const view = this.view!;
    const house = this.currentHouse();
    const titles: Record<Pane, [string, string]> = {
      world: ['La aldea', 'Seis parcelas, tantas casas como personas presentes. Haz clic en una puerta para visitar.'],
      house: [house?.name || 'La casa', house?.ownerId === view.identity.fingerprint
        ? 'Tu espacio sigue disponible incluso sin conexión.' : 'Un rincón compartido para estudiar en compañía.'],
      board: ['La pizarra', 'Dibuja ideas juntos. Oculta capas solo en tu pantalla.'],
      editor: ['Editor local', 'Apuntes y código en tu equipo. Ningún archivo se comparte con la aldea.'],
      contacts: ['Contactos', 'Tu pequeña agenda de personas de confianza.'],
      diagnostics: ['Diagnóstico', 'Comprueba las capacidades observadas en este equipo.'],
    };
    setText(this.title, titles[this.pane][0]);
    setText(this.subtitle, titles[this.pane][1]);
    show(this.canvasPane, this.pane === 'world' || this.pane === 'house');
    show(this.boardPane, this.pane === 'board');
    show(this.editorPane, this.pane === 'editor');
    show(this.contactsPane, this.pane === 'contacts');
    show(this.diagnosticsPane, this.pane === 'diagnostics');
    for (const [pane, item] of this.navButtons) {
      item.classList.toggle('is-active', this.pane === pane);
      item.setAttribute('aria-current', this.pane === pane ? 'page' : 'false');
    }
    this.stageCanvas.setAttribute('aria-label', this.pane === 'house' ? 'Interior de la casa' : 'Aldea interactiva');
  }

  private refreshLists(): void {
    const view = this.view!;
    const occupied = occupiedParcels(view);
    const house = this.currentHouse();
    setText(this.contextTitle, this.pane === 'house' || this.pane === 'board' ? (house?.name || 'Tu casa') : 'Casas de la aldea');
    setText(this.contextText, this.pane === 'house' || this.pane === 'board'
      ? `${view.network.members.filter((member) => member.connected && member.houseId === (house?.ownerId || view.identity.fingerprint)).length || 1} persona(s) aquí`
      : `${occupied.length} de 6 parcelas ocupadas`);
    const signature = JSON.stringify({
      houses: occupied.map((item) => [item.ownerId, item.house.name, item.house.access, item.parcel.slot]),
      members: view.network.members.map((member) => [member.identity.fingerprint, member.identity.displayName, member.connected, member.houseId]),
      joins: view.network.pendingJoins.map((request) => [request.requestId, request.identity.displayName]),
      visits: view.network.pendingVisits.map((request) => [request.requestId, request.identity.displayName, request.houseId]),
      isHost: view.network.isHost,
    });
    if (signature === this.lastListsSignature) return;
    this.lastListsSignature = signature;
    this.housesList.replaceChildren();
    for (const item of occupied) {
      const row = button('', 'sv-house-row');
      const icon = node('span', 'sv-house-icon', item.house.theme === 'peach' ? '▰' : '⌂');
      const info = node('span', 'sv-house-row-text');
      append(info, node('strong', '', item.house.name), node('small', '', item.isOwn ? 'Tu casa' : `${item.name} · ${this.accessLabel(item.house.access)}`));
      append(row, icon, info, node('span', '', '→'));
      row.disabled = !item.isOwn && (view.network.phase !== 'JOINED' || item.house.access === 'locked');
      row.addEventListener('click', () => this.openHouse(item.ownerId));
      this.housesList.append(row);
    }
    this.peopleList.replaceChildren();
    if (view.network.members.length) {
      this.peopleList.append(node('div', 'sv-eyebrow sv-list-divider', 'VECINDARIO'));
      for (const member of view.network.members.filter((person) => person.connected)) {
        const row = node('div', 'sv-person-row');
        const dot = node('span', 'sv-person-dot');
        dot.style.backgroundColor = member.identity.color;
        const label = node('span', '', `${member.identity.displayName} · ${member.identity.fingerprint.slice(0, 8)}`);
        append(row, dot, label);
        if (view.network.isHost && member.identity.fingerprint !== view.identity.fingerprint) {
          const kick = button('Sacar', 'sv-link-button sv-danger-text');
          kick.setAttribute('aria-label', `Sacar a ${member.identity.displayName} de la sesión`);
          kick.addEventListener('click', () => this.actions.kickMember(member.identity.fingerprint));
          row.append(kick);
        } else if (member.houseId === view.identity.fingerprint && member.identity.fingerprint !== view.identity.fingerprint) {
          const kick = button('Salir', 'sv-link-button sv-danger-text');
          kick.setAttribute('aria-label', `Sacar a ${member.identity.displayName} de tu casa`);
          kick.addEventListener('click', () => this.actions.kickVisitor(member.identity.fingerprint));
          row.append(kick);
        }
        this.peopleList.append(row);
      }
    }
    this.approvalList.replaceChildren();
    const joins = view.network.isHost ? view.network.pendingJoins : [];
    const visits = view.network.pendingVisits.filter((request) => request.houseId === view.identity.fingerprint);
    show(this.approvalBox, joins.length + visits.length > 0);
    for (const request of joins) this.approvalList.append(this.approvalRow(`${request.identity.displayName} · ${request.identity.fingerprint.slice(0, 12)}`, 'Quiere entrar en la aldea',
      () => this.actions.decideJoin(request.requestId, true), () => this.actions.decideJoin(request.requestId, false)));
    for (const request of visits) this.approvalList.append(this.approvalRow(`${request.identity.displayName} · ${request.identity.fingerprint.slice(0, 12)}`, 'Quiere visitar tu casa',
      () => this.actions.decideVisit(request.requestId, true), () => this.actions.decideVisit(request.requestId, false)));
  }

  private approvalRow(name: string, detail: string, accept: () => void, deny: () => void): HTMLElement {
    const row = node('div', 'sv-approval-row');
    append(row, node('strong', '', name), node('small', '', detail));
    const controls = node('div', 'sv-inline');
    const yes = button('Permitir', 'sv-button sv-button-small sv-button-primary');
    const no = button('Rechazar', 'sv-button sv-button-small');
    yes.addEventListener('click', () => this.run(accept));
    no.addEventListener('click', () => this.run(deny));
    append(controls, yes, no);
    row.append(controls);
    return row;
  }

  private refreshHouseEditor(): void {
    const view = this.view!;
    show(this.houseEditBox, this.pane === 'house' && this.houseOwnerId === view.identity.fingerprint);
    if (this.houseEditBox.hidden) return;
    const house = view.ownHouse;
    setInput(this.houseNameInput, house.name);
    setInput(this.houseAccessSelect, house.access);
    setInput(this.houseThemeSelect, house.theme);
    setText(this.furnitureCount, `${house.furniture.length}/${LIMITS.furniture}`);
    const selected = house.furniture.find((item) => item.id === this.selectedFurnitureId) || null;
    show(this.furnitureDetail, !!selected);
    if (selected) setInput(this.aliasInput, selected.publicAlias);
    this.furnitureList.replaceChildren();
    for (const item of house.furniture) {
      const row = button(`${FURNITURE_LABELS[item.kind]}${item.publicAlias ? ` · ${item.publicAlias}` : ''}`, 'sv-furniture-item');
      row.classList.toggle('is-selected', item.id === this.selectedFurnitureId);
      row.addEventListener('click', () => { this.selectedFurnitureId = item.id; this.refreshHouseEditor(); });
      this.furnitureList.append(row);
    }
  }

  private refreshBoardControls(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const strokes = this.allStrokes(boardId);
    for (const [tool, item] of this.boardToolButtons) item.classList.toggle('is-active', tool === this.boardTool);
    this.boardUndoButton.disabled = !newestOwnStroke(strokes, view.identity.fingerprint, boardId);
    const canDraw = this.canDrawBoard();
    setText(this.boardStatus, !canDraw
      ? 'Entra en la casa para dibujar en su pizarra.'
      : boardAtCapacity(strokes, boardId)
        ? `Pizarra llena · ${LIMITS.boardOperations}/${LIMITS.boardOperations} operaciones`
        : `${strokes.length}/${LIMITS.boardOperations} operaciones · ${this.offlineStrokes.some((stroke) => stroke.boardId === boardId) ? 'Hay trazos locales sin guardar' : 'Los trazos propios sin conexión viven solo aquí'}`);
    this.boardCanvas.classList.toggle('is-disabled', !canDraw || boardAtCapacity(strokes, boardId));
    const authors = [...new Set(strokes.map((stroke) => stroke.author))].sort();
    const signature = JSON.stringify([boardId, authors, view.network.members.map((member) => [member.identity.fingerprint, member.identity.displayName])]);
    if (signature === this.lastLayersSignature) return;
    this.lastLayersSignature = signature;
    this.boardLayers.replaceChildren();
    if (!authors.length) this.boardLayers.append(node('p', 'sv-subtle', 'Todavía no hay trazos.'));
    for (const author of authors) {
      const label = node('label', 'sv-layer');
      const input = node('input');
      input.type = 'checkbox';
      input.checked = !this.hiddenAuthors.has(author);
      input.addEventListener('change', () => {
        if (input.checked) this.hiddenAuthors.delete(author);
        else this.hiddenAuthors.add(author);
      });
      const name = author === view.identity.fingerprint ? 'Mis trazos' :
        view.network.members.find((member) => member.identity.fingerprint === author)?.identity.displayName || `${author.slice(0, 10)}…`;
      append(label, input, node('span', '', name), node('small', '', 'Solo en mi vista'));
      this.boardLayers.append(label);
    }
  }

  private refreshEditor(): void {
    const view = this.view!;
    if (view.editorText !== this.lastEditorFromView) {
      this.lastEditorFromView = view.editorText;
      if (!this.editorDirty) this.editorArea.value = view.editorText;
    }
    this.editorOpenButton.disabled = !view.ownHouse.furniture.some((item) => item.kind === 'desk');
    this.editorOpenButton.title = this.editorOpenButton.disabled ? 'Añade un escritorio en Mi casa para abrir un archivo' : '';
    this.refreshEditorStatus();
  }

  private refreshEditorStatus(): void {
    setText(this.editorStatus, this.editorDirty ? 'Cambios sin guardar' : 'Guardado localmente');
  }

  private refreshContacts(): void {
    const view = this.view!;
    setText(this.friendCodeValue, view.friendCode);
    const signature = JSON.stringify(view.contacts.map((contact) => [contact.identity.fingerprint, contact.identity.displayName, contact.friendCode]));
    if (this.contactsList.dataset.signature === signature) return;
    this.contactsList.dataset.signature = signature;
    this.contactsList.replaceChildren();
    if (!view.contacts.length) this.contactsList.append(node('p', 'sv-subtle', 'Aún no has añadido contactos.'));
    for (const contact of view.contacts) {
      const card = node('div', 'sv-contact-row');
      const avatar = node('span', 'sv-person-dot');
      avatar.style.backgroundColor = contact.identity.color;
      const copy = node('div');
      append(copy, node('strong', '', contact.identity.displayName), node('small', '', contact.identity.fingerprint.slice(0, 18)));
      append(card, avatar, copy);
      this.contactsList.append(card);
    }
  }

  private refreshDiagnostics(): void {
    const entries = this.view!.diagnostics;
    const signature = JSON.stringify(entries);
    if (this.diagnosticList.dataset.signature === signature) return;
    this.diagnosticList.dataset.signature = signature;
    this.diagnosticList.replaceChildren();
    if (!entries.length) this.diagnosticList.append(node('p', 'sv-subtle', 'Ejecuta una prueba para ver resultados.'));
    for (const entry of entries) {
      const row = node('div', 'sv-diagnostic-row');
      const badge = node('span', `sv-diagnostic-badge is-${entry.status.toLowerCase()}`, entry.status);
      const copy = node('div');
      append(copy, node('strong', '', entry.test), node('p', 'sv-subtle', entry.detail));
      append(row, badge, copy);
      this.diagnosticList.append(row);
    }
  }

  private refreshMedia(): void {
    const view = this.view!;
    const media = view.network.media;
    const ownMember = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    const showingCurrentRoom = !!this.houseOwnerId && ownMember?.houseId === this.houseOwnerId;
    const connected = view.network.phase === 'JOINED' && !view.lockedIdentity && showingCurrentRoom;
    setText(this.mediaAudience, showingCurrentRoom ? (media.audience || 'Nadie recibe tu audio o pantalla ahora.') : 'Nadie recibe tu audio o pantalla ahora.');
    setText(this.mediaStatus, SCREEN_LABEL[media.screenPhase]);
    setText(this.mediaError, media.error || '');
    show(this.mediaError, !!media.error);
    setText(this.micButton, media.micEnabled ? 'Apagar micro' : 'Activar micro');
    setText(this.muteButton, media.muted ? 'Quitar silencio' : 'Silenciar');
    setText(this.deafenButton, media.deafened ? 'Volver a escuchar' : 'No escuchar');
    setText(this.pttButton, media.pushToTalk ? 'PTT activo' : 'Pulsar para hablar');
    this.pttButton.classList.toggle('is-active', media.pushToTalk);
    this.muteButton.classList.toggle('is-active', media.muted);
    this.deafenButton.classList.toggle('is-active', media.deafened);
    this.micButton.disabled = !connected;
    this.muteButton.disabled = !connected || !media.micEnabled;
    this.deafenButton.disabled = !connected;
    this.pttButton.disabled = !connected || !media.micEnabled;
    this.screenButton.disabled = !connected || !['OFF', 'SOURCE_ENDED', 'DENIED', 'NETWORK_FAILED'].includes(media.screenPhase);
    this.stopScreenButton.disabled = !['REQUESTING_OS_PERMISSION', 'CAPTURING_LOCAL', 'NEGOTIATING', 'SENDING'].includes(media.screenPhase);
    const desired = new Map<string, { stream: MediaStream; kind: 'audio' | 'screen'; name: string; local: boolean }>();
    if (media.localScreen && showingCurrentRoom) desired.set('local-screen', { stream: media.localScreen, kind: 'screen', name: 'Tu pantalla', local: true });
    for (const remote of showingCurrentRoom ? media.remote : []) {
      const name = view.network.members.find((member) => member.identity.fingerprint === remote.identityId)?.identity.displayName || remote.identityId.slice(0, 10);
      desired.set(`${remote.kind}:${remote.identityId}`, { stream: remote.stream, kind: remote.kind, name, local: false });
    }
    for (const [key, mount] of this.mediaMounts) {
      if (!desired.has(key)) {
        mount.element.pause();
        mount.element.srcObject = null;
        mount.wrapper.remove();
        this.mediaMounts.delete(key);
      }
    }
    for (const [key, item] of desired) {
      let mount = this.mediaMounts.get(key);
      if (!mount) {
        const wrapper = node('div', 'sv-media-tile');
        const element = document.createElement(item.kind === 'screen' ? 'video' : 'audio');
        element.autoplay = true;
        element.controls = !item.local;
        element.setAttribute('playsinline', '');
        if (item.local) element.muted = true;
        append(wrapper, node('strong', '', item.name), element);
        this.mediaTiles.append(wrapper);
        mount = { wrapper, element, stream: item.stream };
        this.mediaMounts.set(key, mount);
        element.srcObject = item.stream;
        void element.play().catch(() => { /* Browser autoplay may require a gesture. */ });
      } else {
        setText(mount.wrapper.querySelector('strong')!, item.name);
        if (mount.stream !== item.stream) {
          mount.stream = item.stream;
          mount.element.srcObject = item.stream;
          void mount.element.play().catch(() => { /* Browser autoplay may require a gesture. */ });
        }
      }
    }
  }

  private navigate(pane: Pane): void {
    if (!this.view) return;
    if (pane === 'world') this.leaveCurrentHouse();
    else if (pane === 'house') { this.enterOwnHouse(); return; }
    else if (pane === 'board' && !this.houseOwnerId) this.enterOwnHouse();
    this.pane = pane;
    this.refresh();
  }

  private enterOwnHouse(): void { this.openHouse(this.view?.identity.fingerprint || ''); }

  private openHouse(ownerId: string): void {
    const view = this.view;
    if (!view || !ownerId) return;
    const isOwn = ownerId === view.identity.fingerprint;
    const house = isOwn ? view.ownHouse : view.network.houses.find((item) => item.ownerId === ownerId);
    if (!house) return;
    if (!isOwn && (view.network.phase !== 'JOINED' || house.access === 'locked')) return;
    if (view.network.phase === 'JOINED') this.run(() => this.actions.visitHouse(ownerId));
    if (isOwn) {
      this.houseOwnerId = ownerId;
      this.waitingHouseId = null;
      this.pane = 'house';
      this.localPosition = { ...HOUSE_SPAWN };
    } else {
      this.waitingHouseId = ownerId;
      this.notify(house.access === 'ask' ? 'Solicitud enviada. Espera a que te abran la puerta.' : 'Entrando en la casa…');
    }
    this.refresh();
  }

  private leaveCurrentHouse(): void {
    const view = this.view;
    if (!view) return;
    if (view.network.phase === 'JOINED' && (this.houseOwnerId || this.waitingHouseId)) this.run(() => this.actions.leaveHouse());
    this.houseOwnerId = null;
    this.waitingHouseId = null;
    this.selectedFurnitureId = null;
    this.pane = 'world';
    this.localPosition = { ...WORLD_SPAWN };
    this.refresh();
  }

  private currentHouse(): PublicHouse | null {
    const view = this.view;
    if (!view) return null;
    if (!this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint) return view.ownHouse;
    return view.network.houses.find((house) => house.ownerId === this.houseOwnerId) || null;
  }

  private patchOwnHouse(patch: Partial<PublicHouse>): void {
    const view = this.view;
    if (!view) return;
    this.actions.updateOwnHouse({ ...view.ownHouse, ...patch, revision: view.ownHouse.revision + 1 });
  }

  private boardId(): string { return this.houseOwnerId || this.view?.identity.fingerprint || ''; }

  private allStrokes(boardId: string): BoardStroke[] {
    const network = this.view?.network.strokes || [];
    const seen = new Set(network.map((stroke) => stroke.id));
    return [...network.filter((stroke) => stroke.boardId === boardId),
      ...this.pendingStrokes.filter((stroke) => stroke.boardId === boardId && !seen.has(stroke.id)),
      ...this.offlineStrokes.filter((stroke) => stroke.boardId === boardId)];
  }

  private canDrawBoard(): boolean {
    const view = this.view;
    if (!view || view.lockedIdentity) return false;
    const boardId = this.boardId();
    if (view.network.phase !== 'JOINED') return boardId === view.identity.fingerprint;
    const own = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    return own?.houseId === boardId;
  }

  private undoStroke(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const stroke = newestOwnStroke(this.allStrokes(boardId), view.identity.fingerprint, boardId);
    if (!stroke) return;
    const offline = this.offlineStrokes.find((item) => item.id === stroke.id);
    if (offline) offline.deleted = true;
    else {
      const pending = this.pendingStrokes.find((item) => item.id === stroke.id);
      if (pending) pending.deleted = true;
      this.run(() => this.actions.deleteStroke(stroke.id));
    }
    this.refreshBoardControls();
  }

  private exportBoard(): void {
    const boardId = this.boardId();
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 432;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const strokes = this.boardExportMode.value === 'all'
      ? this.allStrokes(boardId).filter((stroke) => !stroke.deleted)
      : visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    drawBoard(ctx, strokes);
    this.run(() => this.actions.exportBoard(canvas));
  }

  private openEditorFile(): void {
    const view = this.view;
    if (!view) return;
    const selected = view.ownHouse.furniture.find((item) => item.id === this.selectedFurnitureId && item.kind === 'desk');
    const desk = selected || view.ownHouse.furniture.find((item) => item.kind === 'desk');
    if (!desk) { this.notify('Añade un escritorio en Mi casa para abrir un archivo.'); return; }
    if (this.editorDirty && !window.confirm('¿Abrir otro archivo? Si eliges un texto, reemplazará los cambios sin guardar del editor.')) return;
    const before = view.editorText;
    this.run(async () => {
      await this.actions.openLocalFile(desk.id);
      if (this.view && this.view.editorText !== before) {
        this.editorDirty = false; this.editorArea.value = this.view.editorText; this.refreshEditorStatus();
      }
    });
  }

  private insertSnippet(): void {
    const snippet = SNIPPETS.find((item) => item.id === this.snippetSelect.value);
    if (!snippet) return;
    const { text, caret } = insertAtSelection(this.editorArea.value, snippet.text,
      this.editorArea.selectionStart, this.editorArea.selectionEnd);
    this.editorArea.value = text;
    this.editorArea.focus();
    this.editorArea.setSelectionRange(caret, caret);
    this.editorDirty = true;
    this.refreshEditorStatus();
  }

  private run(action: () => void | Promise<void>): void {
    try { void Promise.resolve(action()).catch((error: unknown) => this.notify(this.errorMessage(error))); }
    catch (error) { this.notify(this.errorMessage(error)); }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : 'No se pudo completar la acción.';
  }

  private notify(message: string): void { this.localNotice = message; this.refresh(); }

  private canvasPoint(event: PointerEvent, canvas: HTMLCanvasElement): BoardPoint {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height };
  }

  private onStagePointerDown = (event: PointerEvent): void => {
    const view = this.view;
    if (!view) return;
    const point = this.canvasPoint(event, this.stageCanvas);
    if (this.pane === 'world') {
      const item = occupiedParcels(view).find((candidate) => pointInRect(point.x, point.y, candidate.parcel));
      if (item) this.openHouse(item.ownerId);
      return;
    }
    if (this.pane !== 'house') return;
    if (point.y >= 384 && point.x >= 340 && point.x <= 428) { this.leaveCurrentHouse(); return; }
    const house = this.currentHouse();
    if (!house) return;
    const item = hitFurniture(house, point.x, point.y);
    this.selectedFurnitureId = item?.id || null;
    this.refreshHouseEditor();
    if (item && house.ownerId === view.identity.fingerprint) {
      this.drag = { id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y, baseHouse: house };
      this.stageCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  private onStagePointerMove = (event: PointerEvent): void => {
    if (!this.drag || !this.view) return;
    const point = this.canvasPoint(event, this.stageCanvas);
    this.previewHouse = moveFurniture(this.drag.baseHouse, this.drag.id,
      point.x - this.drag.offsetX, point.y - this.drag.offsetY, this.view.identity.fingerprint);
  };

  private onStagePointerUp = (event: PointerEvent): void => {
    if (!this.drag) return;
    if (this.stageCanvas.hasPointerCapture(event.pointerId)) this.stageCanvas.releasePointerCapture(event.pointerId);
    if (this.previewHouse && this.previewHouse !== this.drag.baseHouse) this.actions.updateOwnHouse(this.previewHouse);
    this.previewHouse = null;
    this.drag = null;
  };

  private onBoardPointerDown = (event: PointerEvent): void => {
    if (!this.canDrawBoard() || boardAtCapacity(this.allStrokes(this.boardId()), this.boardId())) return;
    const point = clampBoardPoint(this.canvasPoint(event, this.boardCanvas));
    this.boardDraft = { points: [point], tool: this.boardTool, color: this.boardColor.value, width: Number(this.boardWidth.value) };
    this.boardCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private onBoardPointerMove = (event: PointerEvent): void => {
    if (!this.boardDraft) return;
    const point = clampBoardPoint(this.canvasPoint(event, this.boardCanvas));
    const points = this.boardDraft.points;
    if (this.boardDraft.tool === 'pen') {
      const last = points[points.length - 1];
      if (points.length < LIMITS.strokePoints && Math.hypot(point.x - last.x, point.y - last.y) >= 2) points.push(point);
    } else points[1] = point;
  };

  private onBoardPointerUp = (event: PointerEvent): void => {
    const view = this.view;
    const draft = this.boardDraft;
    if (!view || !draft) return;
    if (this.boardCanvas.hasPointerCapture(event.pointerId)) this.boardCanvas.releasePointerCapture(event.pointerId);
    this.boardDraft = null;
    const boardId = this.boardId();
    const online = view.network.phase === 'JOINED';
    const list = online ? [...view.network.strokes, ...this.pendingStrokes] : this.offlineStrokes;
    const stroke = makeStroke(boardId, view.identity.fingerprint, nextSequence(list, view.identity.fingerprint, boardId),
      draft.tool, draft.color, draft.width, draft.points);
    if (online) {
      this.pendingStrokes.push(stroke);
      this.run(() => this.actions.sendStroke(stroke));
    } else this.offlineStrokes.push(stroke);
    this.refreshBoardControls();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.view || this.view.lockedIdentity || this.isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
      this.keys.add(key);
      if (this.pane === 'world' || this.pane === 'house') event.preventDefault();
    }
    if (key === 'e' && !event.repeat) {
      if (this.pane === 'world') {
        const closest = closestDoor(this.localPosition, occupiedParcels(this.view));
        if (closest) this.openHouse(closest.ownerId);
      } else if (this.pane === 'house') this.leaveCurrentHouse();
    }
    if (event.code === 'Space' && this.view.network.media.pushToTalk && this.view.network.media.micEnabled && !event.repeat) {
      this.actions.setTalking(true);
      event.preventDefault();
    }
    if (key === 'escape' && (this.pane === 'house' || this.pane === 'board')) this.leaveCurrentHouse();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
    if (event.code === 'Space' && this.view?.network.media.pushToTalk) this.actions.setTalking(false);
  };

  private onBlur = (): void => {
    this.keys.clear();
    if (this.view?.network.media.pushToTalk) this.actions.setTalking(false);
  };

  private isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
  }

  private tick = (now: number): void => {
    if (document.hidden || (this.lastFrame && now - this.lastFrame < 1000 / 30)) {
      if (document.hidden) this.lastFrame = now;
      this.raf = requestAnimationFrame(this.tick); return;
    }
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    const view = this.view;
    if (view && (this.pane === 'world' || this.pane === 'house')) {
      const vector = {
        x: Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft')),
        y: Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup')),
      };
      const previous = this.localPosition;
      const next = this.pane === 'world'
        ? stepPosition(previous, vector, dt, worldObstacles(occupiedParcels(view)))
        : stepHousePosition(previous, vector, dt, this.currentHouse() || view.ownHouse);
      this.localPosition = next;
      if (view.network.phase === 'JOINED' && (next.x !== previous.x || next.y !== previous.y || next.moving !== previous.moving)
        && (now - this.lastMoveSent > 80 || !next.moving)) {
        this.lastMoveSent = now;
        this.actions.move(next);
      }
      const ctx = this.stageCanvas.getContext('2d');
      if (ctx) {
        const people = this.visiblePeople(view);
        if (this.pane === 'world') drawWorld(ctx, occupiedParcels(view), people);
        else drawHouseInterior(ctx, this.previewHouse || this.currentHouse() || view.ownHouse, people, this.selectedFurnitureId);
      }
    }
    if (view && this.pane === 'board') {
      const ctx = this.boardCanvas.getContext('2d');
      if (ctx) drawBoard(ctx, visibleStrokes(this.allStrokes(this.boardId()), this.boardId(), this.hiddenAuthors), this.boardDraft);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private visiblePeople(view: AppView): DrawPerson[] {
    const sceneHouse = this.pane === 'house' ? this.houseOwnerId : null;
    const people: DrawPerson[] = [{ identity: view.identity, position: this.localPosition, isOwn: true }];
    for (const member of view.network.members) {
      if (!member.connected || member.identity.fingerprint === view.identity.fingerprint || member.houseId !== sceneHouse) continue;
      people.push({ identity: member.identity, position: member.position, isOwn: false });
    }
    return people;
  }

  private accessLabel(access: PublicHouse['access']): string {
    return access === 'open' ? 'abierta' : access === 'ask' ? 'con permiso' : 'cerrada';
  }
}

export function createStudyUI(root: HTMLElement, actions: AppActions): { update(view: AppView): void; destroy(): void } {
  const ui = new StudyUI(root, actions);
  return { update: (view) => ui.update(view), destroy: () => ui.destroy() };
}
