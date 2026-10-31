import { z } from 'zod';
import type { Contact, EncryptedIdentity, PublicHouse } from '../protocol/types';

const text = (max: number) => z.string().max(max);
const identity = z.object({ fingerprint: text(128).min(16), publicKey: text(2048).min(32), displayName: text(32).min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict();
const furniture = z.object({ id: text(80).min(1), kind: z.enum(['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet']), x: z.number().finite().min(0).max(736), y: z.number().finite().min(0).max(400), publicAlias: text(48) }).strict();
export const houseSchema = z.object({ ownerId: text(128).min(1), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), name: text(48).min(1), access: z.enum(['open', 'ask', 'locked']), theme: z.enum(['mint', 'peach']), furniture: z.array(furniture).max(32) }).strict().refine(h => new Set(h.furniture.map(f => f.id)).size === h.furniture.length, 'Duplicate furniture id');
const contact = z.object({ schemaVersion: z.literal(1), identity, friendCode: text(128).min(1) }).strict();
const encrypted = z.object({ v: z.literal(1), kdf: z.literal('PBKDF2-SHA256'), iterations: z.number().int().min(100_000).max(2_000_000), salt: text(128), iv: text(128), ciphertext: text(8192), publicIdentity: identity }).strict();
const localSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.object({ displayName: text(32).min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(),
  house: houseSchema.nullable(), friendCode: text(128).min(1),
  contacts: z.array(contact).max(100), encryptedIdentity: encrypted.nullable(),
  editor: text(1_048_576),
  projectLinks: z.record(z.string().max(80), z.object({ name: text(256), kind: z.enum(['text', 'image', 'pdf']), privatePath: text(4096).optional() }).strict()).refine(v => Object.keys(v).length <= 32),
}).strict();

export interface LocalData {
  schemaVersion: 1;
  profile: { displayName: string; color: string };
  house: PublicHouse | null;
  friendCode: string;
  contacts: Contact[];
  encryptedIdentity: EncryptedIdentity | null;
  editor: string;
  projectLinks: Record<string, { name: string; kind: 'text' | 'image' | 'pdf'; privatePath?: string }>;
}

/** Local data is deliberately unrelated to NetworkView: no remote cache can be serialized. */
export function parseLocalData(value: unknown): LocalData { return localSchema.parse(value); }
export function serializeLocalData(value: LocalData): string {
  const result = JSON.stringify(parseLocalData(value));
  if (new TextEncoder().encode(result).length > 2_097_152) throw new Error('Almacenamiento local lleno (límite de 2 MiB).');
  return result;
}
export function newLocalData(): LocalData {
  return { schemaVersion: 1, profile: { displayName: 'Explorador', color: '#df8a72' }, house: null, friendCode: crypto.randomUUID(), contacts: [], encryptedIdentity: null, editor: '// Tu proyecto empieza aquí. Este texto se queda en tu equipo.\n\nfunction saludar(nombre: string) {\n  return `Hola, ${nombre} 🌱`;\n}\n', projectLinks: {} };
}

export interface LocalStore { kind: 'sqlite' | 'indexeddb' | 'memory'; load(): Promise<LocalData | null>; save(data: LocalData): Promise<void>; close(): void }

/** Use an explicit projection even when callers pass extended local objects. */
export function publicHouse(house: PublicHouse, ownerId = house.ownerId): PublicHouse {
  return houseSchema.parse({ ownerId, revision: house.revision, name: house.name, access: house.access, theme: house.theme,
    furniture: house.furniture.map(f => ({ id: f.id, kind: f.kind, x: f.x, y: f.y, publicAlias: f.publicAlias })) });
}

export function isNative(): boolean { return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window; }

export async function openLocalStore(): Promise<LocalStore> {
  if (isNative()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return {
      kind: 'sqlite',
      async load() { const raw = await invoke<string | null>('load_local'); return raw === null ? null : parseLocalData(JSON.parse(raw)); },
      async save(data) { await invoke('save_local', { json: serializeLocalData(data) }); }, close() {},
    };
  }
  if (typeof indexedDB === 'undefined') throw new Error('Este entorno no ofrece almacenamiento local.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('studyvillage-local', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('own-data')) request.result.createObjectStore('own-data'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento local. No se ha borrado nada.'));
    request.onblocked = () => reject(new Error('Cierra otras ventanas de StudyVillage para actualizar el almacenamiento.'));
  });
  db.onversionchange = () => db.close();
  return {
    kind: 'indexeddb',
    async load() {
      try {
        if (typeof localStorage !== 'undefined') {
          const syncRaw = localStorage.getItem('studyvillage-local-sync');
          if (syncRaw) return parseLocalData(JSON.parse(syncRaw));
        }
      } catch { /* Fall back to IndexedDB */ }
      return new Promise((resolve, reject) => {
        const tx = db.transaction('own-data', 'readonly');
        const request = tx.objectStore('own-data').get('state');
        request.onsuccess = () => { try { resolve(request.result === undefined ? null : parseLocalData(JSON.parse(request.result as string))); } catch { reject(new Error('Datos locales incompatibles o dañados. Conservamos la copia original; no se sobrescribirá.')); } };
        request.onerror = () => reject(new Error('No se pudo leer el almacenamiento local.'));
      });
    },
    async save(data) {
      const json = serializeLocalData(data);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('studyvillage-local-sync', json);
        }
      } catch { /* Ignore quota errors in sync mirror */ }
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('own-data', 'readwrite');
        tx.objectStore('own-data').put(json, 'state');
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(new Error('No se pudo guardar. Comprueba el espacio disponible; tu copia anterior se conserva.'));
      });
    },
    close() { db.close(); },
  };
}

/** Latest-state write coalescing: at most one in flight and one pending snapshot. */
export class SaveQueue {
  private pending: LocalData | null = null;
  private active: Promise<void> | null = null;
  constructor(private store: LocalStore, private onError: (error: unknown) => void) {}
  save(data: LocalData): Promise<void> {
    this.pending = parseLocalData(data);
    if (this.store.kind === 'indexeddb' && typeof localStorage !== 'undefined') {
      try { localStorage.setItem('studyvillage-local-sync', serializeLocalData(this.pending)); } catch {}
    }
    if (!this.active) this.active = this.drain().finally(() => {
      this.active = null;
      if (this.pending) void this.save(this.pending);
    });
    return this.active;
  }
  private async drain() {
    while (this.pending) {
      const data = this.pending; this.pending = null;
      try { await this.store.save(data); } catch (error) { this.onError(error); }
    }
  }
  async flush() { while (this.active) await this.active; }
}
