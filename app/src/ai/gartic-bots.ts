import { z } from 'zod';
import { HostOllamaGateway, isLoopbackOllamaUrl } from './ollama-gateway';
import { GarticGame, type GarticAction, type GarticView } from '../minigames/gartic-phone';
import { SharedRoom } from '../minigames/room';
import { paintDrawing } from '../ui/gartic-ui';
export const botResponseSchema = z.object({ text: z.string().trim().min(1).max(120).optional(), drawing: z.object({ strokes: z.array(z.object({ c: z.string().regex(/^#[a-fA-F0-9]{6}$/), w: z.number().min(1).max(48), p: z.array(z.number().finite().min(0).max(640)).min(2).max(1000).refine(p=>p.length%2===0 && p.every((n,i)=>i%2===0||n<=400)) })).min(1).max(100) }).optional() }).refine(r=>!!r.text||!!r.drawing);
export class OllamaGarticBots {
  private readyModel = ''; private busy = false; private tried = new Set<string>(); private off: () => void; private generation = 0;
  constructor(private readonly gateway: HostOllamaGateway, private readonly room: SharedRoom<GarticAction,GarticView,GarticGame>, private readonly notify: (m:string)=>void) { this.off=room.subscribe(()=>{void this.pump();}); }
  ready(): boolean { return this.gateway.isAiReady() && this.gateway.getConfig().selectedModel === this.readyModel; }
  async enable(): Promise<void> {
    if(!this.room.canStop())throw new Error('Solo el anfitrión configura bots.');
    const generation = this.generation;
    const cfg=this.gateway.getConfig(); if(!this.gateway.isAiReady()||!isLoopbackOllamaUrl(cfg.baseUrl))throw new Error('Detecta y elige un modelo Ollama primero.');
    const res=await fetch(`${cfg.baseUrl.replace(/\/$/,'')}/api/show`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:cfg.selectedModel}),signal:AbortSignal.timeout(8000)});
    const info=await res.json() as {capabilities?:string[]};if(!res.ok||!info.capabilities?.includes('vision'))throw new Error('Este modelo no declara capacidad de visión.');
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,64,64);ctx.fillStyle='#000000';ctx.fillRect(16,16,32,32);
    if (generation !== this.generation) throw new Error('Comprobación cancelada.');
    const vision=botResponseSchema.parse(await this.gateway.requestJson('Describe la imagen en JSON: {"text":"descripción breve"}.',[canvas.toDataURL('image/png').split(',')[1]]));if(!vision.text)throw new Error('El modelo no devolvió una descripción válida.');
    if (generation !== this.generation) throw new Error('Comprobación cancelada.');
    const draw=botResponseSchema.parse(await this.gateway.requestJson('Dibuja un cuadrado con trazos en JSON: {"drawing":{"strokes":[{"c":"#000000","w":4,"p":[10,10,50,10,50,50,10,50,10,10]}]}}. Coordenadas 640x400.'));if(!draw.drawing)throw new Error('El modelo no produce dibujos válidos.');
    if (generation !== this.generation || this.gateway.getConfig().selectedModel !== cfg.selectedModel) throw new Error('Comprobación cancelada.');
    this.readyModel=cfg.selectedModel;this.room.mutate(engine=>{engine.setAiBotsEnabled(true);return true;});
  }
  cancel(): void {this.generation++;this.gateway.cancelActiveRequests(true);}
  disable(): void {this.readyModel='';this.cancel();if(this.room.canStop())this.room.mutate(engine=>{engine.setAiBotsEnabled(false);return true;});}
  dispose(): void {this.cancel();this.off();}
  private async pump(): Promise<void> {
    if (this.readyModel && this.room.canStop() && !this.ready()) { this.disable(); this.notify('Los bots se han desactivado: el modelo ya no está disponible o ha cambiado.'); return; }
    if(this.busy||!this.room.canStop()||!this.ready())return;
    let jobs: ReturnType<GarticGame['botJobs']>=[];this.room.mutate(engine=>{jobs=engine.botJobs(Date.now());return false;});
    if (this.tried.size > 256) this.tried = new Set([...this.tried].filter(key => jobs.some(j => key === `${j.key}:${j.id}`)));
    const job=jobs.find(j=>!this.tried.has(`${j.key}:${j.id}`));if(!job)return;
    const token=this.generation;this.busy=true;this.tried.add(`${job.key}:${job.id}`);
    try {
      const images:string[]=[];if(job.task.previous?.drawing){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;paintDrawing(canvas.getContext('2d')!,job.task.previous.drawing);images.push(canvas.toDataURL('image/png').split(',')[1]);}
      const prompt=job.task.kind==='draw' ? `Dibuja esta frase como trazos JSON en un lienzo 640x400: ${JSON.stringify(job.task.previous?.text??'')}. Devuelve {"drawing":{"strokes":[{"c":"#000000","w":4,"p":[x,y,x,y]}]}}; máximo 100 trazos, 4000 puntos totales.` : job.task.kind==='guess' ? 'Describe solo la imagen adjunta en español: {"text":"descripción de hasta 120 caracteres"}.' : 'Escribe una frase original para un juego de dibujo: {"text":"frase de hasta 120 caracteres"}.';
      const answer=botResponseSchema.parse(await this.gateway.requestJson(prompt,images));
      if(job.task.kind==='draw'&&!answer.drawing||job.task.kind!=='draw'&&!answer.text)throw new Error('La respuesta no corresponde al turno.');
      if(answer.drawing && answer.drawing.strokes.reduce((n,s)=>n+s.p.length/2,0)>4000)throw new Error('Demasiados puntos.');
      if(token===this.generation&&this.ready())this.room.mutate(engine=>engine.submitBot(job.key,job.id,answer,Date.now()));
    } catch(e){ if(token===this.generation)this.notify(`Bot Ollama: ${e instanceof Error?e.message:'No pudo responder'}. Se aplicará el tiempo límite.`); }
    finally {this.busy=false;if(token===this.generation)queueMicrotask(()=>{void this.pump();});}
  }
}
