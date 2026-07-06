/* Karina Assistent — Notizen: Liste, Ansicht (Markdown), Editor mit Diktat,
   Vorschau und Verknüpfung zu Aufgaben/Terminen. */
(function () {
  'use strict';

  Util.injectCSS('notes', `
    .nt-row { cursor: pointer; }
    .nt-row:hover { background: var(--surface-2); }
    .nt-row-main { flex: 1; min-width: 0; }
    .nt-row-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nt-row-preview { color: var(--text-muted); font-size: 0.85rem;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nt-row-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
    .nt-mic-mark { font-size: 0.85rem; }

    .nt-md { line-height: 1.55; overflow-wrap: break-word; }
    .nt-md h2 { font-size: 1.15rem; margin: 14px 0 6px; }
    .nt-md h3 { font-size: 1.05rem; margin: 12px 0 5px; }
    .nt-md h4 { font-size: 0.95rem; margin: 10px 0 4px; }
    .nt-md h2:first-child, .nt-md h3:first-child, .nt-md h4:first-child, .nt-md p:first-child { margin-top: 0; }
    .nt-md p { margin: 8px 0; }
    .nt-md ul, .nt-md ol { margin: 8px 0; padding-left: 22px; }
    .nt-md li { margin: 3px 0; }
    .nt-md code { background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 6px; padding: 1px 5px; font-size: 0.86em; }
    .nt-md a { color: var(--primary); }
    .nt-md strong { font-weight: 700; }

    .nt-view-title { margin: 0 0 4px; font-size: 1.2rem; overflow-wrap: break-word; }
    .nt-view-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .nt-chip-link { cursor: pointer; }
    .nt-chip-link:hover { filter: brightness(1.1); }
    .nt-audio { width: 100%; margin: 10px 0 4px; }
    .nt-view-actions { margin-top: 14px; }

    .nt-title-input { margin-bottom: 8px; font-weight: 600; }
    .nt-body { min-height: 40vh; }
    .nt-editrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .nt-preview { border: 1px dashed var(--border); border-radius: 10px;
      background: var(--surface-2); padding: 10px 12px; margin-top: 8px; }
    .nt-preview-empty { color: var(--text-muted); font-style: italic; }
    .nt-label { display: block; font-size: 0.82rem; color: var(--text-muted);
      font-weight: 600; margin: 10px 0 4px; }
    .nt-actions { margin-top: 12px; }
    .nt-empty-body { color: var(--text-muted); font-style: italic; }
  `);

  /* ---------- Modul-Zustand (überlebt Re-Renders) ---------- */
  let mode = 'list';       // 'list' | 'view' | 'edit'
  let currentId = null;    // Notiz-ID in Ansicht/Bearbeitung (null = neue Notiz)
  let draft = null;        // {title, body, linkTo} — ungespeicherter Editor-Entwurf
  let showPreview = false; // Vorschau im Editor sichtbar?
  let rootEl = null;

  /* ---------- Hilfen ---------- */
  function nowISO() { return new Date().toISOString(); }

  function sortedNotes() {
    return Store.all('notes').slice().sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  }

  function noteDraftOf(n) {
    return {
      title: n.title || '',
      body: n.body || '',
      linkTo: (n.linkTo && n.linkTo.type && n.linkTo.id)
        ? { type: n.linkTo.type, id: n.linkTo.id } : null
    };
  }

  // Erste sinnvolle Zeile des Textes als Klartext (Markdown-Zeichen entfernt)
  function previewText(body) {
    let line = '';
    for (const l of String(body || '').split(/\r?\n/)) {
      if (l.trim()) { line = l.trim(); break; }
    }
    line = line
      .replace(/^#{1,3}\s+/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*`]/g, '');
    if (line.length > 90) line = line.slice(0, 90) + '…';
    return line;
  }

  // Verknüpfungsziel auflösen (verwaiste Verweise abfangen)
  function linkInfo(linkTo) {
    if (!linkTo || !linkTo.type || !linkTo.id) return null;
    if (linkTo.type === 'task') {
      const t = Store.get('tasks', linkTo.id);
      return { icon: '✅', label: t ? t.title : '(gelöscht)', target: t };
    }
    if (linkTo.type === 'event') {
      const ev = Store.get('events', linkTo.id);
      return { icon: '📅', label: ev ? ev.title : '(gelöscht)', target: ev };
    }
    return null;
  }

  function linkChipHtml(linkTo, clickable) {
    const info = linkInfo(linkTo);
    if (!info) return '';
    const cls = 'chip chip-primary' + (clickable && info.target ? ' nt-chip-link' : '');
    return '<span class="' + cls + '" data-nt-link="1">' +
      info.icon + ' ' + Util.esc(info.label) + '</span>';
  }

  function navigateToLink(linkTo) {
    const info = linkInfo(linkTo);
    if (!info || !info.target) return;
    if (linkTo.type === 'task') App.navigate('aufgaben', { taskId: linkTo.id });
    else App.navigate('kalender', { date: info.target.date });
  }

  /* ---------- Parameter (nur beim ersten Rendern nach navigate) ---------- */
  function applyParams(p) {
    if (p.edit) {
      showPreview = false;
      if (p.noteId) {
        const n = Store.get('notes', p.noteId);
        if (n) { mode = 'edit'; currentId = n.id; draft = noteDraftOf(n); }
        else { mode = 'list'; currentId = null; draft = null; }
      } else {
        mode = 'edit';
        currentId = null;
        draft = {
          title: '', body: '',
          linkTo: (p.linkTo && p.linkTo.type && p.linkTo.id)
            ? { type: p.linkTo.type, id: p.linkTo.id } : null
        };
      }
    } else if (p.noteId) {
      mode = 'view';
      currentId = p.noteId;
    }
  }

  /* ---------- Rendern ---------- */
  function paint() {
    if (!rootEl) return;
    // Verwaiste Zustände abfangen (Notiz wurde z. B. gelöscht)
    if (mode === 'view' && (!currentId || !Store.get('notes', currentId))) {
      mode = 'list'; currentId = null;
    }
    if (mode === 'edit' && !draft) {
      const n = currentId ? Store.get('notes', currentId) : null;
      if (n) draft = noteDraftOf(n);
      else { mode = 'list'; currentId = null; }
    }
    if (mode === 'view') paintView();
    else if (mode === 'edit') paintEdit();
    else paintList();
  }

  /* ---------- LISTE ---------- */
  function paintList() {
    const notes = sortedNotes();
    let html = '<div class="btn-row" style="margin-bottom:12px">' +
      '<button class="btn btn-primary" id="nt-new">+ Neue Notiz</button></div>';

    if (!notes.length) {
      html += '<div class="card"><div class="empty-state"><span class="big">📝</span>' +
        'Noch keine Notizen — leg mit „+ Neue Notiz" los oder sortiere einen Gedanken aus dem Eingang hierher.</div></div>';
    } else {
      html += '<div class="card"><ul class="list">' + notes.map(n => {
        const prev = previewText(n.body);
        const dateIso = String(n.updatedAt || n.createdAt || '').slice(0, 10);
        return '<li class="list-item nt-row" data-id="' + Util.esc(n.id) + '">' +
          '<div class="nt-row-main">' +
          '<div class="nt-row-title">' + Util.esc(n.title || 'Ohne Titel') + '</div>' +
          (prev ? '<div class="nt-row-preview">' + Util.esc(prev) + '</div>' : '') +
          '<div class="nt-row-meta small">' +
          '<span class="muted">' + Util.esc(Util.fmtDateRel(dateIso)) + '</span>' +
          linkChipHtml(n.linkTo, false) +
          (n.audio ? '<span class="nt-mic-mark" title="Sprachnotiz vorhanden">🎤</span>' : '') +
          '</div></div></li>';
      }).join('') + '</ul></div>';
    }

    rootEl.innerHTML = html;

    rootEl.querySelector('#nt-new').addEventListener('click', () => {
      mode = 'edit'; currentId = null; showPreview = false;
      draft = { title: '', body: '', linkTo: null };
      paint();
    });
    rootEl.querySelectorAll('.nt-row').forEach(li => {
      li.addEventListener('click', () => {
        mode = 'view'; currentId = li.dataset.id;
        paint();
      });
    });
  }

  /* ---------- ANSICHT ---------- */
  function paintView() {
    const n = Store.get('notes', currentId);
    const dateIso = String(n.updatedAt || n.createdAt || '').slice(0, 10);
    const bodyHtml = String(n.body || '').trim()
      ? Util.mdToHtml(n.body)
      : '<p class="nt-empty-body">Kein Text.</p>';

    rootEl.innerHTML =
      '<div class="card">' +
      '<h2 class="nt-view-title">' + Util.esc(n.title || 'Ohne Titel') + '</h2>' +
      '<div class="nt-view-meta small">' +
      '<span class="muted">Aktualisiert: ' + Util.esc(Util.fmtDateRel(dateIso)) + '</span>' +
      linkChipHtml(n.linkTo, true) +
      '</div>' +
      '<div class="nt-md">' + bodyHtml + '</div>' +
      (n.audio
        ? '<audio class="nt-audio" controls src="' + Util.esc(n.audio) + '"></audio>'
        : '') +
      '<div class="btn-row nt-view-actions">' +
      '<button class="btn btn-primary" id="nt-edit">Bearbeiten</button>' +
      '<button class="btn btn-danger" id="nt-del">Löschen</button>' +
      '<button class="btn" id="nt-back">Zurück</button>' +
      '</div></div>';

    const chip = rootEl.querySelector('[data-nt-link]');
    if (chip && chip.classList.contains('nt-chip-link')) {
      chip.addEventListener('click', () => navigateToLink(n.linkTo));
    }

    rootEl.querySelector('#nt-edit').addEventListener('click', () => {
      mode = 'edit'; showPreview = false;
      draft = noteDraftOf(n);
      paint();
    });
    rootEl.querySelector('#nt-del').addEventListener('click', async () => {
      if (!await App.confirm('Diese Notiz wirklich löschen?')) return;
      const id = currentId;
      mode = 'list'; currentId = null; draft = null;
      Store.remove('notes', id); // löst das Neu-Rendern aus
      App.toast('Notiz gelöscht.');
    });
    rootEl.querySelector('#nt-back').addEventListener('click', () => {
      mode = 'list'; currentId = null;
      paint();
    });
  }

  /* ---------- EDITOR ---------- */
  function linkOptionsHtml(selected) {
    const selVal = selected ? selected.type + ':' + selected.id : '';
    let html = '<option value=""' + (selVal === '' ? ' selected' : '') + '>Keine Verknüpfung</option>';

    // Verwaistes Ziel: Auswahl trotzdem anzeigen, nicht verwerfen
    if (selected && !(linkInfo(selected) && linkInfo(selected).target)) {
      html += '<option value="' + Util.esc(selVal) + '" selected>(gelöschte Verknüpfung)</option>';
    }

    const tasks = Store.all('tasks').slice();
    const open = tasks.filter(t => t.status !== 'erledigt');
    const done = tasks.filter(t => t.status === 'erledigt');
    if (open.length || done.length) {
      html += '<optgroup label="Aufgaben">' +
        open.concat(done).map(t => {
          const v = 'task:' + t.id;
          return '<option value="' + Util.esc(v) + '"' + (v === selVal ? ' selected' : '') + '>' +
            Util.esc(t.title || 'Ohne Titel') +
            (t.status === 'erledigt' ? ' (erledigt)' : '') + '</option>';
        }).join('') + '</optgroup>';
    }

    const today = Util.todayISO();
    const events = Store.all('events').slice();
    const upcoming = events.filter(ev => String(ev.date || '') >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const past = events.filter(ev => String(ev.date || '') < today)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (upcoming.length || past.length) {
      html += '<optgroup label="Termine">' +
        upcoming.concat(past).map(ev => {
          const v = 'event:' + ev.id;
          return '<option value="' + Util.esc(v) + '"' + (v === selVal ? ' selected' : '') + '>' +
            Util.esc(ev.title || 'Ohne Titel') +
            (ev.date ? ' (' + Util.esc(Util.fmtDate(ev.date)) + ')' : '') + '</option>';
        }).join('') + '</optgroup>';
    }
    return html;
  }

  function paintEdit() {
    const isNew = !currentId || !Store.get('notes', currentId);
    const existing = !isNew ? Store.get('notes', currentId) : null;

    rootEl.innerHTML =
      '<div class="card">' +
      '<h2>' + (isNew ? 'Neue Notiz' : 'Notiz bearbeiten') + '</h2>' +
      '<input class="input nt-title-input" id="nt-in-title" placeholder="Titel" maxlength="200">' +
      '<textarea class="input nt-body" id="nt-in-body" placeholder="Dein Text… (Markdown: # Überschrift, - Liste, **fett**)"></textarea>' +
      '<div class="nt-editrow">' +
      '<span id="nt-mic-slot"></span>' +
      '<button class="btn btn-sm" id="nt-toggle-preview">' +
      (showPreview ? 'Vorschau ausblenden' : 'Vorschau') + '</button>' +
      '</div>' +
      '<div class="nt-preview nt-md" id="nt-preview"' + (showPreview ? '' : ' hidden') + '></div>' +
      '<label class="nt-label" for="nt-in-link">Verknüpfung</label>' +
      '<select class="input" id="nt-in-link">' + linkOptionsHtml(draft.linkTo) + '</select>' +
      (existing && existing.audio
        ? '<audio class="nt-audio" controls src="' + Util.esc(existing.audio) + '"></audio>'
        : '') +
      '<div class="btn-row nt-actions">' +
      '<button class="btn btn-primary" id="nt-save">Speichern</button>' +
      '<button class="btn" id="nt-cancel">Abbrechen</button>' +
      '</div></div>';

    const inTitle = rootEl.querySelector('#nt-in-title');
    const inBody = rootEl.querySelector('#nt-in-body');
    const inLink = rootEl.querySelector('#nt-in-link');
    const preview = rootEl.querySelector('#nt-preview');

    // Werte über Properties setzen (nie über innerHTML)
    inTitle.value = draft.title;
    inBody.value = draft.body;

    function updatePreview() {
      if (preview.hidden) return;
      preview.innerHTML = String(draft.body || '').trim()
        ? Util.mdToHtml(draft.body)
        : '<p class="nt-preview-empty">Noch nichts zu sehen — schreib etwas!</p>';
    }
    updatePreview();

    inTitle.addEventListener('input', () => { draft.title = inTitle.value; });
    inBody.addEventListener('input', () => { draft.body = inBody.value; updatePreview(); });
    inLink.addEventListener('change', () => {
      const v = inLink.value;
      if (!v) { draft.linkTo = null; return; }
      const i = v.indexOf(':');
      draft.linkTo = { type: v.slice(0, i), id: v.slice(i + 1) };
    });

    // Mikrofon (Diktat) — dictate.js gehört dem Eingang-Agenten, hier nur nutzen
    if (window.Dictate && Dictate.available) {
      const mic = Dictate.micButton({
        title: 'Diktieren',
        onText(text) {
          const sep = inBody.value && !/\s$/.test(inBody.value) ? ' ' : '';
          inBody.value += sep + text;
          draft.body = inBody.value;
          updatePreview();
        }
      });
      if (mic) rootEl.querySelector('#nt-mic-slot').appendChild(mic);
    }

    rootEl.querySelector('#nt-toggle-preview').addEventListener('click', (e) => {
      showPreview = !showPreview;
      preview.hidden = !showPreview;
      e.target.textContent = showPreview ? 'Vorschau ausblenden' : 'Vorschau';
      updatePreview();
    });

    rootEl.querySelector('#nt-save').addEventListener('click', () => {
      let title = draft.title.trim();
      if (!title) title = previewText(draft.body).slice(0, 60);
      if (!title) title = 'Ohne Titel';
      const patch = {
        title,
        body: draft.body,
        linkTo: draft.linkTo ? { type: draft.linkTo.type, id: draft.linkTo.id } : null,
        updatedAt: nowISO()
      };
      draft = null;
      showPreview = false;
      if (existing) {
        // Zustand VOR der Mutation umstellen — Store rendert synchron neu
        mode = 'view';
        currentId = existing.id;
        Store.update('notes', existing.id, patch);
      } else {
        const added = Store.add('notes', patch); // rendert zunächst die Liste
        mode = 'view';
        currentId = added.id;
        paint();
      }
      App.toast('Notiz gespeichert.');
    });

    rootEl.querySelector('#nt-cancel').addEventListener('click', () => {
      draft = null;
      showPreview = false;
      if (existing) mode = 'view';
      else { mode = 'list'; currentId = null; }
      paint();
    });
  }

  /* ---------- Registrierung ---------- */
  App.registerView('notizen', {
    title: 'Notizen',
    icon: '📝',
    order: 6,
    render(el, params) {
      rootEl = el;
      if (params) applyParams(params);
      paint();
    }
  });
})();
