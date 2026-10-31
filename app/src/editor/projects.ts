import { z } from 'zod';
import { detectLanguage, executeLocalCode, type CodeLanguage, type RunResult } from './runner';

/**
 * Part 8 — Collaborative Projects (VS Code–like Multi-File Workspace & Host-Approved Execution)
 *
 * Features:
 * - Multi-file and folder tree explorer (create, rename, delete, select files)
 * - Open file tabs with unsaved/modified indicators
 * - Concurrent file synchronization & participant cursors
 * - Project-level permissions (`view_only`, `edit`, `propose_execution`, `host_full`)
 * - Host-Authorized Execution Workflow:
 *   - Collaborators can propose running a file/command at a specific cryptographic
 *     revision hash (`revisionHash`).
 *   - The host receives an explicit approval request showing the requester, command,
 *     working directory, environment keys, and exact `revisionHash`.
 *   - TOCTOU protection: if any file in the project changes after the proposal is
 *     created, `computeProjectRevisionHash()` will no longer match `proposal.revisionHash`
 *     and execution is blocked until re-approved.
 */

export type ProjectRolePermission = 'view_only' | 'edit' | 'propose_execution' | 'host_full';

export interface ProjectFile {
  path: string;
  name: string;
  folder: string;
  language: CodeLanguage | 'markdown' | 'json';
  content: string;
  updatedBy: string;
  updatedAt: number;
  revision: number;
}

export interface ProjectRemotePresence {
  userId: string;
  displayName: string;
  color: string;
  activeFilePath: string;
  cursorLine: number;
  cursorColumn: number;
  updatedAt: number;
}

export type ExecutionProposalStatus =
  | 'pending_host_approval'
  | 'approved'
  | 'denied'
  | 'running'
  | 'completed'
  | 'terminated'
  | 'failed_toctou';

export interface ExecutionProposal {
  requestId: string;
  projectId: string;
  proposerId: string;
  proposerName: string;
  entrypointPath: string;
  commandDisplay: string;
  workingDirectory: string;
  envSummary: string[];
  /** Snapshot hash of the project files at the moment the proposal was submitted */
  revisionHash: string;
  /** Frozen snapshot of the entrypoint content at proposal time */
  frozenSource: string;
  frozenLanguage: CodeLanguage;
  status: ExecutionProposalStatus;
  createdAt: number;
  decidedAt?: number;
  outputLines: string[];
  errorText?: string;
  durationMs?: number;
}

export interface CollaborativeProject {
  id: string;
  name: string;
  ownerId: string;
  defaultMemberPermission: ProjectRolePermission;
  memberPermissions: Record<string, ProjectRolePermission>;
  files: Record<string, ProjectFile>;
  openTabs: string[];
  activeTabPath: string;
  revision: number;
}

export const projectFilePathSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_./-]+$/, 'Ruta de archivo inválida')
  .refine((p) => !p.includes('..') && !p.startsWith('/'), 'No se permiten rutas relativas fuera del proyecto (..)');

/**
 * Deterministic synchronous FNV-1a + SHA-like digest over all project files
 * so TOCTOU verification works synchronously in both browser and Node tests.
 */
