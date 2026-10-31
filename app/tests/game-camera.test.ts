import { describe, expect, it } from 'vitest';
import { GameCameraManager, type CameraContext } from '../src/media/game-camera';
import type { MediaCall, TransportEndpoint } from '../src/transport/types';
// Fake tracks and calls: these tests never activate a physical camera.
class Track extends EventTarget { stopped=false; enabled=true; contentHint=''; stop(){this.stopped=true;} }
function stream(audio=false) { const track=new Track(); return {track,stream:{getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>audio?[track]:[]} as unknown as MediaStream}; }
class Call implements MediaCall {
  closed=false; answered=false; limited='';streams=new Set<(s:MediaStream)=>void>();closes=new Set<()=>void>();
  constructor(readonly endpoint:string,readonly metadata:unknown){}
  answer(){this.answered=true;} close(){this.closed=true;}
  onStream(fn:(s:MediaStream)=>void){this.streams.add(fn);return()=>this.streams.delete(fn);}
  onClose(fn:()=>void){this.closes.add(fn);return()=>this.closes.delete(fn);}
  limitBitrate(kind:'audio'|'screen'|'camera'){this.limited=kind;}
}
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
const context=():CameraContext=>({sessionId:'session',epoch:1,identityId:a,room:'area:community:game:werewolves',roomName:'werewolves',peers:[{identityId:b,endpoint:'b',sendToken:'y'.repeat(43),receiveToken:'x'.repeat(43),watching:true},{identityId:c,endpoint:'c',sendToken:'y'.repeat(43),receiveToken:'z'.repeat(43),watching:false}]});
const metadata=()=>({v:2,kind:'camera',sessionId:'session',epoch:1,identityId:b,room:'area:community:game:werewolves',token:'x'.repeat(43)});
describe('optional game camera consent and audience',()=>{
  it('requests video-only Full HD after a gesture and sends only to viewers of the same game',async()=>{
    let requested:MediaStreamConstraints|undefined;const video=stream();const calls:Call[]=[];
    const camera=new GameCameraManager(()=>{},{getUserMedia:async constraints=>{requested=constraints;return video.stream;}});
    camera.attach({call:(endpoint:string,_stream:MediaStream,metadata:unknown)=>{const call=new Call(endpoint,metadata);calls.push(call);return call;}} as unknown as TransportEndpoint);
    expect(requested).toBeUndefined();await camera.toggle();expect(requested).toBeUndefined();camera.setContext(context());expect(requested).toBeUndefined();
    await camera.toggle();expect(requested).toEqual({audio:false,video:{facingMode:'user',width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}}});
    expect(calls).toHaveLength(1);expect(calls[0].endpoint).toBe('b');expect(calls[0].limited).toBe('camera');expect(camera.view.local).toBe(video.stream);
    camera.setContext({...context(),peers:context().peers.map(p=>({...p,watching:false}))});expect(calls[0].closed).toBe(true);expect(video.track.stopped).toBe(false);
    await camera.toggle();expect(video.track.stopped).toBe(true);expect(camera.view.local).toBeNull();camera.dispose();
  });
  it('authenticates sender, token, scene, session and game before receiving, and closes on removal',()=>{
    const camera=new GameCameraManager(()=>{});camera.setContext(context());
    for(const data of [{...metadata(),room:'area:community:game:gartic'},{...metadata(),epoch:2},{...metadata(),sessionId:'other'},{...metadata(),token:'z'.repeat(43)},{...metadata(),identityId:c}]){const call=new Call('b',data);camera.receive(call);expect(call.closed).toBe(true);expect(call.answered).toBe(false);}
    const call=new Call('b',metadata());camera.receive(call);expect(call.answered).toBe(true);const remote=stream();for(const fn of call.streams)fn(remote.stream);expect(camera.view.remote).toHaveLength(1);
    camera.setContext({...context(),peers:[]});expect(call.closed).toBe(true);expect(remote.track.stopped).toBe(true);expect(camera.view.remote).toHaveLength(0);camera.dispose();
  });
  it('revokes late permission results on close, cancel, scene change and game change',async()=>{
    for(const mode of ['close','cancel','scene','game']){
      let release!:(s:MediaStream)=>void;const video=stream();const camera=new GameCameraManager(()=>{},{getUserMedia:()=>new Promise(resolve=>{release=resolve;})});camera.setContext(context());
      const opening=camera.toggle();expect(camera.view.pending).toBe(true);
      if(mode==='close')camera.setContext(null);else if(mode==='cancel')await camera.toggle();else camera.setContext({...context(),room:mode==='scene'?'area:study:game:werewolves':'area:community:game:gartic'});
      release(video.stream);await opening;expect(video.track.stopped).toBe(true);expect(camera.view.local).toBeNull();expect(camera.view.pending).toBe(false);camera.dispose();
    }
  });
  it('rejects audio in a camera call and handles denied or ended capture without retaining tracks',async()=>{
    const camera=new GameCameraManager(()=>{},{getUserMedia:async()=>{throw new DOMException('denied','NotAllowedError');}});camera.setContext(context());await camera.toggle();expect(camera.view.pending).toBe(false);expect(camera.view.error).toContain('permiso');
    const call=new Call('b',metadata());camera.receive(call);const invalid=stream(true);for(const fn of call.streams)fn(invalid.stream);expect(call.closed).toBe(true);expect(invalid.track.stopped).toBe(true);camera.dispose();
    const video=stream();const live=new GameCameraManager(()=>{},{getUserMedia:async()=>video.stream});live.setContext(context());await live.toggle();video.track.dispatchEvent(new Event('ended'));expect(live.view.local).toBeNull();expect(video.track.stopped).toBe(true);live.dispose();
  });
});
