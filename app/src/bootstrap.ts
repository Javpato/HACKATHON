import { decryptIdentity, encryptIdentity, exportContact, generateIdentity, parseContact } from './identity';
import { VillageClient } from './session/client';
import { createStudyUI } from './ui/app';
import { MediaDiagnostic } from './diagnostics/media-diagnostic';
import { chooseLocalFile, downloadLocal, showLocalPreview } from './local-bridge/files';
import { newLocalData, openLocalStore, publicHouse, SaveQueue, type LocalData } from './storage/local-store';
import type { AppActions, AppView, PublicHouse } from './protocol/types';

const activePhases = new Set(['SIGNALING', 'CONNECTING', 'AUTHENTICATING', 'PENDING_APPROVAL', 'JOINED', 'RECONNECTING']);
function initialHouse(ownerId: string): PublicHouse {
  return { ownerId, revision: 1, name: 'Mi rincón de estudio', access: 'ask', theme: 'mint', furniture: [
    { id: 'desk', kind: 'desk', x: 130, y: 150, publicAlias: 'Mi proyecto' },
    { id: 'library', kind: 'bookshelf', x: 55, y: 100, publicAlias: 'Lecturas' },
    { id: 'board', kind: 'board', x: 340, y: 95, publicAlias: 'Ideas compartidas' },
    { id: 'table', kind: 'table', x: 430, y: 240, publicAlias: 'Mesa de estudio' },
    { id: 'plant', kind: 'plant', x: 660, y: 120, publicAlias: 'Un poco de verde' },
    { id: 'frame', kind: 'frame', x: 560, y: 100, publicAlias: 'Inspiración' },
  ] };
}

