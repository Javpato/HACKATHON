import { z } from 'zod';
import { t, defaultText } from '../i18n';
import type { Furniture, Position, PublicHouse, PublicIdentity } from '../protocol/types';

const key = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
const person = z.string().regex(/^[a-f0-9]{64}$/);
export const accessListSchema = z.array(person).max(24).refine(ids => new Set(ids).size === ids.length);
export const doorPositionsSchema=z.record(z.string().max(140).regex(/^(lobby|[A-Za-z0-9_-]{1,32}:(?:-|[A-Za-z0-9_-]{1,32}))>[A-Za-z0-9_-]{1,32}:(?:-|[A-Za-z0-9_-]{1,32})$/),z.strictObject({x:z.number().min(64).max(704),y:z.number().min(128).max(368)})).refine(positions=>Object.keys(positions).length<=40);
export const houseSpaceSchema = z.strictObject({ floorId: key, roomId: key.nullable() });
export type HouseSpace = z.infer<typeof houseSpaceSchema>;
export const floorsSchema = z.array(z.strictObject({ id: key, name: z.string().trim().min(1).max(48), rooms: z.array(z.strictObject({ id: key, name: z.string().trim().min(1).max(48), allowlist: accessListSchema.optional() })).max(10).refine(rooms => new Set(rooms.map(r => r.id)).size === rooms.length) })).min(1).max(3).refine(floors => new Set(floors.map(f => f.id)).size === floors.length);
export type HouseFloor = z.infer<typeof floorsSchema>[number];
const furniture = z.strictObject({ sprite:z.string().max(32000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(), color:z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), kind: z.enum(['desk','bookshelf','board','plant','table','frame','cabinet','flashcards']), x: z.number().min(0).max(736), y: z.number().min(0).max(400), publicAlias: z.string().max(48), rotation: z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]).optional() });
export const workspaceSchema = z.strictObject({
  revision: z.number().int().nonnegative(), theme:z.enum(['mint','peach']).optional(), furniture: z.array(furniture).max(32).refine(items => new Set(items.map(f => f.id)).size === items.length),
  notes: z.array(z.strictObject({ id:key, title:z.string().max(80), text:z.string().max(8000) })).max(16),
  materials: z.array(z.strictObject({ id:key, title:z.string().max(80), text:z.string().max(8000) })).max(16),
  projects: z.array(z.strictObject({ id:key, name:z.string().max(80), url:z.string().max(600), description:z.string().max(4000), tasks:z.array(z.strictObject({ id:key, text:z.string().max(280), done:z.boolean() })).max(40) })).max(16),
}).refine(doc => new TextEncoder().encode(JSON.stringify(doc)).length <= 40000);
export type WorkspaceDocument = z.infer<typeof workspaceSchema>;
export const spaceRequestSchema = z.strictObject({ id: key, visitor: person, owner: person, space: houseSpaceSchema, from: z.string().max(100) });
export type SpaceRequest = z.infer<typeof spaceRequestSchema>;
export const workspaceCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action:z.literal('enter'), owner:person, space:houseSpaceSchema.nullable(), seed:workspaceSchema.optional() }),
  z.strictObject({ action:z.literal('decide'), request:key, accept:z.boolean() }),
  z.strictObject({ action:z.literal('commit'), base:z.number().int().nonnegative(), document:workspaceSchema }),
]);
export type WorkspaceCommand = z.infer<typeof workspaceCommandSchema>;
export const workspaceViewSchema = z.strictObject({ houseId:person.nullable(), space:houseSpaceSchema.nullable(), document:workspaceSchema.nullable(), requests:z.array(spaceRequestSchema).max(24), notice:z.string().max(240).nullable() });
export type WorkspaceView = z.infer<typeof workspaceViewSchema>;
export const emptyWorkspace = (): WorkspaceView => ({ houseId:null, space:null, document:null, requests:[], notice:null });
export const spaceKey = (space?: HouseSpace | null): string => space ? `${space.floorId}:${space.roomId ?? '-'}` : 'lobby';
export const sameSpace = (a?: HouseSpace | null, b?: HouseSpace | null): boolean => spaceKey(a) === spaceKey(b);
export const spaceStorageKey = (owner: string, space: HouseSpace): string => `${owner}/${space.floorId}/${space.roomId}`;
export const floorsOf = (house: PublicHouse): HouseFloor[] => house.floors ?? [{ id:'ground', name:'Planta baja', rooms:[] }];
/** A room invitation includes transit through its house and floor, never other rooms. */
export const hasRoomAccess = (house:PublicHouse, space:HouseSpace, who:string):boolean => !!floorsOf(house).find(f=>f.id===space.floorId)?.rooms.find(r=>r.id===space.roomId)?.allowlist?.includes(who);
export const hasFloorAccess = (house:PublicHouse, floor:string, who:string):boolean => !!floorsOf(house).find(f=>f.id===floor)?.rooms.some(r=>r.allowlist?.includes(who));
export const hasHouseAccess = (house:PublicHouse, who:string):boolean => !!house.allowlist?.includes(who)||floorsOf(house).some(f=>hasFloorAccess(house,f.id,who));
export function spaceExists(house: PublicHouse, space: HouseSpace | null): boolean {
  if (!space) return true;
  const floor = floorsOf(house).find(f => f.id === space.floorId);
  return !!floor && (space.roomId === null || floor.rooms.some(r => r.id === space.roomId));
}
export function workspaceTitle(house: PublicHouse, space?: HouseSpace | null): string {
  if (!space) return t('Vestíbulo');
  const floor = floorsOf(house).find(f => f.id === space.floorId);
  return space.roomId ? defaultText(floor?.rooms.find(r => r.id === space.roomId)?.name ?? t('Habitación')) : defaultText(floor?.name ?? t('Planta'));
}
export function makeWorkspace(): WorkspaceDocument {
  const furniture: Furniture[] = [
    { id:'board',kind:'board',x:340,y:95,publicAlias:'' }, { id:'desk',kind:'desk',x:130,y:150,publicAlias:'' },
    { id:'bookshelf',kind:'bookshelf',x:55,y:100,publicAlias:'' }, { id:'table',kind:'table',x:430,y:240,publicAlias:'' },
  ];
  return { revision:0, theme:'mint', furniture:furniture.map(f=>({...f,color:'#9f7847'})), notes:[], materials:[], projects:[] };
}
export function scopedBoard(owner: string, space: HouseSpace, furniture: string): string { return `house:${owner}:space:${space.floorId}:${space.roomId}:${furniture}`; }
export function parseScopedBoard(ref: string): {owner:string;space:HouseSpace;furniture:string} | null {
  const match = /^house:([a-f0-9]{64}):space:([A-Za-z0-9_-]{1,32}):([A-Za-z0-9_-]{1,32}):([A-Za-z0-9_-]{1,80})$/.exec(ref);
  return match ? { owner:match[1], space:{floorId:match[2],roomId:match[3]}, furniture:match[4] } : null;
}
export interface WorkspaceStorage { get(owner:string, space:HouseSpace):WorkspaceDocument|null; put(owner:string,space:HouseSpace,document:WorkspaceDocument):void; remove?(owner:string,space:HouseSpace):void }
export class LocalWorkspaces implements WorkspaceStorage {
  private readonly key = 'studyvillage-workspaces-v1';
  private memory: Record<string,WorkspaceDocument> = {};
  constructor(private own: string) {}
  private all(): Record<string,WorkspaceDocument> {
    if (typeof localStorage === 'undefined') return this.memory;
    const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : {};
  }
  private scope(owner:string,space:HouseSpace):string { return spaceStorageKey(owner === this.own ? 'own' : owner, space); }
  get(owner:string,space:HouseSpace):WorkspaceDocument|null { const raw=this.all()[this.scope(owner,space)];return raw ? workspaceSchema.parse(raw) : null; }
  put(owner:string,space:HouseSpace,document:WorkspaceDocument):void {
    const all={...this.all(),[this.scope(owner,space)]:workspaceSchema.parse(document)};
    if(typeof localStorage!=='undefined')localStorage.setItem(this.key,JSON.stringify(all)); this.memory=all;
  }
  remove(owner:string,space:HouseSpace):void {const all={...this.all()};delete all[this.scope(owner,space)];if(typeof localStorage!=='undefined')localStorage.setItem(this.key,JSON.stringify(all));this.memory=all;}
}
export interface WorkspacePerson { identity:PublicIdentity; connected:boolean; houseId:string|null; position:Position }
/** Shared authorization rules for the peer host and durable server. */
export class WorkspaceCoordinator {
  private layouts = new Map<string,PublicHouse>();
  private requests = new Map<string,SpaceRequest>();
  private floors = new Map<string,{owner:string;floor:string;automatic:boolean}>();
  private automaticRooms = new Map<string,{owner:string;space:HouseSpace}>();
  private notices = new Map<string,string>();
  constructor(private person:(id:string)=>WorkspacePerson|undefined, private house:(owner:string)=>PublicHouse|undefined, readonly storage:WorkspaceStorage, private moved:(id:string,space:HouseSpace|null)=>void) {}
  private document(owner:string,space:HouseSpace,seed?:WorkspaceDocument):WorkspaceDocument {
    let doc=this.storage.get(owner,space);
    if(!doc){doc=seed??makeWorkspace();this.storage.put(owner,space,doc);}return doc;
  }
  view(who:string):WorkspaceView {
    const member=this.person(who), space=member?.position.space??null, owner=member?.houseId;
    const valid=owner&&this.house(owner)&&spaceExists(this.house(owner)!,space);
    return {houseId:owner??null,space:valid?space:null,document:valid&&space?.roomId&&this.canRead(who,owner!,space)?this.document(owner!,space):null,requests:[...this.requests.values()].filter(r=>r.owner===who),notice:this.notices.get(who)??null};
  }
  canRead(who:string,owner:string,space:HouseSpace):boolean {
    const member=this.person(who),house=this.house(owner);
    return !!member?.connected&&member.houseId===owner&&sameSpace(member.position.space,space)&&!!house&&spaceExists(house,space)&&(!this.automaticRooms.has(who)||hasRoomAccess(house,space,who));
  }
  private move(who:string,owner:string,space:HouseSpace|null,seed?:WorkspaceDocument,automatic=false):void {
    this.automaticRooms.delete(who);
    if(automatic&&space?.roomId)this.automaticRooms.set(who,{owner,space});
    const old=this.person(who)?.position.space;
    if(!space||old?.floorId!==space.floorId)this.floors.delete(who);
    if(space){
      const previous=this.floors.get(who);
      // Automatic access must never turn into a lasting manual floor approval.
      const manual=previous?.owner===owner&&previous.floor===space.floorId&&!previous.automatic;
      this.floors.set(who,{owner,floor:space.floorId,automatic:automatic&&!manual});
    }
    if(space?.roomId)this.document(owner,space,seed);
    this.moved(who,space);this.notices.delete(who);
  }
  apply(who:string,raw:WorkspaceCommand):void {
    const command=workspaceCommandSchema.parse(raw),member=this.person(who);
    if(!member?.connected)throw new Error(t('La sesión ya no está disponible.'));
    if(command.action==='enter'){
      const house=this.house(command.owner);
      if(member.houseId!==command.owner||!house||!spaceExists(house,command.space))throw new Error(t('Ese espacio ya no está disponible.'));
      const target=command.space,current=member.position.space;
      for(const [id,request]of this.requests)if(request.visitor===who){this.requests.delete(id);this.notices.delete(who);}
      if(sameSpace(current,target))return;
      if(!target){this.move(who,command.owner,null);return;}
      const owner=who===command.owner,grant=this.floors.get(who);
      const manualFloor=grant?.owner===command.owner&&grant.floor===target.floorId&&!grant.automatic;
      const roomAutomatic=!!target.roomId&&hasRoomAccess(house,target,who);
      const floorAutomatic=hasFloorAccess(house,target.floorId,who);
      const floorAllowed=owner||manualFloor||floorAutomatic;
      if(!owner&&(roomAutomatic||!target.roomId&&floorAutomatic)){this.move(who,command.owner,target,undefined,true);return;}
      if(target.roomId&&!floorAllowed)throw new Error(t('Pide permiso para entrar primero a la planta.'));
      if(owner||!target.roomId&&floorAllowed){this.move(who,command.owner,target,owner?command.seed:undefined,!owner&&!manualFloor);return;}
      if(!this.person(command.owner)?.connected)throw new Error(t('El propietario debe estar conectado para dar permiso.'));
      const id=crypto.randomUUID().slice(0,8);this.requests.set(id,{id,visitor:who,owner:command.owner,space:target,from:spaceKey(current)});this.notices.set(who,t('Esperando permiso para entrar.'));return;
    }
    if(command.action==='decide'){
      const request=this.requests.get(command.request);
      if(!request||request.owner!==who)throw new Error(t('La solicitud ya no está disponible.'));
      this.requests.delete(request.id);this.notices.delete(request.visitor);
      const visitor=this.person(request.visitor),house=this.house(who),grant=this.floors.get(request.visitor);
      if(!visitor?.connected||visitor.houseId!==who||spaceKey(visitor.position.space)!==request.from||!house||!spaceExists(house,request.space))return;
      if(request.space.roomId&&!(grant?.owner===who&&(grant.floor===request.space.floorId)&&(!grant.automatic||hasFloorAccess(house,grant.floor,request.visitor))))return;
      if(command.accept)this.move(request.visitor,who,request.space);else this.notices.set(request.visitor,t('No se concedió permiso para entrar.'));return;
    }
    const space=member.position.space,owner=member.houseId;
    if(!owner||!space?.roomId||!this.canRead(who,owner,space))throw new Error(t('No tienes acceso a esta habitación.'));
    const old=this.document(owner,space);
    if(old.revision!==command.base)throw new Error(t('El espacio cambió. Revisa la versión actual antes de guardar.'));
    if(who!==owner&&JSON.stringify(old.furniture)!==JSON.stringify(command.document.furniture))throw new Error(t('Solo el propietario puede decorar esta habitación.'));
    const next={...command.document,revision:old.revision+1};workspaceSchema.parse(next);this.storage.put(owner,space,next);
  }
  reconcile(people:string[]):void {
    const owners=new Set([...people,...this.layouts.keys(),...people.flatMap(id=>this.person(id)?.houseId?[this.person(id)!.houseId!]:[])]);
    for(const owner of owners){const next=this.house(owner),previous=this.layouts.get(owner);if(previous&&next)for(const floor of floorsOf(previous))for(const room of floor.rooms){const space={floorId:floor.id,roomId:room.id};if(!spaceExists(next,space))this.storage.remove?.(owner,space);}if(next)this.layouts.set(owner,structuredClone(next));}

    for(const who of people){
      const member=this.person(who),owner=member?.houseId,space=member?.position.space,grant=this.floors.get(who);
      if(!member?.connected||!owner||!space||grant?.owner!==owner||grant.floor!==space.floorId)this.floors.delete(who);
      const autoRoom=this.automaticRooms.get(who);
      if(!member?.connected||!owner||!space||autoRoom?.owner!==owner||!sameSpace(autoRoom.space,space))this.automaticRooms.delete(who);
      if(owner&&space){const house=this.house(owner);
        const revokedRoom=this.automaticRooms.has(who)&&(!house||!hasRoomAccess(house,space,who));
        const revokedFloor=grant?.automatic&&(!house||!hasFloorAccess(house,space.floorId,who));
        if(revokedRoom||revokedFloor){
          const parent={floorId:space.floorId,roomId:null};
          const allowed=house&&spaceExists(house,parent)&&(!grant?.automatic||hasFloorAccess(house,space.floorId,who));
          this.move(who,owner,allowed?parent:null,undefined,!!grant?.automatic);continue;
        }
        if(!house||!spaceExists(house,space)){
          const parent={floorId:space.floorId,roomId:null};
          this.move(who,owner,house&&spaceExists(house,parent)&&this.floors.has(who)?parent:null);
        }
      }
    }
    for(const [id,r]of this.requests){const p=this.person(r.visitor);if(!p?.connected||p.houseId!==r.owner||spaceKey(p.position.space)!==r.from||!this.person(r.owner)?.connected||!this.house(r.owner)||!spaceExists(this.house(r.owner)!,r.space)){this.requests.delete(id);this.notices.delete(r.visitor);}}
  }
  disconnect(who:string):void {this.automaticRooms.delete(who);this.floors.delete(who);this.notices.delete(who);for(const[id,r]of this.requests)if(r.visitor===who||r.owner===who){this.requests.delete(id);this.notices.delete(r.visitor);}}
}
