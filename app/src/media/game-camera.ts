import type { GameCameraView } from '../protocol/types';
import { cameraMetadataSchema } from '../protocol/schema';
import type { MediaCall, TransportEndpoint } from '../transport/types';
import type { MediaContext, MediaDevicesAdapter, MediaPeer } from './manager';

export interface CameraPeer extends MediaPeer { watching: boolean }
export interface CameraContext extends Omit<MediaContext, 'peers'> { peers: CameraPeer[] }
interface CallState { call: MediaCall; identityId: string; stream?: MediaStream; off: (() => void)[] }

/** Video only, with its own game audience; voice/screen consent stays independent. */
export class GameCameraManager {
  private endpoint?: TransportEndpoint;
  private context: CameraContext | null = null;
  private local: MediaStream | null = null;
  private pending = false;
  private error: string | null = null;
  private generation = 0;
  private incoming = new Map<string, CallState>();
  private outgoing = new Map<string, CallState>();
  constructor(private readonly changed: () => void, private readonly devices?: MediaDevicesAdapter) {}
  get view(): GameCameraView {
    return { local: this.local, pending: this.pending, error: this.error,
      remote: [...this.incoming.values()].filter(c => c.stream).map(c => ({ identityId: c.identityId, stream: c.stream! })) };
  }
  attach(endpoint: TransportEndpoint): void { this.endpoint = endpoint; }
  setContext(context: CameraContext | null): void {
    const previous = this.context;
    if (previous?.sessionId !== context?.sessionId || previous?.epoch !== context?.epoch || previous?.room !== context?.room) this.stop();
    this.context = context;
    for (const [id, c] of this.incoming) if (!context?.peers.some(p => p.identityId === id && p.endpoint === c.call.endpoint && p.receiveToken === previous?.peers.find(p => p.identityId === id)?.receiveToken)) this.close(this.incoming, id);
    for (const [id, c] of this.outgoing) if (!context?.peers.some(p => p.identityId === id && p.endpoint === c.call.endpoint && p.watching && p.sendToken === previous?.peers.find(p => p.identityId === id)?.sendToken)) this.close(this.outgoing, id);
    this.reconcile();
  }
  async toggle(): Promise<void> {
    if (this.local || this.pending) { this.stopCapture(); this.changed(); return; }
    if (!this.context) { this.error = 'Abre Hombres Lobo o Gartic para activar la cámara.'; this.changed(); return; }
    const devices = this.devices ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);
    if (!devices?.getUserMedia) { this.error = 'La cámara no está disponible en este entorno.'; this.changed(); return; }
    const generation = ++this.generation;
    this.pending = true; this.error = null; this.changed();
    try {
      const stream = await devices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } } });
      if (generation !== this.generation || !this.context) { this.stopTracks(stream); return; }
      if (!stream.getVideoTracks().length || stream.getAudioTracks().length) { this.stopTracks(stream); throw new Error('Invalid camera stream'); }
      this.local = stream;
      for (const track of stream.getVideoTracks()) {
        try { track.contentHint = 'motion'; } catch { /* Optional hint. */ }
        track.addEventListener('ended', () => { if (this.local === stream) { this.stopCapture(); this.changed(); } }, { once: true });
      }
      this.reconcile();
    } catch (e) {
      if (generation === this.generation) this.error = e instanceof DOMException && e.name === 'NotFoundError'
        ? 'No se encontró una cámara conectada.' : 'No se pudo activar la cámara. Revisa el permiso e inténtalo de nuevo.';
    } finally { if (generation === this.generation) this.pending = false; this.changed(); }
  }
  receive(call: MediaCall): void {
    const parsed = cameraMetadataSchema.safeParse(call.metadata); const context = this.context;
    if (!parsed.success || !context) { call.close(); return; }
    const metadata = parsed.data;
    const peer = context.peers.find(p => p.identityId === metadata.identityId && p.endpoint === call.endpoint && p.receiveToken === metadata.token);
    if (!peer || metadata.sessionId !== context.sessionId || metadata.epoch !== context.epoch || metadata.room !== context.room || this.incoming.has(peer.identityId) || this.incoming.size >= 5) { call.close(); return; }
    const item: CallState = { call, identityId: peer.identityId, off: [] };
    this.incoming.set(peer.identityId, item);
    item.off.push(call.onClose(() => { this.close(this.incoming, peer.identityId); this.changed(); }));
    item.off.push(call.onStream(stream => {
      const now = this.context;
      if (this.incoming.get(peer.identityId) !== item || !now || now.room !== metadata.room || now.sessionId !== metadata.sessionId || now.epoch !== metadata.epoch
        || !now.peers.some(p => p.identityId === peer.identityId && p.endpoint === call.endpoint && p.receiveToken === metadata.token)
        || !stream.getVideoTracks().length || stream.getAudioTracks().length) {
        this.stopTracks(stream); this.close(this.incoming, peer.identityId); this.changed(); return;
      }
      item.stream = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (this.incoming.get(peer.identityId) === item) { this.close(this.incoming, peer.identityId); this.changed(); } }, { once: true });
      this.changed();
    }));
    try { call.answer(); } catch { this.close(this.incoming, peer.identityId); }
  }
  private reconcile(): void {
    const context = this.context;
    if (!context || !this.local || !this.endpoint) return;
    for (const peer of context.peers) {
      if (!peer.watching || this.outgoing.has(peer.identityId)) continue;
      try {
        const call = this.endpoint.call(peer.endpoint, this.local, { v: 2, kind: 'camera', sessionId: context.sessionId, epoch: context.epoch, room: context.room, identityId: context.identityId, token: peer.sendToken });
        const item: CallState = { call, identityId: peer.identityId, off: [] }; this.outgoing.set(peer.identityId, item);
        item.off.push(call.onClose(() => { this.close(this.outgoing, peer.identityId); this.changed(); }));
        item.off.push(call.onStream(remote => this.stopTracks(remote)));
        call.limitBitrate('camera');
      } catch { this.error = 'No se pudo conectar la cámara con otra persona.'; }
    }
  }
  private close(map: Map<string, CallState>, id: string): void {
    const item = map.get(id); if (!item) return;
    map.delete(id); for (const off of item.off) off(); if (item.stream) this.stopTracks(item.stream);
    try { item.call.close(); } catch { /* Already closed. */ }
  }
  private stopTracks(stream: MediaStream): void { for (const track of stream.getTracks()) track.stop(); }
  private stopCapture(): void {
    this.generation++; this.pending = false; this.error = null;
    const stream = this.local; this.local = null;
    for (const id of [...this.outgoing.keys()]) this.close(this.outgoing, id);
    if (stream) this.stopTracks(stream);
  }
  stop(): void { this.stopCapture(); for (const id of [...this.incoming.keys()]) this.close(this.incoming, id); }
  suspend(): void { this.stop(); this.context = null; this.changed(); }
  dispose(): void { this.suspend(); this.endpoint = undefined; }
}
