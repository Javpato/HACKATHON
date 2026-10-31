import type { AppView } from '../protocol/types';

interface Tile { root: HTMLElement; video: HTMLVideoElement; name: HTMLElement; quality: HTMLElement; stream: MediaStream }
export class GameCameraDock {
  readonly root = document.createElement('section');
  private button = document.createElement('button');
  private label = document.createElement('span');
  private gallery = document.createElement('div');
  private error = document.createElement('p');
  private tiles = new Map<string, Tile>();
  private container: HTMLElement | null = null;
  constructor(private readonly toggle: () => Promise<void>) {
    this.root.className = 'sv-game-camera'; this.root.setAttribute('aria-label', 'Cámaras del juego');
    const controls = document.createElement('div'); controls.className = 'sv-game-camera-controls';
    this.button.type = 'button'; this.button.className = 'sv-game-camera-toggle';
    // Camera glyph follows the existing 12 px icon grid; the card itself has a quiet rounded frame.
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('width','18'); icon.setAttribute('height','18'); icon.setAttribute('aria-hidden','true');
    const path = document.createElementNS(icon.namespaceURI,'path'); path.setAttribute('d','M8 5.5 9.5 3h5L16 5.5h3A2.5 2.5 0 0 1 21.5 8v10a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18V8A2.5 2.5 0 0 1 5 5.5Z M16 12.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'); path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');icon.append(path);
    this.button.append(icon,this.label);this.button.onclick=()=>{void this.toggle();};
    this.error.className='sv-game-camera-error';this.error.setAttribute('role','status');this.error.hidden=true;
    this.gallery.className='sv-game-camera-gallery';controls.append(this.button);this.root.append(controls,this.error,this.gallery);
  }
  mount(container: HTMLElement): void { this.container=container;container.classList.add('has-game-camera');container.append(this.root); }
  update(view: AppView): void {
    const camera=view.network.gameCamera;
    const on=!!camera.local;
    this.label.textContent=camera.pending?'Abriendo…':on?'Apagar':'Cámara';
    this.button.setAttribute('aria-label',camera.pending?'Cancelar activación de cámara':on?'Apagar cámara':'Activar cámara');
    this.button.setAttribute('aria-pressed',String(on||camera.pending));this.button.classList.toggle('is-on',on);
    this.error.textContent=camera.error;this.error.hidden=!camera.error;
    const streams=new Map<string,{stream:MediaStream;name:string;self:boolean}>();
    if(camera.local)streams.set(view.identity.fingerprint,{stream:camera.local,name:'Tú',self:true});
    for(const remote of camera.remote){const member=view.network.members.find(m=>m.identity.fingerprint===remote.identityId);streams.set(remote.identityId,{stream:remote.stream,name:member?.identity.displayName||'Vecino',self:false});}
    for(const [id,tile] of this.tiles)if(!streams.has(id)){tile.video.srcObject=null;tile.root.remove();this.tiles.delete(id);}
    for(const [id,item] of streams){
      let tile=this.tiles.get(id);
      if(tile&&tile.stream!==item.stream){tile.video.srcObject=null;tile.root.remove();this.tiles.delete(id);tile=undefined;}
      if(!tile){
        const card=document.createElement('div');card.className='sv-game-camera-tile';card.dataset.cameraPeer=id;
        const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.className=item.self?'is-self':'';video.srcObject=item.stream;video.setAttribute('aria-label',item.self?'Tu cámara':`Cámara de ${item.name}`);
        const caption=document.createElement('div');caption.className='sv-game-camera-caption';
        const dot=document.createElement('span');dot.className='sv-game-camera-live';dot.setAttribute('aria-hidden','true');
        const name=document.createElement('span');const quality=document.createElement('span');quality.className='sv-game-camera-quality';
        caption.append(dot,name,quality);card.append(video,caption);this.gallery.append(card);
        const current:Tile={root:card,video,name,quality,stream:item.stream};this.tiles.set(id,current);tile=current;
        const updateQuality=()=>{quality.textContent=video.videoWidth>=1920&&video.videoHeight>=1080?'Full HD':Math.min(video.videoWidth,video.videoHeight)>=720?'HD':'';};
        video.onloadedmetadata=updateQuality;video.addEventListener('resize',updateQuality);
        void video.play().catch(()=>{/* Muted inline video can resume after a browser gesture. */});
      }
      tile.name.textContent=item.name;
    }
    const live=streams.size>0;this.root.classList.toggle('is-live',live);this.container?.classList.toggle('is-camera-live',live);
  }
  unmount(): void {
    for(const tile of this.tiles.values())tile.video.srcObject=null;
    this.tiles.clear();this.gallery.replaceChildren();this.root.remove();this.container?.classList.remove('has-game-camera','is-camera-live');this.container=null;
  }
}
