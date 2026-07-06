/* Karina Assistent — Aufgaben: Liste, Anlegen/Bearbeiten, Abhaken, Fokus & Notizen. */
(function () {
  'use strict';

  Util.injectCSS('tasks', `
    .tk-row { cursor: pointer; }
    .tk-row input[type="checkbox"] {
      width: 20px; height: 20px; margin-top: 2px;
      accent-color: var(--primary); cursor: pointer; flex: 0 0 auto;
    }
    .tk-main { flex: 1 1 auto; min-width: 0; }
    .tk-title { display: block; font-weight: 600; overflow-wrap: anywhere; }
    .tk-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .tk-overdue {
      background: color-mix(in srgb, var(--danger) 15%, transparent);
      color: var(--danger);
    }
    .tk-group-title {
      margin: 14px 0 2px; font-size: 0.78rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted);
    }
    .tk-group-title:first-child { margin-top: 0; }
    .tk-group-title.tk-late { color: var(--danger); }
    .tk-detail {
      margin-top: 10px; padding: 10px;
      background: var(--surface-2); border-radius: 10px; cursor: default;
    }
    .tk-detail h4 {
      margin: 12px 0 4px; font-size: 0.78rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted);
    }
    .tk-note-link {
      display: block; width: 100%; text-align: left; border: none; background: none;
      color: var(--primary); font: inherit; font-size: 0.9rem; cursor: pointer;
      padding: 4px 0; overflow-wrap: anywhere;
    }
    .tk-note-link:hover { text-decoration: underline; }
    .tk-form { margin-top: 12px; }
    .tk-form .btn-row { margin-top: 10px; }
    .tk-done-toggle {
      width: 100%; text-align: left; border: none; background: none; color: var(--text);
      font: inherit; font-weight: 700; font-size: 1.02rem; cursor: pointer; padding: 0;
      display: flex; align-items: center; gap: 8px;
    }
    .tk-done-toggle .tk-caret { color: var(--text-muted); font-size: 0.8rem; }
    @keyframes tk-flash {
      0% { background: color-mix(in srgb, var(--primary) 25%, transparent); }
      100% { background: transparent; }
    }
    .tk-highlight { animation: tk-flash 1.6s ease-out; border-radius: 8px; }
  `);

  /* ---------- Modulzustand (überlebt Neu-Rendern) ---------- */
  let rootEl = null;         // zuletzt gerendertes Wurzelelement
  let expandedId = null;     // ausgeklappte Aufgabe
  let doneOpen = false;      // Erledigt-Bereich aufgeklappt?
  let pendingScrollId = null;// nach dem Rendern hinscrollen + hervorheben
  // Offenes Formular: {mode:'new'|'edit', taskId, values:{title,due,priority,status}}
  let openForm = null;

  function nowISO() { return new Date().toISOString(); }

  function blankValues(due, status) {
    return { title: '', due: due || '', priority: 2, status: status || 'geplant' };
  }

  /* ---------- HTML-Bausteine ---------- */

  function chipsHtml(t) {
    const today = Util.todayISO();
    const done = t.status === 'erledigt';
    const overdue = !done && t.due && t.due < today;
    let h = '<span class="tk-chips">';
    if (t.due) {
      h += '<span class="chip' + (overdue ? ' tk-overdue' : '') + '">' +
        (overdue ? '⚠ ' : '') + Util.esc(Util.fmtDateRel(t.due)) + '</span>';
    }
    h += '<span class="chip chip-prio-' + (Number(t.priority) || 2) + '">' +
      Util.esc(Util.PRIO_LABELS[t.priority] || Util.PRIO_LABELS[2]) + '</span>';
    h += '<span class="chip' + (t.status === 'inarbeit' ? ' chip-primary' : '') + '">' +
      Util.esc(Util.STATUS_LABELS[t.status] || t.status) + '</span>';
    h += '</span>';
    return h;
  }

  function formHtml(f) {
    const v = f.values;
    const prioOpts = [1, 2, 3].map(p =>
      '<option value="' + p + '"' + (Number(v.priority) === p ? ' selected' : '') + '>' +
      Util.esc(Util.PRIO_LABELS[p]) + '</option>').join('');
    const statusOpts = Util.STATUS.map(s =>
      '<option value="' + s + '"' + (v.status === s ? ' selected' : '') + '>' +
      Util.esc(Util.STATUS_LABELS[s]) + '</option>').join('');
    return '' +
      '<form class="tk-form" data-mode="' + Util.esc(f.mode) + '">' +
      '<div class="form-row">' +
      '<label style="flex:1 1 100%">Titel' +
      '<input type="text" name="title" required placeholder="Was ist zu tun?" value="' +
      Util.esc(v.title) + '"></label>' +
      '</div>' +
      '<div class="form-row">' +
      '<label>Fällig am<input type="date" name="due" value="' + Util.esc(v.due) + '"></label>' +
      '<label>Priorität<select name="priority">' + prioOpts + '</select></label>' +
      '<label>Status<select name="status">' + statusOpts + '</select></label>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button type="submit" class="btn btn-primary btn-sm">' +
      (f.mode === 'edit' ? 'Speichern' : 'Aufgabe anlegen') + '</button>' +
      '<button type="button" class="btn btn-sm" data-act="cancel-form">Abbrechen</button>' +
      '</div>' +
      '</form>';
  }

  function detailHtml(t) {
    const notes = Store.all('notes').filter(n =>
      n.linkTo && n.linkTo.type === 'task' && n.linkTo.id === t.id);
    const sessions = Store.all('sessions').filter(s => s.taskId === t.id);
    const minutes = sessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

    let h = '<div class="tk-detail" data-stop="1">';

    if (openForm && openForm.mode === 'edit' && openForm.taskId === t.id) {
      h += formHtml(openForm);
    } else {
      h += '<div class="btn-row">' +
        '<button class="btn btn-sm" data-act="edit">✏️ Bearbeiten</button>' +
        '<button class="btn btn-sm" data-act="focus">▶ Fokus</button>' +
        '<button class="btn btn-sm" data-act="note">+ Notiz</button>' +
        '<button class="btn btn-sm btn-danger" data-act="delete">Löschen</button>' +
        '</div>';
    }

    h += '<h4>Notizen</h4>';
    if (notes.length === 0) {
      h += '<p class="muted small" style="margin:2px 0">Noch keine Notiz verknüpft.</p>';
    } else {
      for (const n of notes) {
        h += '<button class="tk-note-link" data-note="' + Util.esc(n.id) + '">📝 ' +
          Util.esc(n.title || 'Ohne Titel') + '</button>';
      }
    }

    h += '<h4>Fokus-Bilanz</h4>';
    if (sessions.length === 0) {
      h += '<p class="muted small" style="margin:2px 0">Noch keine Fokus-Sitzung.</p>';
    } else {
      h += '<p class="small" style="margin:2px 0">' + sessions.length +
        (sessions.length === 1 ? ' Sitzung' : ' Sitzungen') + ' · ' +
        Util.esc(Util.fmtMinutes(minutes)) + '</p>';
    }

    h += '<p class="muted small" style="margin:8px 0 0">Angelegt: ' +
      Util.esc(Util.fmtDateTime(t.createdAt)) +
      (t.completedAt ? ' · Erledigt: ' + Util.esc(Util.fmtDateTime(t.completedAt)) : '') +
      '</p>';
    h += '</div>';
    return h;
  }

  function rowHtml(t) {
    const done = t.status === 'erledigt';
    const expanded = expandedId === t.id;
    let h = '<li class="list-item tk-row" data-id="' + Util.esc(t.id) + '">' +
      '<input type="checkbox" data-check="1" aria-label="Erledigt"' + (done ? ' checked' : '') + '>' +
      '<div class="tk-main">' +
      '<span class="tk-title' + (done ? ' done-text' : '') + '">' +
      Util.esc(t.title || '(ohne Titel)') + '</span>' +
      chipsHtml(t) +
      (expanded ? detailHtml(t) : '') +
      '</div></li>';
    return h;
  }

  function groupHtml(title, tasks, late) {
    if (tasks.length === 0) return '';
    return '<h3 class="tk-group-title' + (late ? ' tk-late' : '') + '">' + Util.esc(title) +
      ' (' + tasks.length + ')</h3>' +
      '<ul class="list">' + tasks.map(rowHtml).join('') + '</ul>';
  }

  /* ---------- Sortierung & Gruppierung ---------- */

  function sortOpen(a, b) {
    if ((a.due || '') !== (b.due || '')) {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : 1;
    }
    const pa = Number(a.priority) || 2, pb = Number(b.priority) || 2;
    if (pa !== pb) return pa - pb;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  }

  /* ---------- Rendern ---------- */

  function renderView() {
    if (!rootEl) return;
    const today = Util.todayISO();
    const tasks = Store.all('tasks');
    const open = tasks.filter(t => t.status !== 'erledigt').sort(sortOpen);
    const done = tasks.filter(t => t.status === 'erledigt')
      .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));

    const overdue = open.filter(t => t.due && t.due < today);
    const dueToday = open.filter(t => t.due === today);
    const upcoming = open.filter(t => t.due && t.due > today);
    const noDate = open.filter(t => !t.due);

    let h = '<div class="card">' +
      '<div class="btn-row"><button class="btn btn-primary" data-act="new">+ Neue Aufgabe</button></div>' +
      (openForm && openForm.mode === 'new' ? formHtml(openForm) : '') +
      '</div>';

    h += '<div class="card">';
    if (open.length === 0) {
      h += '<div class="empty-state"><span class="big">🌤️</span>' +
        'Keine offenen Aufgaben — genieß den freien Kopf!<br>' +
        '<span class="small">Mit „+ Neue Aufgabe" legst du direkt los.</span></div>';
    } else {
      h += groupHtml('Überfällig', overdue, true) +
        groupHtml('Heute', dueToday, false) +
        groupHtml('Demnächst', upcoming, false) +
        groupHtml('Ohne Datum', noDate, false);
    }
    h += '</div>';

    h += '<div class="card">' +
      '<button class="tk-done-toggle" data-act="toggle-done">' +
      '<span class="tk-caret">' + (doneOpen ? '▼' : '▶') + '</span>' +
      'Erledigt (' + done.length + ')</button>';
    if (doneOpen) {
      h += done.length === 0
        ? '<div class="empty-state small">Hier landet alles, was du abhakst.</div>'
        : '<ul class="list" style="margin-top:8px">' + done.map(rowHtml).join('') + '</ul>';
    }
    h += '</div>';

    rootEl.innerHTML = h;
    wire();

    if (pendingScrollId) {
      const safeId = (window.CSS && CSS.escape) ? CSS.escape(pendingScrollId) : pendingScrollId;
      const target = rootEl.querySelector('.tk-row[data-id="' + safeId + '"]');
      pendingScrollId = null;
      if (target) {
        target.classList.add('tk-highlight');
        setTimeout(() => {
          try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {
            target.scrollIntoView();
          }
        }, 50);
        setTimeout(() => target.classList.remove('tk-highlight'), 1700);
      }
    }
  }

  // Nur-UI-Änderungen (auf-/zuklappen) selbst neu zeichnen —
  // Datenänderungen rendert App über Store.onChange sowieso neu.
  function rerender() {
    if (App.currentView() === 'aufgaben') renderView();
  }

  /* ---------- Aktionen ---------- */

  function submitForm(form) {
    const title = form.elements.title.value.trim();
    if (!title) { App.toast('Bitte einen Titel eingeben.'); form.elements.title.focus(); return; }
    const due = form.elements.due.value || null;
    const priority = Number(form.elements.priority.value) || 2;
    const status = form.elements.status.value;
    const f = openForm;
    openForm = null;
    if (f && f.mode === 'edit' && f.taskId) {
      const existing = Store.get('tasks', f.taskId);
      if (!existing) { App.toast('Diese Aufgabe gibt es nicht mehr.'); rerender(); return; }
      const patch = { title, due, priority, status };
      if (status === 'erledigt' && !existing.completedAt) patch.completedAt = nowISO();
      if (status !== 'erledigt') patch.completedAt = null;
      Store.update('tasks', f.taskId, patch);
      App.toast('Aufgabe gespeichert.');
    } else {
      const item = Store.add('tasks', {
        title, due, priority, status,
        completedAt: status === 'erledigt' ? nowISO() : null
      });
      expandedId = item.id;
      App.toast('Aufgabe angelegt.');
    }
    // Store.add/update haben bereits neu gerendert; falls nicht (kein Wechsel), sicherheitshalber:
    rerender();
  }

  function toggleDone(id, checked) {
    const t = Store.get('tasks', id);
    if (!t) { App.toast('Diese Aufgabe gibt es nicht mehr.'); rerender(); return; }
    if (checked) {
      Store.update('tasks', id, { status: 'erledigt', completedAt: nowISO() });
      App.toast('Erledigt — gut gemacht! ✅');
    } else {
      Store.update('tasks', id, { status: 'geplant', completedAt: null });
      App.toast('Aufgabe wieder geöffnet.');
    }
  }

  async function deleteTask(id) {
    const t = Store.get('tasks', id);
    if (!t) { rerender(); return; }
    const ok = await App.confirm('Aufgabe „' + (t.title || '(ohne Titel)') + '" wirklich löschen?');
    if (!ok) return;
    if (expandedId === id) expandedId = null;
    if (openForm && openForm.taskId === id) openForm = null;
    Store.remove('tasks', id);
    App.toast('Aufgabe gelöscht.');
  }

  /* ---------- Ereignisse verdrahten ---------- */

  function wireForm(form) {
    // Eingaben im Modulzustand mitschreiben, damit ein Neu-Rendern nichts verschluckt.
    form.addEventListener('input', () => {
      if (!openForm) return;
      openForm.values = {
        title: form.elements.title.value,
        due: form.elements.due.value,
        priority: Number(form.elements.priority.value) || 2,
        status: form.elements.status.value
      };
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); submitForm(form); });
    const cancel = form.querySelector('[data-act="cancel-form"]');
    if (cancel) cancel.addEventListener('click', () => { openForm = null; rerender(); });
    const title = form.elements.title;
    if (title && !title.value) title.focus();
  }

  function wire() {
    const newBtn = rootEl.querySelector('[data-act="new"]');
    if (newBtn) newBtn.addEventListener('click', () => {
      openForm = (openForm && openForm.mode === 'new')
        ? null
        : { mode: 'new', taskId: null, values: blankValues('', 'geplant') };
      rerender();
    });

    const doneBtn = rootEl.querySelector('[data-act="toggle-done"]');
    if (doneBtn) doneBtn.addEventListener('click', () => { doneOpen = !doneOpen; rerender(); });

    rootEl.querySelectorAll('form.tk-form').forEach(wireForm);

    rootEl.querySelectorAll('.tk-row').forEach((row) => {
      const id = row.dataset.id;

      const check = row.querySelector('input[data-check]');
      if (check) {
        check.addEventListener('click', (e) => e.stopPropagation());
        check.addEventListener('change', () => toggleDone(id, check.checked));
      }

      row.addEventListener('click', (e) => {
        // Klicks im Detailbereich (Buttons, Formular) nicht als Auf-/Zuklappen werten
        if (e.target.closest('[data-stop]')) return;
        if (expandedId === id) {
          expandedId = null;
          if (openForm && openForm.mode === 'edit' && openForm.taskId === id) openForm = null;
        } else {
          expandedId = id;
        }
        rerender();
      });

      const detail = row.querySelector('.tk-detail');
      if (!detail) return;

      const on = (act, fn) => {
        const b = detail.querySelector('[data-act="' + act + '"]');
        if (b) b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      };
      on('edit', () => {
        const t = Store.get('tasks', id);
        if (!t) { App.toast('Diese Aufgabe gibt es nicht mehr.'); rerender(); return; }
        openForm = {
          mode: 'edit', taskId: id,
          values: {
            title: t.title || '', due: t.due || '',
            priority: Number(t.priority) || 2, status: t.status || 'geplant'
          }
        };
        rerender();
      });
      on('focus', () => App.startFocus(id));
      on('note', () => App.openNoteEditor({ linkTo: { type: 'task', id: id } }));
      on('delete', () => { deleteTask(id); });

      detail.querySelectorAll('[data-note]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          App.navigate('notizen', { noteId: btn.dataset.note });
        });
      });
    });
  }

  /* ---------- Ansicht registrieren ---------- */

  App.registerView('aufgaben', {
    title: 'Aufgaben', icon: '✅', order: 3,
    render(el, params) {
      rootEl = el;
      if (params) {
        if (params.newDue) {
          openForm = { mode: 'new', taskId: null, values: blankValues(String(params.newDue), 'geplant') };
        }
        if (params.taskId) {
          const t = Store.get('tasks', params.taskId);
          if (t) {
            expandedId = t.id;
            pendingScrollId = t.id;
            if (t.status === 'erledigt') doneOpen = true;
          } else {
            App.toast('Diese Aufgabe gibt es nicht mehr (gelöschte Aufgabe).');
          }
        }
      }
      renderView();
    }
  });
})();
