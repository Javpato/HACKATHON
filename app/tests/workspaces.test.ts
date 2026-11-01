import { describe, it, expect } from 'vitest';
import { WorkspaceCoordinator, LocalWorkspaces, floorsSchema, accessListSchema, hasHouseAccess, makeWorkspace, scopedBoard, parseScopedBoard, type HouseSpace } from '../src/house/workspaces';
import type { PublicHouse, Member } from '../src/protocol/types';
import { publicHouse, parseLocalData, newLocalData } from '../src/storage/local-store';
import { stepPosition } from '../src/world/model';
const owner='a'.repeat(64),guest='b'.repeat(64),corridor={floorId:'ground',roomId:null},room={floorId:'ground',roomId:'math'};
function setup(){
 const house:PublicHouse={ownerId:owner,revision:1,name:'Home',access:'open',theme:'mint',furniture:[],floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math'},{id:'code',name:'Code'}]}]};
 const members=new Map<string,Member>([owner,guest].map((id,i)=>[id,{identity:{fingerprint:id,publicKey:'',displayName:id,color:'#123456'},endpoint:id,slot:i,connected:true,houseId:owner,position:{x:384,y:344,direction:'up',moving:false}}]));
 const storage=new LocalWorkspaces(owner),hub=new WorkspaceCoordinator(id=>members.get(id),()=>house,storage,(id,space)=>{members.get(id)!.position={...members.get(id)!.position,space:space??undefined};});
 const enter=(id:string,space:HouseSpace|null)=>hub.apply(id,{action:'enter',owner,space});
 const approve=()=>hub.apply(owner,{action:'decide',request:hub.view(owner).requests[0].id,accept:true});
 return{hub,members,house,storage,enter,approve};
}
describe('private floor and room workspaces',()=>{
 it('allows thirty rooms across three floors and rejects extra floors, rooms and duplicate ids',()=>{
  const floors=Array.from({length:3},(_,i)=>({id:`floor${i}`,name:'Floor',rooms:Array.from({length:10},(_,j)=>({id:`room${j}`,name:'Room'}))}));
  expect(floorsSchema.parse(floors)).toHaveLength(3);expect(floorsSchema.safeParse([...floors,{...floors[0],id:'extra'}]).success).toBe(false);
  expect(floorsSchema.safeParse([{...floors[0],rooms:[...floors[0].rooms,{id:'extra',name:'Room'}]}]).success).toBe(false);
 });
 it('requires separate floor and room approval, repeats room approval on return, and revokes the floor on leaving',()=>{
  const{hub,enter,approve}=setup();expect(()=>enter(guest,room)).toThrow();
  enter(guest,corridor);expect(hub.view(guest).space).toBeNull();approve();expect(hub.view(guest).space).toEqual(corridor);
  enter(guest,room);expect(hub.view(guest).space).toEqual(corridor);approve();expect(hub.view(guest).space).toEqual(room);
  enter(guest,corridor);enter(guest,room);expect(hub.view(owner).requests).toHaveLength(1);approve();
  enter(guest,null);enter(guest,corridor);expect(hub.view(guest).space).toBeNull();expect(hub.view(owner).requests).toHaveLength(1);
 });
 it('keeps content and board references independent, rejects stale writes and visitor decoration',()=>{
  const{hub,enter,approve}=setup();enter(owner,room);const document=hub.view(owner).document!;
  hub.apply(owner,{action:'commit',base:0,document:{...document,notes:[{id:'note',title:'Math',text:'Private room content'}]}});
  expect(hub.view(guest).document).toBeNull();expect(hub.canRead(guest,owner,room)).toBe(false);
  expect(()=>hub.apply(owner,{action:'commit',base:0,document})).toThrow();
  enter(guest,corridor);approve();enter(guest,room);approve();expect(hub.view(guest).document?.notes[0].text).toBe('Private room content');
  expect(()=>hub.apply(guest,{action:'commit',base:1,document:{...hub.view(guest).document!,furniture:[]}})).toThrow();
  enter(owner,{floorId:'ground',roomId:'code'});expect(hub.view(owner).document?.notes).toEqual([]);
  const ref=scopedBoard(owner,room,'board');expect(parseScopedBoard(ref)).toEqual({owner,space:room,furniture:'board'});
 });
 it('invalidates requests when the visitor leaves or the owner disconnects and relocates deleted rooms',()=>{
  const{hub,members,house,enter,approve}=setup();enter(guest,corridor);members.get(owner)!.connected=false;hub.reconcile([owner,guest]);expect(hub.view(owner).requests).toEqual([]);
  members.get(owner)!.connected=true;enter(guest,corridor);approve();enter(guest,room);approve();house.floors![0].rooms=[];hub.reconcile([owner,guest]);expect(hub.view(guest).space).toEqual(corridor);expect(hub.view(guest).document).toBeNull();
 });
 it('preserves the authorized interior scope during movement',()=>{
  const position=stepPosition({x:384,y:344,direction:'up',moving:false,space:room},{x:1,y:0},.02,[]);
  expect(position.space).toEqual(room);
 });
 it('persists trusted identities and rejects malformed, duplicate or oversized lists',()=>{
  const{house}=setup();house.allowlist=[guest];house.floors![0].rooms[0].allowlist=[guest];
  const copy=publicHouse(house);expect(copy.allowlist).toEqual([guest]);
  expect(parseLocalData({...newLocalData(),house:copy}).house?.floors?.[0].rooms[0].allowlist).toEqual([guest]);
  expect(accessListSchema.safeParse([guest,guest]).success).toBe(false);
  expect(accessListSchema.safeParse(['name']).success).toBe(false);
  expect(accessListSchema.safeParse(Array.from({length:25},(_,i)=>i.toString(16).padStart(64,'0'))).success).toBe(false);
 });
 it('lets a room friend enter through the house and floor while the owner is offline, without opening other rooms',()=>{
  const{house,hub,members,enter}=setup();house.access='locked';house.floors![0].rooms[0].allowlist=[guest];members.get(owner)!.connected=false;
  expect(hasHouseAccess(house,guest)).toBe(true);expect(hasHouseAccess(house,'c'.repeat(64))).toBe(false);
  enter(guest,corridor);expect(hub.view(guest).space).toEqual(corridor);
  enter(guest,room);expect(hub.view(guest).document).not.toBeNull();expect(hub.view(owner).requests).toEqual([]);
  expect(()=>enter(guest,{floorId:'ground',roomId:'code'})).toThrow();expect(hub.view(guest).space).toEqual(room);
  enter(guest,null);enter(guest,room);expect(hub.view(guest).space).toEqual(room);
 });
 it('revokes automatic room reads immediately and returns guests to the lobby, without revoking manual approvals',()=>{
  const{house,hub,enter,approve}=setup();house.allowlist=[guest];house.floors![0].rooms[0].allowlist=[guest];enter(guest,room);
  house.floors![0].rooms[0].allowlist=[];expect(hub.canRead(guest,owner,room)).toBe(false);expect(hub.view(guest).document).toBeNull();
  hub.reconcile([owner,guest]);expect(hub.view(guest).space).toBeNull();
  enter(guest,corridor);approve();enter(guest,room);approve();hub.reconcile([owner,guest]);expect(hub.canRead(guest,owner,room)).toBe(true);
 });
 it('does not treat a house whitelist as permission for private floors or rooms',()=>{
  const{house,hub,members,enter}=setup();house.allowlist=[guest];members.get(owner)!.connected=false;
  expect(hasHouseAccess(house,guest)).toBe(true);expect(()=>enter(guest,corridor)).toThrow();expect(()=>enter(guest,room)).toThrow();expect(hub.view(guest).document).toBeNull();
 });

});

it('persists moved doors, uses their new interaction points and removes deleted links',async()=>{
 const{spacePortals,nearestSpacePortal,pruneDoorPositions}=await import('../src/house/space-draw');
 const{house}=setup();house.doorPositions={'lobby>ground:-':{x:600,y:320},'ground:->ground:math':{x:240,y:200}};
 expect(spacePortals(publicHouse(house))[0]).toMatchObject({x:600,y:320});
 expect(nearestSpacePortal(house,{x:600,y:320,direction:'up',moving:false})?.target).toEqual(corridor);
 expect(nearestSpacePortal(house,{x:690,y:352,direction:'up',moving:false})).toBeNull();
 expect(spacePortals(house,corridor)[0]).toMatchObject({x:240,y:200,target:room});
 house.floors![0].rooms=[];expect(pruneDoorPositions(house).doorPositions).toEqual({'lobby>ground:-':{x:600,y:320}});
});

it('clears waiting notices after approval, cancellation, owner disconnect and deleted targets',()=>{
 const{hub,enter,approve,members,house}=setup();
 enter(guest,corridor);expect(hub.view(guest).notice).not.toBeNull();approve();expect(hub.view(guest).notice).toBeNull();expect(hub.view(owner).requests).toEqual([]);
 enter(guest,room);enter(guest,corridor);hub.reconcile([owner,guest]);expect(hub.view(guest).notice).toBeNull();
 enter(guest,room);hub.disconnect(owner);expect(hub.view(guest).notice).toBeNull();expect(hub.view(owner).requests).toEqual([]);
 enter(guest,room);members.get(owner)!.connected=false;hub.reconcile([owner,guest]);expect(hub.view(guest).notice).toBeNull();
 members.get(owner)!.connected=true;enter(guest,room);house.floors![0].rooms=[];hub.reconcile([owner,guest]);expect(hub.view(guest).notice).toBeNull();
});
