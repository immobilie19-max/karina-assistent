/* Karina Assistent — Datenschicht.
   Alle Daten liegen in localStorage (Schlüssel 'karina-assistent-v1') und
   verlassen das Gerät nie. Export/Import als lesbares ZIP (.md + .json).
   Am PC (Chrome/Edge) optional: Live-Spiegel in einen echten Ordner. */
(function () {
  'use strict';

  const KEY = 'karina-assistent-v1';
  const Store = {};

  /* ---------- Schema ---------- */
  function emptyState() {
    return {
      version: 1,
      inbox: [],     // {id, text, audio?, createdAt}
      tasks: [],     // {id, title, due, priority, status, createdAt, completedAt, fromInboxText?}
      events: [],    // {id, title, date, time?, createdAt}
      notes: [],     // {id, title, body, linkTo?{type:'task'|'event', id}, createdAt, updatedAt}
      sessions: [],  // {id, taskId, minutes, startedAt, createdAt}
      settings: { fokusMin: 25, pauseMin: 5 }
    };
  }
  const COLLECTIONS = ['inbox', 'tasks', 'events', 'notes', 'sessions'];

  let state = emptyState();
  const listeners = [];

  /* ---------- Laden & Speichern ---------- */
  Store.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(emptyState(), parsed);
        state.settings = Object.assign(emptyState().settings, parsed.settings || {});
        for (const c of COLLECTIONS) if (!Array.isArray(state[c])) state[c] = [];
      }
    } catch (e) {
      console.error('Daten konnten nicht geladen werden:', e);
      // Defekte Daten sichern statt überschreiben
      try { localStorage.setItem(KEY + '-defekt-' + Date.now(), localStorage.getItem(KEY)); } catch (_) {}
      state = emptyState();
    }
  };

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    scheduleMirror();
  }

  function notify(coll) {
    for (const fn of listeners) {
      try { fn(coll); } catch (e) { console.error(e); }
    }
  }

  Store.onChange = function (fn) { listeners.push(fn); };

  /* ---------- Zugriff ---------- */
  Object.defineProperty(Store, 'state', { get: () => state });

  Store.all = function (coll) { return state[coll]; };

  Store.get = function (coll, id) {
    return state[coll].find(x => x.id === id) || null;
  };

  Store.add = function (coll, obj) {
    const item = Object.assign({}, obj);
    if (!item.id) item.id = Util.uid();
    if (!item.createdAt) item.createdAt = new Date().toISOString();
    state[coll].push(item);
    save();
    notify(coll);
    return item;
  };

  Store.update = function (coll, id, patch) {
    const item = Store.get(coll, id);
    if (!item) return null;
    Object.assign(item, patch);
    save();
    notify(coll);
    return item;
  };

  Store.remove = function (coll, id) {
    const i = state[coll].findIndex(x => x.id === id);
    if (i < 0) return false;
    state[coll].splice(i, 1);
    save();
    notify(coll);
    return true;
  };

  Store.setSettings = function (patch) {
    Object.assign(state.settings, patch);
    save();
    notify('settings');
  };

  Store.resetAll = function () {
    state = emptyState();
    save();
    notify('*');
  };

  /* ---------- Export: lesbares ZIP ---------- */
  function exportEntries() {
    const j = (x) => JSON.stringify(x, null, 2);
    const entries = [
      { name: 'eingang.json', data: j(state.inbox) },
      { name: 'aufgaben.json', data: j(state.tasks) },
      { name: 'termine.json', data: j(state.events) },
      { name: 'sitzungen.json', data: j(state.sessions) },
      { name: 'einstellungen.json', data: j(state.settings) },
      { name: '_meta.json', data: j(state) }, // verlustfreie Gesamtkopie für den Import
      {
        name: 'LIES-MICH.txt',
        data: 'Backup des Karina-Assistenten vom ' + Util.fmtDateTime(new Date().toISOString()) +
          '\n\nnotizen/*.md  = deine Notizen als Markdown' +
          '\n*.json        = Aufgaben, Termine, Eingang, Fokus-Sitzungen (lesbar)' +
          '\n_meta.json    = Gesamtkopie; wird beim Import in der App verwendet.\n'
      }
    ];
    const usedNames = new Set();
    for (const n of state.notes) {
      let base = 'notizen/' + Util.slug(n.title) + '-' + n.id + '.md';
      if (usedNames.has(base)) base = 'notizen/' + n.id + '.md';
      usedNames.add(base);
      entries.push({ name: base, data: '# ' + (n.title || 'Ohne Titel') + '\n\n' + (n.body || '') + '\n' });
    }
    return entries;
  }

  Store.exportZip = function () {
    return Zip.write(exportEntries());
  };

  Store.exportFilename = function () {
    return 'karina-backup-' + Util.todayISO() + '.zip';
  };

  /* ---------- Import ---------- */
  Store.importZip = async function (arrayBuffer) {
    const entries = await Zip.read(arrayBuffer);
    const meta = entries.find(e => e.name.endsWith('_meta.json'));
    if (meta) {
      const parsed = JSON.parse(meta.text());
      if (!parsed || !Array.isArray(parsed.tasks)) throw new Error('_meta.json ist ungültig.');
      state = Object.assign(emptyState(), parsed);
      state.settings = Object.assign(emptyState().settings, parsed.settings || {});
    } else {
      // Fallback: einzelne Dateien einlesen
      const next = emptyState();
      const byName = {};
      for (const e of entries) byName[e.name.replace(/^.*\//, '')] = e;
      const readJson = (n) => byName[n] ? JSON.parse(byName[n].text()) : null;
      next.inbox = readJson('eingang.json') || [];
      next.tasks = readJson('aufgaben.json') || [];
      next.events = readJson('termine.json') || [];
      next.sessions = readJson('sitzungen.json') || [];
      next.settings = Object.assign(next.settings, readJson('einstellungen.json') || {});
      for (const e of entries) {
        if (!/\.md$/.test(e.name) || !/notizen\//.test(e.name)) continue;
        const text = e.text();
        const m = text.match(/^#\s+(.*)\n+([\s\S]*)$/);
        next.notes.push({
          id: Util.uid(),
          title: m ? m[1].trim() : e.name.replace(/^.*\//, '').replace(/\.md$/, ''),
          body: (m ? m[2] : text).trim(),
          linkTo: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      state = next;
    }
    save();
    notify('*');
  };

  /* ---------- Ordner-Spiegel (nur PC, Chrome/Edge) ---------- */
  let dirHandle = null;
  let mirrorTimer = null;

  Store.folderSupported = typeof window.showDirectoryPicker === 'function';
  Store.folderConnected = () => !!dirHandle;

  // Handle über Neustarts merken (IndexedDB, minimal)
  function idb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open('karina-assistent', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async function idbSet(k, v) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(k) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly');
      const rq = tx.objectStore('kv').get(k);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  }

  Store.connectFolder = async function () {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    try { await idbSet('dirHandle', dirHandle); } catch (_) {}
    await mirrorNow();
  };

  Store.disconnectFolder = async function () {
    dirHandle = null;
    try { await idbSet('dirHandle', null); } catch (_) {}
  };

  Store.restoreFolder = async function () {
    if (!Store.folderSupported) return false;
    try {
      const h = await idbGet('dirHandle');
      if (!h) return false;
      const perm = await h.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') { dirHandle = h; return true; }
      // Berechtigung muss per Klick neu erteilt werden — App fragt in den Einstellungen.
      Store._pendingHandle = h;
      return false;
    } catch (_) { return false; }
  };

  Store.reauthorizeFolder = async function () {
    const h = Store._pendingHandle;
    if (!h) return false;
    if (await h.requestPermission({ mode: 'readwrite' }) === 'granted') {
      dirHandle = h; Store._pendingHandle = null;
      await mirrorNow();
      return true;
    }
    return false;
  };

  function scheduleMirror() {
    if (!dirHandle) return;
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => { mirrorNow().catch(e => console.error('Ordner-Spiegel:', e)); }, 1500);
  }

  async function mirrorNow() {
    if (!dirHandle) return;
    const entries = exportEntries();
    const notesDir = await dirHandle.getDirectoryHandle('notizen', { create: true });
    // Verwaiste Notizdateien entfernen
    const keep = new Set(entries.filter(e => e.name.startsWith('notizen/')).map(e => e.name.slice(8)));
    try {
      for await (const [name] of notesDir.entries()) {
        if (name.endsWith('.md') && !keep.has(name)) await notesDir.removeEntry(name);
      }
    } catch (_) {}
    for (const e of entries) {
      const parts = e.name.split('/');
      const dir = parts.length > 1 ? notesDir : dirHandle;
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(e.data);
      await w.close();
    }
  }

  Store.mirrorNow = mirrorNow;

  window.Store = Store;
})();
