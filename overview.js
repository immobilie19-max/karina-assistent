/* Karina Assistent — Übersicht: ALLES lesbar an einem Ort.
   Heute Fälliges, offene Aufgaben, nächste Termine, neueste Notizen und
   die Fokus-Bilanz der Woche — jeder Eintrag antippbar. */
(function () {
  'use strict';

  Util.injectCSS('overview', `
    .ov-row { cursor: pointer; border-radius: 8px; }
    .ov-row:hover { background: var(--surface-2); }
    .ov-main { flex: 1; min-width: 0; }
    .ov-title { font-weight: 600; overflow-wrap: anywhere; }
    .ov-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 3px; }
    .ov-check { width: 20px; height: 20px; flex: none; margin-top: 2px; accent-color: var(--primary); cursor: pointer; }
    .ov-chip-overdue { background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); }
    .ov-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 10px; }
    .ov-head h2 { margin: 0; }
    .ov-group { list-style: none; padding: 10px 2px 4px; font-size: 0.78rem; font-weight: 700; color: var(--text-muted); }
    .ov-time { flex: none; min-width: 46px; font-weight: 700; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .ov-sum { display: flex; align-items: center; gap: 10px; }
    .ov-bars { display: flex; align-items: flex-end; gap: 8px; height: 72px; margin: 12px 2px 2px; }
    .ov-bar-col { flex: 1; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; }
    .ov-bar { width: 100%; max-width: 34px; border-radius: 4px 4px 2px 2px;
      background: color-mix(in srgb, var(--primary) 45%, var(--surface-2)); }
    .ov-bar.ov-bar-leer { background: var(--surface-2); }
    .ov-bar-col.ov-heute .ov-bar { background: var(--primary); }
    .ov-bar-label { font-size: 0.68rem; color: var(--text-muted); }
    .ov-bar-col.ov-heute .ov-bar-label { color: var(--primary); font-weight: 700; }
  `);

  /* ---------- Helfer ---------- */

  function isDone(t) { return t.status === 'erledigt'; }

  function prioChip(t) {
    const label = Util.PRIO_LABELS[t.priority];
    if (!label) return '';
    return '<span class="chip chip-prio-' + Util.esc(t.priority) + '">' + Util.esc(label) + '</span>';
  }

  function statusChip(t) {
    const label = Util.STATUS_LABELS[t.status] || t.status || '';
    return '<span class="chip">' + Util.esc(label) + '</span>';
  }

  function byDueThenPrio(a, b) {
    if (a.due !== b.due) return String(a.due) < String(b.due) ? -1 : 1;
    return (a.priority || 2) - (b.priority || 2);
  }

  // Wochentag-Sitzungen: lokales Datum der Sitzung (nie toISOString!)
  function sessionDay(s) {
    return Util.isoOf(new Date(s.startedAt || s.createdAt));
  }

  /* ---------- Karte 1: Eingang ---------- */

  function inboxCard() {
    const n = Store.all('inbox').length;
    if (n === 0) return '';
    const text = n === 1 ? '1 unsortierter Gedanke' : n + ' unsortierte Gedanken';
    return '<div class="card">' +
      '<h2>Eingang</h2>' +
      '<div class="ov-sum ov-row" data-nav="eingang">' +
      '<div class="ov-main">📥 <strong>' + Util.esc(text) + '</strong></div>' +
      '<button class="btn btn-primary btn-sm" data-nav="eingang">Jetzt sortieren</button>' +
      '</div></div>';
  }

  /* ---------- Karte 2: Heute ---------- */

  function taskRowHtml(t, opts) {
    const chips = [];
    if (opts.overdue) {
      chips.push('<span class="chip ov-chip-overdue">Überfällig</span>');
      chips.push('<span class="small muted">' + Util.esc(Util.fmtDate(t.due)) + '</span>');
    } else if (opts.dueLabel && t.due) {
      chips.push('<span class="small' + (opts.overdueDate ? '' : ' muted') + '">' + Util.esc(Util.fmtDateRel(t.due)) + '</span>');
    }
    chips.push(prioChip(t));
    if (opts.status) chips.push(statusChip(t));
    return '<li class="list-item">' +
      '<input type="checkbox" class="ov-check" data-id="' + Util.esc(t.id) + '"' +
      (isDone(t) ? ' checked' : '') + ' aria-label="Aufgabe erledigt">' +
      '<div class="ov-main ov-row" data-nav="aufgaben" data-taskid="' + Util.esc(t.id) + '">' +
      '<div class="ov-title' + (isDone(t) ? ' done-text' : '') + '">' + Util.esc(t.title || '(ohne Titel)') + '</div>' +
      '<div class="ov-meta">' + chips.filter(Boolean).join(' ') + '</div>' +
      '</div></li>';
  }

  function heuteCard(today) {
    const tasks = Store.all('tasks');
    const overdue = tasks.filter(t => !isDone(t) && t.due && t.due < today).sort(byDueThenPrio);
    const dueToday = tasks.filter(t => t.due === today)
      .sort((a, b) => (isDone(a) - isDone(b)) || byDueThenPrio(a, b));
    const events = Store.all('events').filter(e => e.date === today)
      .sort((a, b) => String(a.time || '') < String(b.time || '') ? -1 : 1);
    const sessions = Store.all('sessions').filter(s => sessionDay(s) === today);
    const sessMin = sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);

    let body;
    if (!overdue.length && !dueToday.length && !events.length && !sessions.length) {
      body = '<div class="empty-state">Heute ist nichts fällig — freier Kopf! 🎉</div>';
    } else {
      const rows = [];
      for (const t of overdue) rows.push(taskRowHtml(t, { overdue: true }));
      for (const t of dueToday) rows.push(taskRowHtml(t, {}));
      for (const e of events) {
        rows.push('<li class="list-item ov-row" data-nav="kalender" data-date="' + Util.esc(e.date) + '">' +
          '<span class="ov-time">' + Util.esc(e.time || '📅') + '</span>' +
          '<div class="ov-main"><div class="ov-title">' + Util.esc(e.title || '(ohne Titel)') + '</div>' +
          '<div class="ov-meta"><span class="chip chip-primary">Termin</span></div></div></li>');
      }
      if (sessions.length) {
        rows.push('<li class="list-item ov-row" data-nav="timer">' +
          '<span class="ov-time">⏱️</span><div class="ov-main"><div class="ov-title">' +
          Util.esc(sessions.length === 1 ? '1 Fokus-Sitzung' : sessions.length + ' Fokus-Sitzungen') +
          '</div><div class="ov-meta"><span class="small muted">' + Util.esc(Util.fmtMinutes(sessMin)) +
          ' fokussiert</span></div></div></li>');
      }
      body = '<ul class="list">' + rows.join('') + '</ul>';
    }
    return '<div class="card"><h2>Heute</h2>' + body + '</div>';
  }

  /* ---------- Karte 3: Offene Aufgaben ---------- */

  function offeneCard(today) {
    const open = Store.all('tasks').filter(t => !isDone(t));
    const overdue = open.filter(t => t.due && t.due < today).sort(byDueThenPrio);
    const dated = open.filter(t => t.due && t.due >= today).sort(byDueThenPrio);
    const undated = open.filter(t => !t.due)
      .sort((a, b) => (a.priority || 2) - (b.priority || 2));

    let body;
    if (!open.length) {
      body = '<div class="empty-state">Keine offenen Aufgaben — alles erledigt! ✨</div>';
    } else {
      const rows = [];
      for (const t of overdue) rows.push(taskRowHtml(t, { overdue: true, status: true }));
      for (const t of dated) rows.push(taskRowHtml(t, { dueLabel: true, status: true }));
      for (const t of undated) rows.push(taskRowHtml(t, { status: true }));
      body = '<ul class="list">' + rows.join('') + '</ul>';
    }
    return '<div class="card"><h2>Offene Aufgaben (' + open.length + ')</h2>' + body + '</div>';
  }

  /* ---------- Karte 4: Nächste Termine ---------- */

  function termineCard(today) {
    const until = Util.addDays(today, 14);
    const events = Store.all('events')
      .filter(e => e.date && e.date >= today && e.date <= until)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return String(a.time || '') < String(b.time || '') ? -1 : 1;
      });

    let body;
    if (!events.length) {
      body = '<div class="empty-state">Keine Termine in den nächsten 14 Tagen.</div>';
    } else {
      const rows = [];
      let lastDate = null;
      for (const e of events) {
        if (e.date !== lastDate) {
          rows.push('<li class="ov-group">' + Util.esc(Util.fmtDateRel(e.date)) + '</li>');
          lastDate = e.date;
        }
        rows.push('<li class="list-item ov-row" data-nav="kalender" data-date="' + Util.esc(e.date) + '">' +
          '<span class="ov-time">' + Util.esc(e.time || '—') + '</span>' +
          '<div class="ov-main"><div class="ov-title">' + Util.esc(e.title || '(ohne Titel)') + '</div></div></li>');
      }
      body = '<ul class="list">' + rows.join('') + '</ul>';
    }
    return '<div class="card"><h2>Nächste Termine</h2>' + body + '</div>';
  }

  /* ---------- Karte 5: Notizen ---------- */

  function linkChip(linkTo) {
    if (!linkTo || !linkTo.id) return '';
    let label;
    if (linkTo.type === 'task') {
      const t = Store.get('tasks', linkTo.id);
      label = '✅ ' + (t ? (t.title || '(ohne Titel)') : '(gelöscht)');
    } else if (linkTo.type === 'event') {
      const e = Store.get('events', linkTo.id);
      label = '📅 ' + (e ? (e.title || '(ohne Titel)') : '(gelöscht)');
    } else {
      return '';
    }
    return '<span class="chip chip-primary">' + Util.esc(label) + '</span>';
  }

  function notizenCard() {
    const notes = Store.all('notes').slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || '')
        .localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, 5);

    let body;
    if (!notes.length) {
      body = '<div class="empty-state">Noch keine Notizen — halte deine Gedanken fest!</div>';
    } else {
      const rows = notes.map(n => {
        const ts = n.updatedAt || n.createdAt;
        const rel = ts ? Util.fmtDateRel(Util.isoOf(new Date(ts))) : '';
        return '<li class="list-item ov-row" data-nav="notizen" data-noteid="' + Util.esc(n.id) + '">' +
          '<div class="ov-main"><div class="ov-title">📝 ' + Util.esc(n.title || '(ohne Titel)') + '</div>' +
          '<div class="ov-meta"><span class="small muted">' + Util.esc(rel) + '</span>' +
          linkChip(n.linkTo) + '</div></div></li>';
      });
      body = '<ul class="list">' + rows.join('') + '</ul>';
    }
    return '<div class="card"><div class="ov-head"><h2>Notizen</h2>' +
      '<button class="btn btn-sm" data-nav="notizen">Alle Notizen</button></div>' + body + '</div>';
  }

  /* ---------- Karte 6: Fokus diese Woche ---------- */

  function fokusCard(today) {
    const d = Util.parseISO(today);
    const mondayISO = Util.addDays(today, -((d.getDay() + 6) % 7));
    const week = [];
    for (let i = 0; i < 7; i++) week.push(Util.addDays(mondayISO, i));

    const perDay = {};
    for (const day of week) perDay[day] = 0;
    let count = 0, total = 0;
    for (const s of Store.all('sessions')) {
      const day = sessionDay(s); // lokales Datum!
      if (Object.prototype.hasOwnProperty.call(perDay, day)) {
        perDay[day] += (s.minutes || 0);
        total += (s.minutes || 0);
        count++;
      }
    }

    const max = Math.max(1, ...week.map(day => perDay[day]));
    const BAR_MAX = 46;
    const bars = week.map((day, i) => {
      const min = perDay[day];
      const h = min > 0 ? Math.max(4, Math.round(min / max * BAR_MAX)) : 2;
      return '<div class="ov-bar-col' + (day === today ? ' ov-heute' : '') + '">' +
        '<div class="ov-bar' + (min > 0 ? '' : ' ov-bar-leer') + '" style="height:' + h + 'px" ' +
        'title="' + Util.esc(Util.WOCHENTAGE[i] + ': ' + Util.fmtMinutes(min)) + '"></div>' +
        '<div class="ov-bar-label">' + Util.esc(Util.WOCHENTAGE_KURZ[i]) + '</div></div>';
    }).join('');

    const summary = count > 0
      ? '<strong>' + Util.esc(count === 1 ? '1 Sitzung' : count + ' Sitzungen') + '</strong>' +
        ' <span class="muted">·</span> ' + Util.esc(Util.fmtMinutes(total)) + ' fokussiert'
      : '<span class="muted">Diese Woche noch keine Fokus-Sitzungen.</span>';

    return '<div class="card"><div class="ov-head"><h2>Fokus diese Woche</h2>' +
      '<button class="btn btn-sm" data-nav="timer">▶ Timer</button></div>' +
      '<p class="small" style="margin:0">' + summary + '</p>' +
      '<div class="ov-bars">' + bars + '</div></div>';
  }

  /* ---------- Aktionen ---------- */

  function toggleTask(id) {
    const t = Store.get('tasks', id);
    if (!t) { App.toast('(gelöschte Aufgabe)'); return; }
    if (isDone(t)) {
      Store.update('tasks', id, { status: t.due ? 'geplant' : 'eingang', completedAt: null });
      App.toast('Aufgabe wieder offen.');
    } else {
      Store.update('tasks', id, { status: 'erledigt', completedAt: new Date().toISOString() });
      App.toast('Aufgabe erledigt. 🎉');
    }
  }

  /* ---------- Ansicht ---------- */

  App.registerView('uebersicht', {
    title: 'Übersicht',
    icon: '🏠',
    order: 2,
    render(el) {
      const today = Util.todayISO();
      el.innerHTML =
        inboxCard() +
        heuteCard(today) +
        offeneCard(today) +
        termineCard(today) +
        notizenCard() +
        fokusCard(today);

      // Checkbox: erledigt umschalten (nicht navigieren)
      el.querySelectorAll('.ov-check').forEach(c => {
        c.addEventListener('click', (ev) => {
          ev.stopPropagation();
          toggleTask(c.dataset.id);
        });
      });

      // Alles Antippbare navigiert zur jeweiligen Ansicht
      el.querySelectorAll('[data-nav]').forEach(node => {
        node.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const ds = node.dataset;
          const params = {};
          if (ds.taskid) params.taskId = ds.taskid;
          if (ds.noteid) params.noteId = ds.noteid;
          if (ds.date) params.date = ds.date;
          App.navigate(ds.nav, Object.keys(params).length ? params : undefined);
        });
      });
    }
  });
})();
