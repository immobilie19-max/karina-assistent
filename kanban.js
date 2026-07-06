/* Karina Assistent — Kanban-Board: Aufgaben als Karten in Status-Spalten.
   Verschieben per Drag & Drop (PC) oder ⋯-Menü (Handy). */
(function () {
  'use strict';

  Util.injectCSS('kanban', `
    .kb-board {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      margin: 0 -14px;
      padding: 4px 14px 12px;
      scroll-padding-left: 14px;
      align-items: flex-start;
    }
    .kb-col {
      flex: 0 0 auto;
      width: min(78vw, 320px);
      scroll-snap-align: start;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px;
      min-height: 160px;
    }
    .kb-col.kb-over {
      outline: 2px dashed var(--primary);
      outline-offset: -2px;
      background: color-mix(in srgb, var(--primary) 10%, var(--surface-2));
    }
    .kb-col-head {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 2px 4px 8px;
    }
    .kb-col-title { font-weight: 700; font-size: 0.92rem; }
    .kb-count {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-muted);
      padding: 0 7px;
      line-height: 18px;
      min-width: 18px;
      text-align: center;
    }
    .kb-add-btn {
      margin-left: auto;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-muted);
      border-radius: 8px;
      width: 26px;
      height: 26px;
      line-height: 1;
      font-size: 1rem;
      cursor: pointer;
      flex: 0 0 auto;
    }
    .kb-add-btn:hover { background: var(--surface); color: var(--primary); border-color: var(--primary); }
    .kb-quickadd { margin-bottom: 8px; }
    .kb-quickadd .input { font-size: 0.92rem; padding: 8px 10px; }
    .kb-card {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: var(--shadow);
      padding: 9px 10px;
      margin-bottom: 8px;
      cursor: pointer;
    }
    .kb-card:active { cursor: grabbing; }
    .kb-card.kb-dragging { opacity: 0.45; }
    .kb-card-top { display: flex; align-items: flex-start; gap: 6px; }
    .kb-card-title {
      flex: 1 1 auto;
      font-size: 0.92rem;
      font-weight: 600;
      word-break: break-word;
      min-width: 0;
    }
    .kb-menu-btn {
      flex: 0 0 auto;
      border: none;
      background: none;
      color: var(--text-muted);
      font-size: 1.05rem;
      line-height: 1;
      padding: 2px 6px;
      margin: -2px -4px 0 0;
      border-radius: 6px;
      cursor: pointer;
    }
    .kb-menu-btn:hover { background: var(--surface-2); color: var(--text); }
    .kb-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 6px;
      align-items: center;
    }
    .kb-due-overdue {
      background: color-mix(in srgb, var(--danger) 15%, transparent);
      color: var(--danger);
    }
    .kb-menu {
      position: absolute;
      top: 30px;
      right: 6px;
      z-index: 10;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: var(--shadow);
      padding: 4px;
      min-width: 170px;
      display: flex;
      flex-direction: column;
    }
    .kb-menu button {
      border: none;
      background: none;
      color: var(--text);
      text-align: left;
      font-size: 0.88rem;
      padding: 8px 10px;
      border-radius: 7px;
      cursor: pointer;
      font-family: inherit;
    }
    .kb-menu button:hover { background: var(--surface-2); }
    .kb-menu .kb-menu-sep {
      border-top: 1px solid var(--border);
      margin: 4px 2px;
    }
    .kb-empty {
      color: var(--text-muted);
      font-size: 0.82rem;
      text-align: center;
      padding: 22px 8px;
      border: 1px dashed var(--border);
      border-radius: 10px;
    }
    .kb-hint { margin: 2px 2px 8px; }
    @media (min-width: 900px) {
      .kb-board {
        display: grid;
        grid-template-columns: repeat(4, minmax(250px, 1fr));
        overflow-x: visible;
        margin: 0;
        padding: 4px 0 12px;
        position: relative;
        left: 50%;
        transform: translateX(-50%);
        width: min(1160px, calc(100vw - 32px));
      }
      .kb-col { width: auto; }
      .kb-hint { display: none; }
    }
  `);

  /* ---------- Modul-Zustand (überlebt Neu-Rendern) ---------- */
  let rootEl = null;          // aktueller Render-Container
  let openAddStatus = null;   // Status-Spalte mit offenem Schnell-Eingabefeld
  const drafts = {};          // Entwurfstext je Spalte: {status: text}
  let menuOpenFor = null;     // Aufgaben-ID mit offenem ⋯-Menü
  let draggedId = null;       // ID der gerade gezogenen Karte (unterdrückt Klick)
  let docListenerSet = false;

  /* ---------- Daten ---------- */
  function sortTasks(list) {
    return list.slice().sort(function (a, b) {
      if (a.due && b.due) {
        if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      } else if (a.due) {
        return -1;
      } else if (b.due) {
        return 1;
      }
      return String(a.createdAt) < String(b.createdAt) ? -1 : 1;
    });
  }

  function sessionCount(taskId) {
    let n = 0;
    for (const s of Store.all('sessions')) if (s.taskId === taskId) n++;
    return n;
  }

  function moveTask(id, status) {
    const t = Store.get('tasks', id);
    if (!t) { App.toast('Aufgabe nicht mehr vorhanden.'); return; }
    menuOpenFor = null;
    if (t.status === status) return;
    Store.update('tasks', id, {
      status: status,
      completedAt: status === 'erledigt' ? new Date().toISOString() : null
    });
    App.toast('Nach „' + Util.STATUS_LABELS[status] + '“ verschoben.');
  }

  /* ---------- HTML ---------- */
  function cardHtml(t, today) {
    const done = t.status === 'erledigt';
    const overdue = !!t.due && t.due < today && !done;
    const chips = [];
    if (t.due) {
      chips.push('<span class="chip' + (overdue ? ' kb-due-overdue' : '') + '">' +
        Util.esc(Util.fmtDateRel(t.due)) + '</span>');
    }
    if (Util.PRIO_LABELS[t.priority]) {
      chips.push('<span class="chip chip-prio-' + t.priority + '">' +
        Util.esc(Util.PRIO_LABELS[t.priority]) + '</span>');
    }
    const foc = sessionCount(t.id);
    if (foc > 0) chips.push('<span class="chip">⏱ ' + foc + '</span>');

    let menu = '';
    if (menuOpenFor === t.id) {
      menu = '<div class="kb-menu">';
      for (const st of Util.STATUS) {
        if (st === t.status) continue;
        menu += '<button type="button" data-move="' + st + '">→ ' +
          Util.esc(Util.STATUS_LABELS[st]) + '</button>';
      }
      menu += '<div class="kb-menu-sep"></div>' +
        '<button type="button" data-details>Details öffnen</button></div>';
    }

    return '<div class="kb-card" draggable="true" data-id="' + Util.esc(t.id) + '">' +
      '<div class="kb-card-top">' +
      '<div class="kb-card-title' + (done ? ' done-text' : '') + '">' + Util.esc(t.title) + '</div>' +
      '<button type="button" class="kb-menu-btn" title="Verschieben …" aria-label="Karte verschieben">⋯</button>' +
      '</div>' +
      (chips.length ? '<div class="kb-chips">' + chips.join('') + '</div>' : '') +
      menu +
      '</div>';
  }

  function columnHtml(status, tasks, today) {
    let html = '<div class="kb-col" data-status="' + status + '">' +
      '<div class="kb-col-head">' +
      '<span class="kb-col-title">' + Util.esc(Util.STATUS_LABELS[status]) + '</span>' +
      '<span class="kb-count">' + tasks.length + '</span>' +
      '<button type="button" class="kb-add-btn" title="Aufgabe hier anlegen" aria-label="Aufgabe in ' +
      Util.esc(Util.STATUS_LABELS[status]) + ' anlegen">+</button>' +
      '</div>';
    if (openAddStatus === status) {
      html += '<div class="kb-quickadd">' +
        '<input class="input kb-qa-input" type="text" placeholder="Neue Aufgabe … (Enter)" ' +
        'value="' + Util.esc(drafts[status] || '') + '">' +
        '</div>';
    }
    if (tasks.length === 0) {
      html += '<div class="kb-empty">Hierher ziehen</div>';
    } else {
      for (const t of tasks) html += cardHtml(t, today);
    }
    html += '</div>';
    return html;
  }

  /* ---------- Rendern & Verdrahten ---------- */
  function draw() {
    if (!rootEl) return;
    const today = Util.todayISO();
    const all = Store.all('tasks');
    let html = '<p class="muted small kb-hint">Karten per ⋯-Menü verschieben — ' +
      'Spalten seitlich wischen.</p><div class="kb-board">';
    for (const status of Util.STATUS) {
      html += columnHtml(status, sortTasks(all.filter(t => t.status === status)), today);
    }
    html += '</div>';
    rootEl.innerHTML = html;
    wire();
  }

  function wire() {
    /* Spalten: Drop-Ziele + Schnell-Anlegen */
    rootEl.querySelectorAll('.kb-col').forEach(function (col) {
      const status = col.dataset.status;

      col.addEventListener('dragover', function (e) {
        if (!draggedId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('kb-over');
      });
      col.addEventListener('dragleave', function (e) {
        if (!e.relatedTarget || !col.contains(e.relatedTarget)) col.classList.remove('kb-over');
      });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('kb-over');
        const id = draggedId || e.dataTransfer.getData('text/plain');
        if (id) moveTask(id, status);
      });

      col.querySelector('.kb-add-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        openAddStatus = openAddStatus === status ? null : status;
        draw();
      });

      const qa = col.querySelector('.kb-qa-input');
      if (qa) {
        qa.addEventListener('input', function () { drafts[status] = qa.value; });
        qa.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            const title = qa.value.trim();
            if (!title) return;
            drafts[status] = '';
            Store.add('tasks', {
              title: title,
              due: null,
              priority: 2,
              status: status,
              completedAt: status === 'erledigt' ? new Date().toISOString() : null
            });
            App.toast('Aufgabe in „' + Util.STATUS_LABELS[status] + '“ angelegt.');
          } else if (e.key === 'Escape') {
            drafts[status] = '';
            openAddStatus = null;
            draw();
          }
        });
      }
    });

    /* Karten: Ziehen, Klick, ⋯-Menü */
    rootEl.querySelectorAll('.kb-card').forEach(function (card) {
      const id = card.dataset.id;

      card.addEventListener('dragstart', function (e) {
        draggedId = id;
        menuOpenFor = null;
        card.classList.add('kb-dragging');
        try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function () {
        card.classList.remove('kb-dragging');
        rootEl.querySelectorAll('.kb-over').forEach(c => c.classList.remove('kb-over'));
        setTimeout(function () { draggedId = null; }, 0);
      });

      card.addEventListener('click', function (e) {
        if (draggedId) return; // gerade gezogen — kein Klick
        if (e.target.closest('.kb-menu-btn') || e.target.closest('.kb-menu')) return;
        App.navigate('aufgaben', { taskId: id });
      });

      card.querySelector('.kb-menu-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        menuOpenFor = menuOpenFor === id ? null : id;
        draw();
      });

      const menu = card.querySelector('.kb-menu');
      if (menu) {
        menu.addEventListener('click', function (e) { e.stopPropagation(); });
        menu.querySelectorAll('button[data-move]').forEach(function (b) {
          b.addEventListener('click', function () { moveTask(id, b.dataset.move); });
        });
        const det = menu.querySelector('button[data-details]');
        det.addEventListener('click', function () {
          menuOpenFor = null;
          App.navigate('aufgaben', { taskId: id });
        });
      }
    });

    /* Offenes Schnell-Eingabefeld wieder fokussieren (Text bleibt erhalten) */
    if (openAddStatus) {
      const qa = rootEl.querySelector('.kb-col[data-status="' + openAddStatus + '"] .kb-qa-input');
      if (qa && document.activeElement !== qa) {
        try {
          qa.focus({ preventScroll: true });
          qa.setSelectionRange(qa.value.length, qa.value.length);
        } catch (_) {}
      }
    }
  }

  /* Klick außerhalb schließt das ⋯-Menü (einmalig registriert) */
  function ensureDocListener() {
    if (docListenerSet) return;
    docListenerSet = true;
    document.addEventListener('click', function (e) {
      if (!menuOpenFor) return;
      if (e.target.closest && (e.target.closest('.kb-menu') || e.target.closest('.kb-menu-btn'))) return;
      menuOpenFor = null;
      if (App.currentView() === 'board' && rootEl) {
        const m = rootEl.querySelector('.kb-menu');
        if (m) m.remove();
      }
    });
  }

  App.registerView('board', {
    title: 'Board',
    icon: '📋',
    order: 4,
    render: function (el) {
      rootEl = el;
      ensureDocListener();
      draw();
    }
  });
})();