export async function startApp(root: HTMLElement): Promise<() => void> {
  const store = await openLocalStore();
  const loaded = await store.load();
  let data: LocalData = loaded ?? newLocalData();
  // A saved identity is never silently used without unlocking its private key.
  let identity = await generateIdentity(data.profile.displayName, data.profile.color);
  let lockedIdentity = !!data.encryptedIdentity;
  let ownHouse = data.house ? publicHouse(data.house, identity.public.fingerprint) : initialHouse(identity.public.fingerprint);
  let client = new VillageClient(identity, ownHouse);
  let network = client.view;
  let notice: string | null = lockedIdentity ? 'Desbloquea tu identidad guardada para conectar. Tu casa sigue disponible sin conexión.' : null;
  let closed = false;
  let ui: ReturnType<typeof createStudyUI> | null = null;
  let savingFailed = false;
  const update = () => {
    if (closed) return;
    const view: AppView = { identity: identity.public, network, ownHouse, contacts: data.contacts,
      friendCode: data.friendCode, storage: store.kind, identitySaved: !!data.encryptedIdentity,
      lockedIdentity, notice, diagnostics: diagnostic.entries, editorText: data.editor };
    ui?.update(view);
  };
  const diagnostic = new MediaDiagnostic(update);
  const report = (error: unknown) => {
    const message = error instanceof Error && error.message.length < 220 ? error.message : 'No se pudo completar la acción. Revisa los datos y vuelve a intentarlo.';
    notice = message; update();
  };
  const writes = new SaveQueue(store, error => { savingFailed = true; report(error); });
  const persist = async () => {
    savingFailed = false;
    data = { ...data, house: publicHouse(ownHouse) };
    await writes.save(data);
  };
  let unsubscribe = () => {};
  const subscribe = () => { unsubscribe = client.subscribe(view => { network = view; update(); }); };
  const replaceClient = () => { unsubscribe(); client.dispose(); client = new VillageClient(identity, ownHouse); subscribe(); };
  const requireOffline = () => { if (activePhases.has(network.phase)) throw new Error('Sal del vecindario antes de cambiar tu identidad o perfil.'); };
  const requireUnlocked = () => { if (lockedIdentity) throw new Error('Desbloquea tu identidad guardada antes de conectar.'); };
  const run = async (action: () => void | Promise<void>) => { try { await action(); } catch (error) { report(error); throw error; } };
  const runSync = (action: () => void) => { try { action(); } catch (error) { report(error); } };

  const actions: AppActions = {
    openVillage: () => run(async () => { requireUnlocked(); diagnostic.stop(); await client.openVillage(); }),
    joinVillage: invite => run(async () => { requireUnlocked(); diagnostic.stop(); await client.joinVillage(invite); }),
    decideJoin: (id, accept) => runSync(() => client.decideJoin(id, accept)),
    rotateInvite: () => runSync(() => client.rotateInvite()),
    leave: () => run(async () => { diagnostic.stop(); await client.leave(); await writes.flush(); }),
    visitHouse: id => runSync(() => client.visitHouse(id)),
    decideVisit: (id, accept) => runSync(() => client.decideVisit(id, accept)),
    leaveHouse: () => runSync(() => client.leaveHouse()),
    publishHouse: house => runSync(() => client.publishHouse(publicHouse(house, identity.public.fingerprint))),
    move: position => client.move(position),
    sendStroke: stroke => runSync(() => client.sendStroke(stroke)),
    deleteStroke: id => runSync(() => client.deleteStroke(id)),
    kickMember: id => runSync(() => client.kickMember(id)),
    kickVisitor: id => runSync(() => client.kickVisitor(id)),
    toggleMicrophone: () => run(() => client.toggleMicrophone()),
    setMuted: muted => client.setMuted(muted),
    setDeafened: deafened => client.setDeafened(deafened),
    setPushToTalk: enabled => client.setPushToTalk(enabled),
    setTalking: talking => client.setTalking(talking),
    startScreen: () => run(() => client.startScreen()),
    stopScreen: () => client.stopScreen(),
    requestPrivate: (identityId) => client.requestPrivate(identityId),
    updateProfile: (displayName, color) => run(async () => {
      requireOffline();
      const name = displayName.trim().slice(0, 32);
      if (!name || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Elige un nombre y un color válidos.');
      data.profile = { displayName: name, color };
      identity.public = { ...identity.public, displayName: name, color };
      replaceClient(); await persist(); update();
    }),
    updateOwnHouse: house => runSync(() => {
      if (house.ownerId !== identity.public.fingerprint) throw new Error('Solo puedes decorar tu propia casa.');
      const next = publicHouse(house);
      if (next.revision <= ownHouse.revision) next.revision = ownHouse.revision + 1;
      ownHouse = next;
      data.projectLinks = Object.fromEntries(Object.entries(data.projectLinks).filter(([id]) => ownHouse.furniture.some(item => item.id === id)));
      client.publishHouse(ownHouse); void persist(); update();
    }),
    copyInvite: () => run(async () => {
      if (!network.invite) throw new Error('Abre primero un vecindario.');
      try { await navigator.clipboard.writeText(network.invite); notice = 'Invitación copiada. Compártela solo con quien quieras invitar.'; }
      catch { notice = 'El portapapeles no está disponible. Selecciona y copia la invitación del campo de texto.'; }
      update();
    }),
    saveIdentity: passphrase => run(async () => {
      requireOffline(); requireUnlocked();
      if (passphrase.length < 12) throw new Error('Usa una contraseña de al menos 12 caracteres.');
      const encrypted = await encryptIdentity(identity, passphrase);
      const previous = data.encryptedIdentity;
      data.encryptedIdentity = encrypted; await persist();
      if (savingFailed) { data.encryptedIdentity = previous; throw new Error('No se pudo guardar la identidad. Comprueba el almacenamiento local.'); }
      notice = 'Identidad guardada cifrada. Necesitarás esta contraseña al reiniciar.';
      update();
    }),
    unlockIdentity: passphrase => run(async () => {
      requireOffline(); if (!data.encryptedIdentity) throw new Error('No hay ninguna identidad guardada.');
      const unlocked = await decryptIdentity(data.encryptedIdentity, passphrase);
      identity = { ...unlocked, public: { ...unlocked.public, ...data.profile } };
      ownHouse = publicHouse(ownHouse, identity.public.fingerprint); lockedIdentity = false;
      replaceClient(); await persist(); notice = 'Identidad desbloqueada; tus contactos pueden reconocer tu huella.'; update();
    }),
    exportContact: () => runSync(() => {
      requireUnlocked();
      downloadLocal('studyvillage-contact.json', new Blob([exportContact(identity, data.friendCode)], { type: 'application/json' }));
      if (!data.encryptedIdentity) { notice = 'Contacto exportado. Guarda tu identidad cifrada para conservar esta huella al reiniciar.'; update(); }
    }),
    importContact: file => run(async () => {
      if (file.size > 8192) throw new Error('El archivo de contacto supera 8 KiB.');
      const contact = await parseContact(await file.text());
      if (contact.identity.fingerprint === identity.public.fingerprint) throw new Error('Este contacto eres tú.');
      const existing = data.contacts.filter(item => item.identity.fingerprint !== contact.identity.fingerprint);
      if (existing.length >= 100) throw new Error('La agenda admite hasta 100 contactos.');
      data.contacts = [...existing, contact]; await persist(); notice = 'Contacto importado y huella verificada. Una invitación temporal sigue siendo necesaria para conectar.'; update();
    }),
    rotateFriendCode: () => { data.friendCode = crypto.randomUUID(); void persist(); notice = 'Código amigo renovado. Tu identidad y huella se conservan.'; update(); },
    openLocalFile: furnitureId => run(async () => {
      const item = ownHouse.furniture.find(furniture => furniture.id === furnitureId);
      const self = network.members.find(member => member.identity.fingerprint === identity.public.fingerprint);
      if (!item || (self?.houseId && self.houseId !== identity.public.fingerprint)) throw new Error('Los archivos solo se abren desde tu propio espacio.');
      const file = await chooseLocalFile(); if (!file) return;
      data.projectLinks = { ...data.projectLinks, [furnitureId]: { name: file.name, kind: file.kind, ...(file.privatePath ? { privatePath: file.privatePath } : {}) } };
      if (file.kind === 'text') data.editor = file.content;
      else showLocalPreview(file);
      await persist(); notice = 'Archivo abierto localmente. El alias público del mueble no ha cambiado.'; update();
    }),
    saveEditor: text => run(async () => { if (new TextEncoder().encode(text).length > 1_048_576) throw new Error('El editor admite hasta 1 MiB.'); data.editor = text; await persist(); if (savingFailed) throw new Error('No se pudo guardar. Tus cambios siguen en el editor.'); notice = 'Snippet guardado solo en este equipo.'; update(); }),
    exportEditor: text => downloadLocal('studyvillage-snippet.txt', new Blob([text], { type: 'text/plain;charset=utf-8' })),
    exportBoard: canvas => { canvas.toBlob(blob => { if (blob) downloadLocal('studyvillage-pizarra.png', blob); else report(new Error('No se pudo exportar la pizarra.')); }, 'image/png'); },
    runDiagnostic: kind => diagnostic.run(kind),
    dismissNotice: () => { notice = null; update(); },
  };
  ui = createStudyUI(root, actions); subscribe();
  if (!loaded) await persist();
  update();
  const dispose = () => {
    if (closed) return;
    closed = true; unsubscribe(); diagnostic.dispose(); client.dispose(); ui?.destroy();
    void writes.flush().finally(() => store.close());
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
