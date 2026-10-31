import { HEADWEAR, EYEWEAR, OUTFITS, JACKETS, normalizeAppearance, type AvatarAppearance } from '../assets/appearance';
import { getAvatarCustomization, HAIR_STYLE_LABELS, SKIN_TONES } from '../assets/custom-assets';
import { getAvatarSheet } from '../assets/avatar-sheet';
import type { Position, PublicIdentity } from '../protocol/types';
import { drawAvatar } from './art';

type Category = 'headwear'|'eyewear'|'outfit'|'jacket'|'appearance';
const COLORS=['#d8b04e','#a77b50','#e18b78','#416c46','#416f8c','#3d4053','#f2e7cd','#773f57','#2a292b','#af6049'];
function node<K extends keyof HTMLElementTagNameMap>(tag:K, cls='', text=''):HTMLElementTagNameMap[K]{const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;}
function button(text:string,run:()=>void):HTMLButtonElement{const b=node('button','sv-wardrobe-button',text);b.type='button';b.onclick=run;return b;}

export class WardrobePanel {
  readonly root=node('dialog','sv-wardrobe');
  private draft:AvatarAppearance=getAvatarCustomization();
  private identity!:PublicIdentity;
  private category:Category='headwear';
  private direction=0;
  private openColors=new Set<string>();
  private busy=false;
  private preview=node('canvas','sv-wardrobe-preview');
  private catalog=node('div','sv-wardrobe-catalog');
  private tabs=node('div','sv-wardrobe-tabs');
  private error=node('p','sv-wardrobe-error');
  private save:HTMLButtonElement;
  private discard:HTMLButtonElement;
  constructor(private readonly ctx:{save(look:AvatarAppearance):Promise<void>;closed():void}){
    this.root.setAttribute('aria-labelledby','sv-wardrobe-title');
    const head=node('header','sv-wardrobe-head');const title=node('h2','','Mi armario');title.id='sv-wardrobe-title';
    const close=button('×',()=>this.close());close.setAttribute('aria-label','Cerrar armario');head.append(title,close);
    const body=node('div','sv-wardrobe-body');const mirror=node('section','sv-wardrobe-mirror');mirror.setAttribute('aria-label','Vista previa de tu personaje');
    this.preview.width=480;this.preview.height=540;this.preview.setAttribute('aria-label','Vista previa del look');
    const turn=node('div','sv-wardrobe-turn');turn.append(button('↶',()=>this.rotate(-1)),node('span','','Girar'),button('↷',()=>this.rotate(1)));
    turn.querySelectorAll('button')[0].setAttribute('aria-label','Girar personaje a la izquierda');turn.querySelectorAll('button')[1].setAttribute('aria-label','Girar personaje a la derecha');
    mirror.append(this.preview,turn,node('p','sv-wardrobe-hint','Prueba lo que quieras. Guarda cuando te guste.'));
    const wardrobe=node('section','sv-wardrobe-options');this.tabs.setAttribute('aria-label','Categorías de ropa');wardrobe.append(this.tabs,this.catalog);body.append(mirror,wardrobe);
    const foot=node('footer','sv-wardrobe-foot');this.error.setAttribute('role','alert');this.error.hidden=true;
    this.discard=button('Descartar',()=>this.close());this.save=button('Guardar look',()=>{void this.commit();});this.save.classList.add('is-primary');foot.append(this.error,this.discard,this.save);this.root.append(head,body,foot);
    this.root.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    this.root.addEventListener('close',()=>this.ctx.closed());
  }
  open(identity:PublicIdentity):void{this.identity=identity;this.draft=getAvatarCustomization();this.direction=0;this.category='headwear';this.openColors.clear();this.error.hidden=true;this.render();if(!this.root.open)this.root.showModal();}
  isOpen():boolean{return this.root.open;}
  close():void{if(!this.busy)this.root.close();}
  dispose():void{this.root.close();this.root.remove();}
  private rotate(delta:number):void{this.direction=(this.direction+delta+4)%4;this.paint();}
  private change(patch:Partial<AvatarAppearance>):void{if(this.busy)return;this.draft=normalizeAppearance({...this.draft,...patch,useCustomSheet:patch.useCustomSheet??false});this.render();}
  private draw(canvas:HTMLCanvasElement,look:AvatarAppearance,large=false):void{
    const c=canvas.getContext('2d');if(!c)return;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);c.scale(2,2);c.imageSmoothingEnabled=false;
    const w=canvas.width/2,h=canvas.height/2;c.fillStyle=large?'#e6d4b3':'#f5e7cb';c.fillRect(0,0,w,h);
    if(large){c.fillStyle='#d0b58c';c.fillRect(12,h-60,w-24,2);c.fillStyle='#d7bd96';c.beginPath();c.ellipse(w/2,h-53,64,13,0,0,Math.PI*2);c.fill();}
    c.translate(w/2,large?h-82:68);c.scale(large?4:1.45,large?4:1.45);
    const directions:Position['direction'][]=['down','left','up','right'];
    drawAvatar(c,0,0,this.identity,{x:0,y:0,direction:directions[large?this.direction:0],moving:false},false,{appearance:look,preview:true});
  }
  private paint():void{this.draw(this.preview,this.draft,true);}
  private render():void{
    this.paint();this.tabs.replaceChildren();this.catalog.replaceChildren();
    for(const [key,label] of [['headwear','Sombreros'],['eyewear','Lentes'],['outfit','Ropa'],['jacket','Sacos'],['appearance','Aspecto']] as const){const b=button(label,()=>{this.category=key;this.render();});b.setAttribute('aria-pressed',String(this.category===key));this.tabs.append(b);}
    if(this.category==='appearance'){this.appearanceControls();return;}
    const category=this.category;const options=category==='headwear'?HEADWEAR:category==='eyewear'?EYEWEAR:category==='outfit'?OUTFITS:JACKETS;
    const grid=node('div','sv-wardrobe-grid');
    for(const [value,label] of Object.entries(options)){
      const patch={...this.draft,[category]:value,useCustomSheet:false};
      const b=button('',()=>this.change({[category]:value}));b.classList.add('sv-wardrobe-item');b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(this.draft[category]===value&&(!this.draft.useCustomSheet||!getAvatarSheet())));
      const canvas=node('canvas');canvas.width=176;canvas.height=192;this.draw(canvas,normalizeAppearance(patch));b.append(canvas,node('span','',label));grid.append(b);
    }
    this.catalog.append(grid);
    if(category==='headwear')this.colorControl('Color del sombrero','headwearColor');
    if(category==='outfit'){this.colorControl('Color de la ropa','outfitColor');this.colorControl('Color del pantalón','pantsColor');}
    if(category==='jacket')this.colorControl('Color del saco','jacketColor');
  }
  private colorControl(label:string,key:'headwearColor'|'outfitColor'|'pantsColor'|'jacketColor'|'hairColor'):void{
    const details=node('details','sv-wardrobe-color-details');details.open=this.openColors.has(key);details.append(node('summary','',label));
    details.addEventListener('toggle',()=>{if(details.isConnected){if(details.open)this.openColors.add(key);else this.openColors.delete(key);}});
    const row=node('div','sv-wardrobe-colors');
    for(const color of COLORS){const swatch=button('',()=>this.change({[key]:color}));swatch.classList.add('sv-wardrobe-swatch');swatch.style.background=color;swatch.setAttribute('aria-label',`${label}: ${color}`);swatch.setAttribute('aria-pressed',String((this.draft[key]??this.identity.color)===color));row.append(swatch);}
    const input=node('input');input.type='color';input.value=this.draft[key]??this.identity.color;input.setAttribute('aria-label',label);input.onchange=()=>this.change({[key]:input.value});row.append(input);details.append(row);this.catalog.append(details);
  }
  private appearanceControls():void{
    const hair=node('select');hair.setAttribute('aria-label','Peinado');for(const [value,label]of Object.entries(HAIR_STYLE_LABELS).filter(([v])=>v!=='beanie')){const option=node('option','',label);option.value=value;hair.append(option);}hair.value=this.draft.hairStyle==='beanie'?'short':this.draft.hairStyle;hair.onchange=()=>this.change({hairStyle:hair.value as AvatarAppearance['hairStyle']});
    const label=node('label','','Peinado');label.append(hair);this.catalog.append(label);this.colorControl('Color del pelo','hairColor');
    const skin=node('div','sv-wardrobe-colors');skin.append(node('span','','Tono de piel'));for(const [i,tone]of SKIN_TONES.entries()){const b=button('',()=>this.change({skinTone:tone}));b.classList.add('sv-wardrobe-swatch');b.style.background=tone;b.setAttribute('aria-label',`Tono de piel ${i+1}`);b.setAttribute('aria-pressed',String(this.draft.skinTone===tone));skin.append(b);}this.catalog.append(skin);
    const headphones=node('input');headphones.type='checkbox';headphones.checked=this.draft.accessory==='headphones';headphones.onchange=()=>this.change({accessory:headphones.checked?'headphones':'none'});const audio=node('label','','Auriculares');audio.append(headphones);this.catalog.append(audio);
    if(getAvatarSheet()){const sheet=node('input');sheet.type='checkbox';sheet.checked=this.draft.useCustomSheet;sheet.onchange=()=>this.change({useCustomSheet:sheet.checked});const custom=node('label','','Usar mi hoja personalizada (en este equipo)');custom.append(sheet);this.catalog.append(custom);}
  }
  private async commit():Promise<void>{
    if(this.busy)return;this.busy=true;this.save.disabled=true;this.discard.disabled=true;this.save.textContent='Guardando…';this.error.hidden=true;
    try{await this.ctx.save(normalizeAppearance(this.draft));this.root.close();}
    catch(e){this.error.textContent=e instanceof Error?e.message:'No se pudo guardar el look.';this.error.hidden=false;}
    finally{this.busy=false;this.save.disabled=false;this.discard.disabled=false;this.save.textContent='Guardar look';}
  }
}