export function computeProjectRevisionHash(files: Record<string, Pick<ProjectFile, 'path' | 'content' | 'revision'>>): string {
  const sortedPaths = Object.keys(files).sort();
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (const path of sortedPaths) {
    const f = files[path];
    const entry = `${f.path}:${f.revision}:${f.content}\n`;
    for (let i = 0; i < entry.length; i++) {
      const code = entry.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ ((code << 3) ^ (code >>> 2)), 0x01000193) >>> 0;
    }
  }
  return `rev-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function inferFileLanguage(path: string, content = ''): ProjectFile['language'] {
  const lower = path.toLowerCase();
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.h')) return 'cpp';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.ts') || lower.endsWith('.js')) return 'typescript';
  return detectLanguage(content);
}

const STORAGE_KEY = 'studyvillage-collab-projects-v1';

export class CollaborativeProjectManager {
  private projects = new Map<string, CollaborativeProject>();
  private proposals = new Map<string, ExecutionProposal>();
  private presenceByProject = new Map<string, Map<string, ProjectRemotePresence>>();
  private activeAbortControllers = new Map<string, AbortController>();

  constructor(defaultOwnerId = 'local-host') {
    this.seedDefaultProjects(defaultOwnerId);
    this.loadFromStorage();
  }

  private seedDefaultProjects(ownerId: string): void {
    const files: Record<string, ProjectFile> = {
      'src/main.ts': {
        path: 'src/main.ts',
        name: 'main.ts',
        folder: 'src',
        language: 'typescript',
        content: [
          '// Proyecto Colaborativo · StudyVillage',
          '// Edita varios archivos en equipo y solicita ejecución supervisada al anfitrión.',
          '',
          'interface Estudiante {',
          '  nombre: string;',
          '  puntos: number;',
          '}',
          '',
          'const equipo: Estudiante[] = [',
          '  { nombre: "Ada", puntos: 95 },',
          '  { nombre: "Alan", puntos: 92 },',
          '  { nombre: "Grace", puntos: 98 },',
          '];',
          '',
          'const promedio = equipo.reduce((acc, e) => acc + e.puntos, 0) / equipo.length;',
          'console.log(`Promedio del equipo StudyVillage: ${promedio.toFixed(1)} pts`);',
        ].join('\n'),
        updatedBy: ownerId,
        updatedAt: Date.now(),
        revision: 1,
      },
      'src/algoritmos.py': {
        path: 'src/algoritmos.py',
        name: 'algoritmos.py',
        folder: 'src',
        language: 'python',
        content: [
          '# Algoritmo de programación dinámica: Fibonacci y Criba',
          'def fibonacci(n):',
          '  a, b = 0, 1',
          '  secuencia = []',
          '  for i in range(n):',
          '    secuencia.append(a)',
          '    a, b = b, a + b',
          '  return secuencia',
          '',
          'resultado = fibonacci(8)',
          'print(f"Primeros 8 números de Fibonacci: {resultado}")',
        ].join('\n'),
        updatedBy: ownerId,
        updatedAt: Date.now(),
        revision: 1,
      },
      'src/motor.cpp': {
        path: 'src/motor.cpp',
        name: 'motor.cpp',
        folder: 'src',
        language: 'cpp',
        content: [
          '#include <iostream>',
          '#include <vector>',
          '#include <cmath>',
          'using namespace std;',
          '',
          'int main() {',
          '  vector<int> datos = {4, 8, 15, 16, 23, 42};',
          '  int suma = 0;',
          '  for (int i = 0; i < datos.size(); i++) {',
          '    suma = suma + datos[i];',
          '  }',
          '  cout << "Suma del vector en C++: " << suma << endl;',
          '  return 0;',
          '}',
        ].join('\n'),
        updatedBy: ownerId,
        updatedAt: Date.now(),
        revision: 1,
      },
      'README.md': {
        path: 'README.md',
        name: 'README.md',
        folder: '',
        language: 'markdown',
        content: [
          '# Laboratorio Colaborativo StudyVillage',
          '',
          '- Estructura multi-archivo con pestañas.',
          '- Sincronización de cambios y cursores.',
          '- **Ejecución segura**: Los colaboradores proponen ejecutar una revisión (`revisionHash`) y el anfitrión aprueba o rechaza explícitamente.',
        ].join('\n'),
        updatedBy: ownerId,
        updatedAt: Date.now(),
        revision: 1,
      },
    };

    const mainProj: CollaborativeProject = {
      id: 'project:community-main',
      name: 'Proyecto de la Aldea (Multi-archivo)',
      ownerId,
      defaultMemberPermission: 'propose_execution',
      memberPermissions: {},
      files,
      openTabs: ['src/main.ts', 'src/algoritmos.py', 'src/motor.cpp', 'README.md'],
      activeTabPath: 'src/main.ts',
      revision: 1,
    };

    this.projects.set(mainProj.id, mainProj);
  }

  getProject(projectId = 'project:community-main'): CollaborativeProject {
    const existing = this.projects.get(projectId);
    if (existing) return existing;
    return this.projects.get('project:community-main')!;
  }

  listProjects(): CollaborativeProject[] {
    return Array.from(this.projects.values());
  }

  getEffectivePermission(projectId: string, userId: string, isHost: boolean): ProjectRolePermission {
    const proj = this.getProject(projectId);
    if (isHost || proj.ownerId === userId || proj.ownerId === 'local-host') return 'host_full';
    return proj.memberPermissions[userId] ?? proj.defaultMemberPermission;
  }

  setMemberPermission(
    projectId: string,
    targetUserId: string,
    perm: ProjectRolePermission,
    actorId: string,
    isHost: boolean,
  ): void {
    const proj = this.getProject(projectId);
    if (!isHost && proj.ownerId !== actorId && proj.ownerId !== 'local-host') {
      throw new Error('Solo el anfitrión del proyecto puede cambiar los permisos.');
    }
    proj.memberPermissions[targetUserId] = perm;
    proj.revision += 1;
    this.saveToStorage();
  }

  createFile(
    projectId: string,
    rawPath: string,
    initialContent: string,
    actorId: string,
    isHost: boolean,
  ): ProjectFile {
    const perm = this.getEffectivePermission(projectId, actorId, isHost);
    if (perm === 'view_only') {
      throw new Error('Tu permiso actual es de solo lectura en este proyecto.');
    }
    const cleanPath = projectFilePathSchema.parse(rawPath.trim());
    const proj = this.getProject(projectId);
    if (Object.keys(proj.files).length >= 32 && !proj.files[cleanPath]) {
      throw new Error('El proyecto admite hasta 32 archivos.');
    }
    const parts = cleanPath.split('/');
    const name = parts[parts.length - 1];
    const folder = parts.slice(0, -1).join('/');
    const file: ProjectFile = {
      path: cleanPath,
      name,
      folder,
      language: inferFileLanguage(cleanPath, initialContent),
      content: initialContent.slice(0, 100_000),
      updatedBy: actorId,
      updatedAt: Date.now(),
      revision: (proj.files[cleanPath]?.revision ?? 0) + 1,
    };
    proj.files[cleanPath] = file;
    if (!proj.openTabs.includes(cleanPath)) {
      proj.openTabs.push(cleanPath);
    }
    proj.activeTabPath = cleanPath;
    proj.revision += 1;
    this.saveToStorage();
    return file;
  }

  updateFileContent(
    projectId: string,
    path: string,
    newContent: string,
    actorId: string,
    isHost: boolean,
  ): ProjectFile {
    const perm = this.getEffectivePermission(projectId, actorId, isHost);
    if (perm === 'view_only') {
      throw new Error('No tienes permiso de edición en este proyecto.');
    }
    const proj = this.getProject(projectId);
    const existing = proj.files[path];
    if (!existing) throw new Error(`El archivo "${path}" no existe.`);
    if (new TextEncoder().encode(newContent).byteLength > 262_144) {
      throw new Error('El archivo supera el límite de 256 KB.');
    }
    const updated: ProjectFile = {
      ...existing,
      content: newContent,
      language: inferFileLanguage(path, newContent),
      updatedBy: actorId,
      updatedAt: Date.now(),
      revision: existing.revision + 1,
    };
    proj.files[path] = updated;
    proj.revision += 1;
    this.saveToStorage();
    return updated;
  }

  renameFile(
    projectId: string,
    oldPath: string,
    newRawPath: string,
    actorId: string,
    isHost: boolean,
  ): ProjectFile {
    const perm = this.getEffectivePermission(projectId, actorId, isHost);
    if (perm === 'view_only') {
      throw new Error('No tienes permiso para renombrar archivos.');
    }
    const newPath = projectFilePathSchema.parse(newRawPath.trim());
    const proj = this.getProject(projectId);
    const existing = proj.files[oldPath];
    if (!existing) throw new Error('Archivo original no encontrado.');
    if (oldPath !== newPath && proj.files[newPath]) {
      throw new Error('Ya existe un archivo con ese nombre.');
    }
    const parts = newPath.split('/');
    const renamed: ProjectFile = {
      ...existing,
      path: newPath,
      name: parts[parts.length - 1],
      folder: parts.slice(0, -1).join('/'),
      language: inferFileLanguage(newPath, existing.content),
      updatedBy: actorId,
      updatedAt: Date.now(),
      revision: existing.revision + 1,
    };
    delete proj.files[oldPath];
    proj.files[newPath] = renamed;
    proj.openTabs = proj.openTabs.map((t) => (t === oldPath ? newPath : t));
    if (proj.activeTabPath === oldPath) proj.activeTabPath = newPath;
    proj.revision += 1;
    this.saveToStorage();
    return renamed;
  }

  deleteFile(projectId: string, path: string, actorId: string, isHost: boolean): boolean {
    const perm = this.getEffectivePermission(projectId, actorId, isHost);
    if (perm === 'view_only') {
      throw new Error('No tienes permiso para eliminar archivos.');
    }
    const proj = this.getProject(projectId);
    if (!proj.files[path]) return false;
    if (Object.keys(proj.files).length <= 1) {
      throw new Error('El proyecto debe conservar al menos un archivo.');
    }
    delete proj.files[path];
    proj.openTabs = proj.openTabs.filter((t) => t !== path);
    if (proj.activeTabPath === path) {
      proj.activeTabPath = proj.openTabs[0] ?? Object.keys(proj.files)[0];
    }
    proj.revision += 1;
    this.saveToStorage();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Host-Authorized Sandboxed Execution (Part 8.3 & 8.4)
  // ---------------------------------------------------------------------------

  /**
   * Submits an execution request bound to the exact current project `revisionHash`.
   * Remote peers NEVER trigger execution directly; if the caller is a collaborator,
   * the proposal enters `pending_host_approval` until the host explicitly approves.
   */
  proposeExecution(params: {
    projectId: string;
    entrypointPath: string;
    proposerId: string;
    proposerName: string;
    isHost: boolean;
  }): ExecutionProposal {
    const perm = this.getEffectivePermission(params.projectId, params.proposerId, params.isHost);
    if (perm === 'view_only' || perm === 'edit') {
      throw new Error('No tienes permiso para solicitar la ejecución de código en este proyecto.');
    }
    const proj = this.getProject(params.projectId);
    const file = proj.files[params.entrypointPath];
    if (!file) throw new Error(`El archivo "${params.entrypointPath}" no existe.`);

    const execLang: CodeLanguage =
      file.language === 'python' || file.language === 'cpp' || file.language === 'typescript'
        ? file.language
        : detectLanguage(file.content);

    const runnerCmd =
      execLang === 'python'
        ? `python3 ${file.path}`
        : execLang === 'cpp'
          ? `g++ -O2 ${file.path} -o app && ./app`
          : `ts-node ${file.path}`;

    const revisionHash = computeProjectRevisionHash(proj.files);
    const proposal: ExecutionProposal = {
      requestId: `exec:${crypto.randomUUID().slice(0, 12)}`,
      projectId: proj.id,
      proposerId: params.proposerId,
      proposerName: params.proposerName,
      entrypointPath: file.path,
      commandDisplay: runnerCmd,
      workingDirectory: `/workspace/${proj.id}`,
      envSummary: ['SANDBOX=isolated', 'NETWORK=disabled', 'TIMEOUT_MS=5000', 'MAX_OUTPUT_LINES=200'],
      revisionHash,
      frozenSource: file.content,
      frozenLanguage: execLang,
      status: 'pending_host_approval',
      createdAt: Date.now(),
      outputLines: [],
    };
    this.proposals.set(proposal.requestId, proposal);
    return { ...proposal };
  }

  listProposals(projectId?: string): ExecutionProposal[] {
    const all = Array.from(this.proposals.values());
    return (projectId ? all.filter((p) => p.projectId === projectId) : all).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  /**
   * Host explicitly approves or denies a pending execution proposal.
   * Performs a strict TOCTOU check: if the project's current `revisionHash`
   * differs from `proposal.revisionHash`, execution is rejected with `failed_toctou`.
   */
  async decideExecutionProposal(params: {
    requestId: string;
    hostId: string;
    isHost: boolean;
    approve: boolean;
    timeoutMs?: number;
  }): Promise<ExecutionProposal> {
    if (!params.isHost) {
      throw new Error('Solo el anfitrión puede aprobar o rechazar la ejecución en su máquina.');
    }
    const proposal = this.proposals.get(params.requestId);
    if (!proposal) throw new Error('Solicitud de ejecución no encontrada.');
    if (proposal.status !== 'pending_host_approval') {
      return { ...proposal };
    }

    proposal.decidedAt = Date.now();
    if (!params.approve) {
      proposal.status = 'denied';
      proposal.outputLines = ['[Ejecución rechazada por el anfitrión]'];
      return { ...proposal };
    }

    const proj = this.getProject(proposal.projectId);
    const currentHash = computeProjectRevisionHash(proj.files);
    if (currentHash !== proposal.revisionHash) {
      proposal.status = 'failed_toctou';
      proposal.errorText =
        'Bloqueo TOCTOU: El código del proyecto fue modificado después de enviar la solicitud. Revisa los cambios y solicita una nueva aprobación.';
      proposal.outputLines = [`✖ ${proposal.errorText}`];
      return { ...proposal };
    }

    proposal.status = 'running';
    const controller = new AbortController();
    this.activeAbortControllers.set(proposal.requestId, controller);
    const timeoutMs = Math.max(500, Math.min(15_000, params.timeoutMs ?? 5_000));

    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<RunResult>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Tiempo máximo de ejecución agotado (${timeoutMs} ms).`));
        }, timeoutMs);
        controller.signal.addEventListener('abort', () => {
          reject(new Error('Ejecución detenida por el anfitrión.'));
        });
      });

      const result = await Promise.race([
        executeLocalCode(proposal.frozenSource, proposal.frozenLanguage),
        timeoutPromise,
      ]);

      if (controller.signal.aborted) {
        proposal.status = 'terminated';
        proposal.outputLines.push('[Proceso terminado por el anfitrión]');
      } else {
        proposal.status = 'completed';
        proposal.outputLines = result.output.slice(0, 200).map((line) => line.slice(0, 500));
        proposal.errorText = result.error;
        proposal.durationMs = result.durationMs;
      }
    } catch (err) {
      proposal.status = 'terminated';
      proposal.errorText = err instanceof Error ? err.message : String(err);
      proposal.outputLines = [`✖ ${proposal.errorText}`];
    } finally {
      if (timer) clearTimeout(timer);
      this.activeAbortControllers.delete(proposal.requestId);
    }

    return { ...proposal };
  }

  terminateRunningExecution(requestId: string, isHost: boolean): ExecutionProposal | null {
    if (!isHost) throw new Error('Solo el anfitrión puede terminar procesos en ejecución.');
    const controller = this.activeAbortControllers.get(requestId);
    if (controller) controller.abort();
    const proposal = this.proposals.get(requestId);
    if (proposal && proposal.status === 'running') {
      proposal.status = 'terminated';
      proposal.errorText = 'Ejecución terminada manualmente por el anfitrión.';
      proposal.outputLines.push('✖ Ejecución terminada manualmente por el anfitrión.');
    }
    return proposal ? { ...proposal } : null;
  }

  updatePresence(projectId: string, presence: ProjectRemotePresence): void {
    let map = this.presenceByProject.get(projectId);
    if (!map) {
      map = new Map();
      this.presenceByProject.set(projectId, map);
    }
    map.set(presence.userId, { ...presence, updatedAt: Date.now() });
  }

  getActivePresence(projectId: string, now = Date.now()): ProjectRemotePresence[] {
    const map = this.presenceByProject.get(projectId);
    if (!map) return [];
    const out: ProjectRemotePresence[] = [];
    for (const [id, item] of map.entries()) {
      if (now - item.updatedAt > 15_000) {
        map.delete(id);
        continue;
      }
      out.push(item);
    }
    return out;
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const serialized = Array.from(this.projects.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch {
      // Ignore quota issues
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as [string, CollaborativeProject][];
      if (Array.isArray(parsed)) {
        for (const [id, proj] of parsed) {
          if (proj && typeof proj.id === 'string' && proj.files && typeof proj.files === 'object') {
            this.projects.set(id, proj);
          }
        }
      }
    } catch {
      // Keep defaults
    }
  }
}
