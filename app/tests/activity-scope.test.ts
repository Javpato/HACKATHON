import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedRoom, activityScope } from '../src/minigames/room';
import { GroupProjectsBoard, type ProjectsAction, type ProjectsView } from '../src/projects/group-projects';
import { StudyLibrary } from '../src/study/library';
import { SecureNotesStore } from '../src/notes/secure-notes';
import type { AppChannel, AppMessage } from '../src/protocol/types';

const OWNER = 'a'.repeat(64);
const me = { name: 'Ana', color: '#123456' };

describe('room-scoped activities', () => {
  let data = new Map<string, string>();
  beforeEach(() => {
    data = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => data.delete(k), clear: () => data.clear() });
  });

  it('builds valid scopes and refuses malformed ids', () => {
    expect(activityScope(OWNER, 'ground', 'r1')).toBe(`room:${OWNER}:ground:r1`);
    expect(activityScope('nothex', 'ground', 'r1')).toBe('');
    expect(activityScope(OWNER, 'ground', 'bad id')).toBe('');
  });

  it('keeps each room\'s projects apart over the same channel', () => {
    const listeners = new Map<string, Set<(m: AppMessage) => void>>();
    const actionsFor = (self: string) => ({
      sendApp: (channel: AppChannel, to: string | null, data: string) => { if (!to) return false; for (const l of listeners.get(to) ?? []) l({ channel, from: self, data }); return true; },
      onApp: (l: (m: AppMessage) => void) => { const set = listeners.get(self) ?? new Set(); set.add(l); listeners.set(self, set); return () => { set.delete(l); }; },
    });
    const roomA = activityScope(OWNER, 'ground', 'a'), roomB = activityScope(OWNER, 'ground', 'b');
    const make = (self: string, scope: string) => new SharedRoom<ProjectsAction, ProjectsView, GroupProjectsBoard>('projects', actionsFor(self), () => ({ selfId: self, hostId: 'host' }), () => new GroupProjectsBoard(false, scope), scope);
    const hostLobby = make('host', ''), hostA = make('host', roomA), hostB = make('host', roomB);
    const guestA = make('guest', roomA), guestB = make('guest', roomB), guestLobby = make('guest', '');
    for (const r of [hostLobby, hostA, hostB, guestA, guestB, guestLobby]) r.sync();
    guestA.act({ kind: 'create', name: 'Proyecto A', description: '', repoUrl: '', me });
    guestLobby.act({ kind: 'create', name: 'Proyecto vestíbulo', description: '', repoUrl: '', me });
    expect(hostA.current()!.projects.map(p => p.name)).toEqual(['Proyecto A']);
    expect(hostB.current()!.projects).toEqual([]);
    expect(hostLobby.current()!.projects.map(p => p.name)).toEqual(['Proyecto vestíbulo']);
    expect(guestA.current()!.projects.map(p => p.name)).toEqual(['Proyecto A']);
    guestB.refresh();
    expect(guestB.current()!.projects).toEqual([]);
  });

  it('stores flashcards, quizzes, notes and projects separately per room', () => {
    const scope = activityScope(OWNER, 'ground', 'a');
    const roomLib = new StudyLibrary(scope);
    roomLib.createManualDeck({ title: 'Solo en la habitación', ownerId: 'local-host', visibility: 'private' });
    expect(new StudyLibrary(scope).listDecks().some(d => d.title === 'Solo en la habitación')).toBe(true);
    expect(new StudyLibrary('').listDecks().some(d => d.title === 'Solo en la habitación')).toBe(false);
    expect(localStorage.getItem('studyvillage-flashcard-decks-v1') ?? '').not.toContain('Solo en la habitación');

    const notes = new SecureNotesStore('local-owner', scope);
    notes.createNotebook('Cuaderno de la habitación', 'local-owner');
    expect(localStorage.getItem('studyvillage-secure-notes-v1') ?? '').not.toContain('Cuaderno de la habitación');
    expect(localStorage.getItem(`studyvillage-secure-notes-v1:${scope}`) ?? '').toContain('Cuaderno de la habitación');

    const board = new GroupProjectsBoard(true, scope);
    board.apply('ana', { kind: 'create', name: 'Proyecto de la habitación', description: '', repoUrl: '', me }, Date.now());
    expect(localStorage.getItem(`studyvillage-group-projects-v1:${scope}`) ?? '').toContain('Proyecto de la habitación');
    expect(new GroupProjectsBoard(true, '').projects).toEqual([]);
  });
});
