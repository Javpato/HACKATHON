import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI, Type } from '@google/genai';
import {
  STUDYVILLAGE_SPRITE_PALETTE,
  localBoardLatexFallback,
  localBoardTutorFallback,
  localBookshelfStudyFallback,
  localDeskPlanFallback,
  localPixelSpriteFallback,
  sanitizeBoardAiText,
} from './src/ai/study-ai';
import type { FurnitureKind } from './src/protocol/types';

function readJsonBody(req: IncomingMessage, maxBytes = 2_000_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function withTimeout<T>(promise: Promise<T>, ms = 4_500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function createStudyVillageAiPlugin(): Plugin {
  const getAi = (): GoogleGenAI | null => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  const attachMiddleware = (middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }) => {
    middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/ai/') || req.method !== 'POST') {
        next();
        return;
      }
      try {
        const body = await readJsonBody(req);
        const ai = getAi();
        const route = req.url.split('?')[0];

        if (route === '/api/ai/board-latex') {
          const textContext = typeof body.textContext === 'string' ? body.textContext : '';
          const prompt = typeof body.prompt === 'string' ? body.prompt : '';
          const imagePngBase64 = typeof body.imagePngBase64 === 'string' ? body.imagePngBase64 : '';
          if (ai) {
            try {
              const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
              if (imagePngBase64) {
                const cleanBase64 = imagePngBase64.replace(/^data:image\/\w+;base64,/, '');
                parts.push({ inlineData: { mimeType: 'image/png', data: cleanBase64 } });
              }
              parts.push({
                text: `Convierte los apuntes, trazos o expresión de esta pizarra de estudio a una fórmula LaTeX limpia envuelta en $...$ o $$...$$. Contexto de texto en pizarra: "${textContext}". Petición del estudiante: "${prompt}". Devuelve JSON con "latex" (máximo 450 caracteres) y "summary" en español.`,
              });
              const response = await withTimeout(ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: { parts },
                config: {
                  systemInstruction: 'Eres un asistente matemático de una pizarra colaborativa en español. Devuelve siempre LaTeX válido envuelto en $...$ o $$...$$.',
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      latex: { type: Type.STRING, description: 'Fórmula LaTeX envuelta en $ o $$' },
                      summary: { type: Type.STRING, description: 'Breve descripción en español' },
                    },
                    required: ['latex', 'summary'],
                  },
                },
              }), 4_000);
              const parsed = JSON.parse((response.text ?? '{}').trim()) as { latex?: string; summary?: string };
              if (parsed.latex) {
                const rawLatex = parsed.latex.trim();
                const wrapped = rawLatex.startsWith('$') || rawLatex.startsWith('\\') ? rawLatex : `$$${rawLatex}$$`;
                sendJson(res, 200, {
                  latex: sanitizeBoardAiText(wrapped, 500),
                  summary: sanitizeBoardAiText(parsed.summary || 'Fórmula convertida a LaTeX con IA.', 200),
                  provider: 'gemini',
                });
                return;
              }
            } catch {
              // Fall back to deterministic local engine
            }
          }
          sendJson(res, 200, localBoardLatexFallback(textContext, prompt));
          return;
        }

        if (route === '/api/ai/board-tutor') {
          const strokesText = Array.isArray(body.strokesText) ? body.strokesText.map(String) : [];
          const prompt = typeof body.prompt === 'string' ? body.prompt : '';
          const imagePngBase64 = typeof body.imagePngBase64 === 'string' ? body.imagePngBase64 : '';
          if (ai) {
            try {
              const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
              if (imagePngBase64) {
                const cleanBase64 = imagePngBase64.replace(/^data:image\/\w+;base64,/, '');
                parts.push({ inlineData: { mimeType: 'image/png', data: cleanBase64 } });
              }
              parts.push({
                text: `Analiza esta pizarra de estudio. Textos/fórmulas actuales: ${JSON.stringify(strokesText)}. Duda o tema: "${prompt}". Genera 3 pasos breves de resolución (pueden incluir fórmulas con $...$) y una pista socrática ("hint") en español.`,
              });
              const response = await withTimeout(ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: { parts },
                config: {
                  systemInstruction: 'Eres un tutor socrático amable en español. Explica paso a paso sin abrumar, usando notas cortas de máximo 260 caracteres por paso.',
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      steps: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: '3 pasos claros de resolución para pegar como notas en la pizarra',
                      },
                      hint: { type: Type.STRING, description: 'Una pista breve en español' },
                    },
                    required: ['steps', 'hint'],
                  },
                },
              }), 4_000);
              const parsed = JSON.parse((response.text ?? '{}').trim()) as { steps?: string[]; hint?: string };
              if (Array.isArray(parsed.steps) && parsed.steps.length > 0 && parsed.hint) {
                sendJson(res, 200, {
                  steps: parsed.steps.slice(0, 4).map((s) => sanitizeBoardAiText(s, 500)),
                  hint: sanitizeBoardAiText(parsed.hint, 500),
                  provider: 'gemini',
                });
                return;
              }
            } catch {
              // Fall back to deterministic local engine
            }
          }
          sendJson(res, 200, localBoardTutorFallback(strokesText, prompt));
          return;
        }

        if (route === '/api/ai/bookshelf-study') {
          const content = typeof body.content === 'string' ? body.content : '';
          const topic = typeof body.topic === 'string' ? body.topic : '';
          if (ai) {
            try {
              const response = await withTimeout(ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: `Genera un pack de estudio en español a partir de estos apuntes/código:\nTema opcional: "${topic}"\nContenido:\n${content.slice(0, 6000)}`,
                config: {
                  systemInstruction: 'Eres un creador de tarjetas de memoria (flashcards) y preguntas de autoevaluación en español. Devuelve 3 flashcards y 2 preguntas tipo test de 4 opciones.',
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { type: Type.STRING },
                      flashcards: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            front: { type: Type.STRING },
                            back: { type: Type.STRING },
                          },
                          required: ['front', 'back'],
                        },
                      },
                      quiz: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            question: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            correctIndex: { type: Type.INTEGER },
                            explanation: { type: Type.STRING },
                          },
                          required: ['question', 'options', 'correctIndex', 'explanation'],
                        },
                      },
                      boardSummary: { type: Type.STRING },
                    },
                    required: ['topic', 'flashcards', 'quiz', 'boardSummary'],
                  },
                },
              }), 4_000);
              const parsed = JSON.parse((response.text ?? '{}').trim());
              if (parsed && Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0 && Array.isArray(parsed.quiz) && parsed.quiz.length > 0) {
                sendJson(res, 200, { ...parsed, provider: 'gemini' });
                return;
              }
            } catch {
              // Fall back to deterministic local engine
            }
          }
          sendJson(res, 200, localBookshelfStudyFallback(content, topic));
          return;
        }

        if (route === '/api/ai/desk-plan') {
          const goal = typeof body.goal === 'string' ? body.goal : '';
          const currentNotes = typeof body.currentNotes === 'string' ? body.currentNotes : '';
          if (ai) {
            try {
              const response = await withTimeout(ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: `Crea un plan de estudio Pomodoro de 25 minutos en Markdown en español para el objetivo: "${goal}". Apuntes actuales: "${currentNotes.slice(0, 2000)}".`,
                config: {
                  systemInstruction: 'Diseña planes de estudio concretos de 25 minutos con casillas de verificación (- [ ]) divididos en Enfoque (0-5m), Práctica activa (5-20m) y Síntesis (20-25m).',
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      markdown: { type: Type.STRING },
                      boardSummary: { type: Type.STRING },
                    },
                    required: ['title', 'markdown', 'boardSummary'],
                  },
                },
              }), 4_000);
              const parsed = JSON.parse((response.text ?? '{}').trim());
              if (parsed?.title && parsed?.markdown && parsed?.boardSummary) {
                sendJson(res, 200, { ...parsed, provider: 'gemini' });
                return;
              }
            } catch {
              // Fall back to deterministic local engine
            }
          }
          sendJson(res, 200, localDeskPlanFallback(goal, currentNotes));
          return;
        }

        if (route === '/api/ai/pixel-sprite') {
          const kind = (typeof body.kind === 'string' ? body.kind : 'plant') as FurnitureKind;
          const prompt = typeof body.prompt === 'string' ? body.prompt : 'Bonsái de estudio';
          if (ai) {
            try {
              const response = await withTimeout(ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: `Diseña un sprite pixel-art de 16x16 para un mueble tipo "${kind}" con la descripción: "${prompt}". Usa índices de paleta entre -1 (transparente) y ${STUDYVILLAGE_SPRITE_PALETTE.length - 1} para la paleta ${JSON.stringify(STUDYVILLAGE_SPRITE_PALETTE)}. Devuelve un array "pixels" de exactamente 256 enteros.`,
                config: {
                  systemInstruction: 'Eres un artista de pixel-art 2D top-down acogedor. Devuelve siempre exactamente 256 enteros (-1 para transparente, 0..11 para color de paleta).',
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      pixels: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                      label: { type: Type.STRING },
                    },
                    required: ['pixels', 'label'],
                  },
                },
              }), 4_000);
              const parsed = JSON.parse((response.text ?? '{}').trim()) as { pixels?: number[]; label?: string };
              if (Array.isArray(parsed.pixels) && parsed.pixels.length === 256) {
                const clampedPixels = parsed.pixels.map((n) => {
                  const v = Math.round(Number(n));
                  return Number.isFinite(v) && v >= -1 && v < STUDYVILLAGE_SPRITE_PALETTE.length ? v : -1;
                });
                sendJson(res, 200, {
                  width: 16,
                  height: 16,
                  palette: [...STUDYVILLAGE_SPRITE_PALETTE],
                  pixels: clampedPixels,
                  label: sanitizeBoardAiText(parsed.label || prompt, 48),
                  provider: 'gemini',
                });
                return;
              }
            } catch {
              // Fall back to deterministic local engine
            }
          }
          sendJson(res, 200, localPixelSpriteFallback(kind, prompt));
          return;
        }

        sendJson(res, 404, { error: 'Ruta de IA no encontrada.' });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Error procesando solicitud de IA.' });
      }
    });
  };

  return {
    name: 'studyvillage-ai-middleware',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [createStudyVillageAiPlugin()],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  clearScreen: false,
});
