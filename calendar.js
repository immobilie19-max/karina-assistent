/* Karina Assistent — Kalender: Monatsraster (Mo zuerst) + Tagesdetail.
   Zeigt Termine, fällige Aufgaben und Fokus-Sitzungen; legt Aufgaben/Termine
   direkt am Tag an. Alle Datumsangaben LOKAL über Util.isoOf/Util.parseISO. */
(function () {
  'use strict';

  Util.injectCSS('calendar', `
    .cal-head { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
    .cal-title { flex: 1; text-align: center; font-weight: 700; font-size: 1rem; }
    .cal-nav { min-width: 36px; justify-content: center; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
    .cal-weekdays { margin-bottom: 4px; }
    .cal-wd { text-align: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }
    .cal-day {
      appearance: none; font: inherit; color: var(--text);
      background: var(--surface-2); border: 1px solid transparent; border-radius: 8px;
      min-height: 44px; padding: 4px 1px 3px; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
    }
    .cal-day:hover { border-color: var(--border); }
    .cal-num { font-size: 0.8rem; font-weight: 600; line-height: 1; }
    .cal-out { opacity: 0.38; }
    .cal-today { outline: 2px solid var(--primary); outline-offset: -2px; }
    .cal-sel { background: var(--primary); color: var(--primary-contrast); }
    .cal-dots { display: flex; gap: 2px; height: 5px; }
    .cal-dot { width: 5px; height: 5px; border-radius: 50%; }
    .cal-dot-event { background: var(--primary); }
    .cal-dot-task { background: var(--warn); }
    .cal-dot-task-done { background: var(--ok); }
    .cal-dot-session { background: var(--text-muted); }
    .cal-sel .cal-dot { background: var(--primary-contrast); }
    .cal-detail-head { display: flex; align-items: center; justify-content: space-between;
      gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .cal-detail-head h2 { margin: 0; }
    .cal-sec { margin: 12px 0 2px; font-size: 0.78rem; font-weight: 700;
      color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .cal-ev-form { background: var(--surface-2); border-radius: 10px; padding: 10px; margin: 8px 0; }
    .cal-ev-form .btn-row { margin-top: 8px; }
    .cal-item-main { flex: 1; min-width: 0; }
    .cal-item-title { overflow-wrap: anywhere; }
    .cal-link { appearance: none; background: none; border: none; padding: 0;
      font: inherit; color: inherit; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
    .cal-link:hover { text-decoration: underline; }
    .cal-note-link { display: block; margin-top: 3px; color: var(--primary); font-size: 0.82rem; }
    .cal-item-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
    .cal-check { width: 20px; height: 20px; margin-top: 1px; flex: none; accent-color: var(--primary); }
  `);

  /* ---------- Langlebiger Zustand (überlebt Re-Renders) ---------- */
  let viewYear = null;    // angezeigtes Jahr
  let viewMonth = null;   // angezeigter Monat (0-basiert)
  let selectedISO = Util.todayISO();
  let formOpen = false;   // Inline-Formular „+ Termin" offen?

  function showMonthOf(iso) {
    const d = Util.parseISO(iso);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
  }

  /* ---------- Daten je Tag sammeln ---------- */
  function collectMaps() {
    const events = {}, tasks = {}, sessions = {};
    for (const ev of Store.all('events')) {
      if (!ev.date) continue;
      (events[ev.date] = events[ev.date] || []).push(ev);
    }
    for (const t of Store.all('tasks')) {
      if (!t.due) continue;
      (tasks[t.due] = tasks[t.due] || []).push(t);
    }
    for (const s of Store.all('sessions')) {
      if (!s.startedAt) continue;
      const iso = Util.isoOf(new Date(s.startedAt)); // LOKALES Datum, nie toISOString!
      (sessions[iso] = sessions[iso] || []).push(s);
    }
    return { events, tasks, sessions };
  }

  /* ---------- Monatsraster ---------- */
  function gridHtml(maps) {
    const todayISO = Util.todayISO();
    const startOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mo=0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    let html = '<div class="cal-grid cal-weekdays">' +
      Util.WOCHENTAGE_KURZ.map(w => '<div class="cal-wd">' + w + '</div>').join('') +
      '</div><div class="cal-grid">';

    for (let i = 0; i < cellCount; i++) {
      const d = new Date(viewYear, viewMonth, 1 - startOffset + i);
      const iso = Util.isoOf(d);
      const cls = ['cal-day'];
      if (d.getMonth() !== viewMonth) cls.push('cal-out');
      if (iso === todayISO) cls.push('cal-today');
      if (iso === selectedISO) cls.push('cal-sel');

      let dots = '';
      if (maps.events[iso]) dots += '<i class="cal-dot cal-dot-event"></i>';
      const dayTasks = maps.tasks[iso];
      if (dayTasks) {
        const allDone = dayTasks.every(t => t.status === 'erledigt');
        dots += '<i class="cal-dot ' + (allDone ? 'cal-dot-task-done' : 'cal-dot-task') + '"></i>';
      }
      if (maps.sessions[iso]) dots += '<i class="cal-dot cal-dot-session"></i>';

      html += '<button type="button" class="' + cls.join(' ') + '" data-act="select" data-date="' + iso + '"' +
        ' aria-label="' + Util.fmtDate(iso) + '">' +
        '<span class="cal-num">' + d.getDate() + '</span>' +
        '<span class="cal-dots">' + dots + '</span></button>';
    }
    return html + '</div>';
  }

  /* ---------- Tagesdetail ---------- */
  function detailHtml(maps) {
    const evs = (maps.events[selectedISO] || []).slice()
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const tasks = (maps.tasks[selectedISO] || []).slice()
      .sort((a, b) => (a.priority || 2) - (b.priority || 2));
    const sess = (maps.sessions[selectedISO] || []).slice()
      .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));

    let html = '<div class="cal-detail-head"><h2>' + Util.esc(Util.fmtDateRel(selectedISO)) + '</h2>' +
      '<div class="btn-row">' +
      '<button type="button" class="btn btn-sm" data-act="add-task">+ Aufgabe</button>' +
      '<button type="button" class="btn btn-sm" data-act="add-event">+ Termin</button>' +
      '</div></div>';

    html += '<form class="cal-ev-form" data-form="event"' + (formOpen ? '' : ' hidden') + '>' +
      '<div class="form-row">' +
      '<label>Titel<input type="text" name="title" maxlength="200" placeholder="z. B. Zahnarzt" required></label>' +
      '<label>Uhrzeit (optional)<input type="time" name="time"></label>' +
      '</div><div class="btn-row">' +
      '<button type="submit" class="btn btn-primary btn-sm">Termin anlegen</button>' +
      '<button type="button" class="btn btn-sm" data-act="cancel-event">Abbrechen</button>' +
      '</div></form>';

    if (!evs.length && !tasks.length && !sess.length) {
      return html + '<div class="empty-state"><span class="big">🗓️</span>Nichts an diesem Tag.</div>';
    }

    if (evs.length) {
      html += '<div class="cal-sec">Termine</div><ul class="list">';
      for (const ev of evs) {
        const notes = Store.all('notes').filter(n =>
          n.linkTo && n.linkTo.type === 'event' && n.linkTo.id === ev.id);
        html += '<li class="list-item"><div class="cal-item-main">' +
          '<div class="cal-item-title">' +
          (ev.time ? '<span class="chip chip-primary">' + Util.esc(ev.time) + '</span> ' : '') +
          '<strong>' + Util.esc(ev.title || '(ohne Titel)') + '</strong></div>' +
          notes.map(n =>
            '<button type="button" class="cal-link cal-note-link" data-act="open-note" data-id="' + Util.esc(n.id) + '">' +
            '📝 ' + Util.esc(n.title || 'Ohne Titel') + '</button>').join('') +
          '</div><div class="cal-item-actions">' +
          '<button type="button" class="btn btn-sm" data-act="event-note" data-id="' + Util.esc(ev.id) + '">+ Notiz</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="event-del" data-id="' + Util.esc(ev.id) + '">Löschen</button>' +
          '</div></li>';
      }
      html += '</ul>';
    }

    if (tasks.length) {
      html += '<div class="cal-sec">Fällige Aufgaben</div><ul class="list">';
      for (const t of tasks) {
        const done = t.status === 'erledigt';
        html += '<li class="list-item">' +
          '<input type="checkbox" class="cal-check" data-act="task-toggle" data-id="' + Util.esc(t.id) + '"' +
          (done ? ' checked' : '') + ' aria-label="Erledigt umschalten">' +
          '<div class="cal-item-main"><button type="button" class="cal-link' + (done ? ' done-text' : '') +
          '" data-act="open-task" data-id="' + Util.esc(t.id) + '">' +
          Util.esc(t.title || '(ohne Titel)') + '</button></div>' +
          '<span class="chip chip-prio-' + (t.priority || 2) + '">' +
          (Util.PRIO_LABELS[t.priority] || Util.PRIO_LABELS[2]) + '</span></li>';
      }
      html += '</ul>';
    }

    if (sess.length) {
      html += '<div class="cal-sec">Fokus-Sitzungen</div><ul class="list">';
      for (const s of sess) {
        const task = Store.get('tasks', s.taskId); // kann null sein (gelöscht)
        const d = new Date(s.startedAt);
        const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        html += '<li class="list-item"><div class="cal-item-main"><div class="cal-item-title">⏱️ ' +
          (task ? Util.esc(task.title || '(ohne Titel)') : '<span class="muted">(gelöschte Aufgabe)</span>') +
          '</div><div class="muted small">' + time + ' Uhr · ' + Util.fmtMinutes(s.minutes) + '</div>' +
          '</div></li>';
      }
      html += '</ul>';
    }

    return html;
  }

  /* ---------- Zeichnen & Interaktion ---------- */
  function draw(container) {
    // Frischer Wrapper pro Zeichnen: alte Event-Listener werden mit entsorgt
    // (container ist das langlebige #view-root — dort nie direkt Listener anhängen).
    const maps = collectMaps();
    const el = document.createElement('div');
    el.className = 'cal-root';
    el.innerHTML =
      '<div class="card">' +
      '<div class="cal-head">' +
      '<button type="button" class="btn btn-sm cal-nav" data-act="prev" aria-label="Voriger Monat">‹</button>' +
      '<div class="cal-title">' + Util.MONATE[viewMonth] + ' ' + viewYear + '</div>' +
      '<button type="button" class="btn btn-sm cal-nav" data-act="next" aria-label="Nächster Monat">›</button>' +
      '<button type="button" class="btn btn-sm" data-act="today">Heute</button>' +
      '</div>' + gridHtml(maps) + '</div>' +
      '<div class="card">' + detailHtml(maps) + '</div>';
    container.innerHTML = '';
    container.appendChild(el);

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || !el.contains(btn)) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;

      if (act === 'prev' || act === 'next') {
        const d = new Date(viewYear, viewMonth + (act === 'next' ? 1 : -1), 1);
        viewYear = d.getFullYear(); viewMonth = d.getMonth();
        draw(container);
      } else if (act === 'today') {
        selectedISO = Util.todayISO();
        showMonthOf(selectedISO);
        draw(container);
      } else if (act === 'select') {
        selectedISO = btn.dataset.date;
        showMonthOf(selectedISO); // Klick auf Nachbarmonatstag blättert mit
        draw(container);
      } else if (act === 'add-task') {
        App.newTaskOn(selectedISO);
      } else if (act === 'add-event') {
        formOpen = !formOpen;
        const form = el.querySelector('[data-form="event"]');
        if (form) {
          form.hidden = !formOpen;
          if (formOpen) form.querySelector('[name="title"]').focus();
        }
      } else if (act === 'cancel-event') {
        formOpen = false;
        const form = el.querySelector('[data-form="event"]');
        if (form) { form.hidden = true; form.reset(); }
      } else if (act === 'task-toggle') {
        const t = Store.get('tasks', id);
        if (!t) return;
        const done = t.status === 'erledigt';
        Store.update('tasks', id, done
          ? { status: 'geplant', completedAt: null }
          : { status: 'erledigt', completedAt: new Date().toISOString() });
      } else if (act === 'open-task') {
        App.navigate('aufgaben', { taskId: id });
      } else if (act === 'open-note') {
        App.navigate('notizen', { noteId: id });
      } else if (act === 'event-note') {
        App.openNoteEditor({ linkTo: { type: 'event', id: id } });
      } else if (act === 'event-del') {
        const ev = Store.get('events', id);
        if (!ev) return;
        App.confirm('Termin „' + (ev.title || '(ohne Titel)') + '“ wirklich löschen?').then(ok => {
          if (ok) { Store.remove('events', id); App.toast('Termin gelöscht.'); }
        });
      }
    });

    const form = el.querySelector('[data-form="event"]');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = form.querySelector('[name="title"]').value.trim();
        if (!title) return;
        const time = form.querySelector('[name="time"]').value || '';
        formOpen = false;
        Store.add('events', { title: title, date: selectedISO, time: time });
        App.toast('Termin angelegt.');
        // Store.add rendert die Ansicht neu — Formular ist danach geschlossen.
      });
    }
  }

  /* ---------- Ansicht registrieren ---------- */
  App.registerView('kalender', {
    title: 'Kalender', icon: '📅', order: 5,
    render(el, params) {
      if (params && /^\d{4}-\d{2}-\d{2}$/.test(String(params.date || ''))) {
        selectedISO = params.date;
        showMonthOf(selectedISO);
        formOpen = false;
      }
      if (viewYear === null) showMonthOf(selectedISO);
      draw(el);
    }
  });
})();
