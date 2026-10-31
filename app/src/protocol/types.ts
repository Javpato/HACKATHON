/** Frozen cross-module API. Only the integrator changes this file. */
export const LIMITS = {
  members: 6, hostGraceMs: 60_000, leaveAckMs: 1_500,
  messageBytes: 65_536, queueMessages: 128, queueBytes: 1_048_576,
  strokePoints: 512, boardOperations: 2_000, furniture: 32,
  worldWidth: 768, worldHeight: 432,
  // Whiteboard: the board is unbounded in practice; coordinates are world
  // units within ±boardExtent, and a text note is at most boardText chars.
  boardExtent: 20_000, boardText: 280,
  // One shared-activity message (a game view, a drawing, the project list),
  // kept well under messageBytes once wrapped in its envelope.
  appData: 56_000,
} as const;

export type AppChannel = 'werewolves' | 'gartic' | 'projects' | 'study';
export interface AppMessage { channel: AppChannel; from: IdentityId; data: string }

export type IdentityId = string;
export interface PublicIdentity { fingerprint: IdentityId; publicKey: string; displayName: string; color: string }
export interface LocalIdentity { public: PublicIdentity; privateKey: CryptoKey }
export interface EncryptedIdentity {
  v: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string;
  ciphertext: string; publicIdentity: PublicIdentity;
}
export interface Contact { schemaVersion: 1; identity: PublicIdentity; friendCode: string }
export type HouseAccess = 'open' | 'ask' | 'locked';
export type FurnitureKind = 'desk' | 'bookshelf' | 'board' | 'plant' | 'table' | 'frame' | 'cabinet';
export interface Furniture { rotation?: 0 | 90 | 180 | 270; id: string; kind: FurnitureKind; x: number; y: number; publicAlias: string }
export interface PublicHouse { ownerId: IdentityId; revision: number; name: string; access: HouseAccess; theme: 'mint' | 'peach'; furniture: Furniture[] }
export interface Position { areaId?: 'residential' | 'community' | 'study'; x: number; y: number; direction: 'up' | 'down' | 'left' | 'right'; moving: boolean }
export interface Member { identity: PublicIdentity; endpoint: string; slot: number; connected: boolean; houseId: IdentityId | null; position: Position }
export interface JoinRequest { requestId: string; identity: PublicIdentity }
export interface VisitRequest { requestId: string; identity: PublicIdentity; houseId: IdentityId }
export type SessionPhase = 'IDLE' | 'SIGNALING' | 'CONNECTING' | 'AUTHENTICATING' | 'PENDING_APPROVAL' | 'JOINED' | 'RECONNECTING' | 'DENIED' | 'EXPIRED_INVITE' | 'NETWORK_FAILED' | 'KICKED' | 'CLOSED';
export interface BoardPoint { x: number; y: number }
export interface BoardStroke { id: string; author: IdentityId; boardId: IdentityId; seq: number; color: string; width: number; tool: 'pen' | 'line' | 'rectangle' | 'text'; points: BoardPoint[]; deleted: boolean; text?: string }
export type ScreenPhase = 'OFF' | 'REQUESTING_OS_PERMISSION' | 'CAPTURING_LOCAL' | 'NEGOTIATING' | 'SENDING' | 'DENIED' | 'NOT_SUPPORTED' | 'SOURCE_ENDED' | 'NETWORK_FAILED';
export interface RemoteMedia { identityId: IdentityId; kind: 'audio' | 'screen'; stream: MediaStream }
export interface MediaView { micEnabled: boolean; muted: boolean; deafened: boolean; pushToTalk: boolean; talking: boolean; screenPhase: ScreenPhase; localScreen: MediaStream | null; remote: RemoteMedia[]; audience: string; error: string | null }
export interface NetworkView {
  phase: SessionPhase; isHost: boolean; hostId: IdentityId | null; sessionId: string | null; invite: string | null;
  members: Member[]; houses: PublicHouse[]; pendingJoins: JoinRequest[]; pendingVisits: VisitRequest[];
  strokes: BoardStroke[]; hostGraceRemainingMs: number | null; error: string | null; media: MediaView;
  /** Private voice: who you asked, whether they asked you back, and who is asking you. */
  privateCall: { with: IdentityId | null; active: boolean; incoming: IdentityId[] };
}
export interface VillageActions {
  openVillage(): Promise<void>; joinVillage(invite: string): Promise<void>;
  decideJoin(requestId: string, accept: boolean): void; rotateInvite(): void;
  leave(): Promise<void>; visitHouse(ownerId: IdentityId): void;
  decideVisit(requestId: string, accept: boolean): void; leaveHouse(): void;
  publishHouse(house: PublicHouse): void; move(position: Position): void;
  sendStroke(stroke: BoardStroke): void; deleteStroke(strokeId: string): void;
  kickMember(identityId: IdentityId): void; kickVisitor(identityId: IdentityId): void;
  toggleMicrophone(): Promise<void>; setMuted(muted: boolean): void;
  setDeafened(deafened: boolean): void; setPushToTalk(enabled: boolean): void; setTalking(talking: boolean): void;
  startScreen(): Promise<void>; stopScreen(): void;
  /** Ask for (or accept) a private call with one person; null returns to public voice. */
  requestPrivate(identityId: IdentityId | null): void;
  /** Send a shared-activity message to one member, or to everyone with `to: null`. */
  sendApp(channel: AppChannel, to: IdentityId | null, data: string): boolean;
  /** Receive shared-activity messages from other members; returns an unsubscribe. */
  onApp(listener: (message: AppMessage) => void): () => void;
}
export interface DiagnosticEntry { test: string; status: 'PASS' | 'FAIL' | 'UNVERIFIED' | 'UNSUPPORTED'; detail: string }
export interface AppView {
  identity: PublicIdentity; network: NetworkView; ownHouse: PublicHouse;
  contacts: Contact[]; friendCode: string; storage: 'sqlite' | 'indexeddb' | 'memory';
  identitySaved: boolean; lockedIdentity: boolean; notice: string | null;
  diagnostics: DiagnosticEntry[]; editorText: string;
}
export interface AppActions extends VillageActions {
  updateProfile(displayName: string, color: string): Promise<void>;
  updateOwnHouse(house: PublicHouse): void; copyInvite(): Promise<void>;
  saveIdentity(passphrase: string): Promise<void>; unlockIdentity(passphrase: string): Promise<void>;
  exportContact(): void; importContact(file: File): Promise<void>; rotateFriendCode(): void;
  openLocalFile(furnitureId: string): Promise<void>; saveEditor(text: string): Promise<void>;
  exportEditor(text: string): void; exportBoard(canvas: HTMLCanvasElement): void;
  runDiagnostic(kind: 'capabilities' | 'microphone' | 'screen' | 'stop' | 'loopback'): Promise<void>;
  dismissNotice(): void;
}
