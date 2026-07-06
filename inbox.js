/* Karina Assistent — Eingang (js/inbox.js).
   Die Startseite: Gedanken in Sekunden erfassen (tippen oder diktieren),
   später zu Aufgabe, Notiz oder Termin sortieren — oder löschen. */
(function () {
  'use strict';

  Util.injectCSS('inbox', `
    .in-capture textarea.input {
      min-height: 88px;
      font-size: 1.05rem;
    }
    .in-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    .in-actions .in-hint { flex: 1; }
    .in-item { flex-direction: column; align-items: stretch; }
    .in-item-text {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .in-item-meta { margin: 4px 0 8px; }
    .in-audio { width: 100%; margin: 8px 0 4px; max-width: 420px; }
    .in-triage {
      display: none;
      margin-top: 10px;
      padding: 10px 12px;
      background: var(--surface-2);
      border-radius: 10px;
    }
    .in-triage.open { display: block; }
    .in-triage .btn-row { margin-top: 10px; }
  `);

  /* Entwurf überlebt jedes Neu-Rendern (Modul-Variable). */
  let draft = '';

  /* ---------- Helfer ---------- */

  // Erste Zeile als Titel (max. 60 Zeichen), mit Ersatz für reine Sprachnotizen.
  function firstLine(text, fallback) {
    const line = String(text || '').split(/\r?\n/)[0].trim();
    return (line ? line.slice(0, 60) : '') || fallback;
  }

  // Ganzer Text als einzeilige Überschrift (für Aufgabe/Termin).
  function asTitle(item) {
    const t = String(item.text || '').replace(/\s+/g, ' ').trim();
    return t || 'Sprachnotiz';
  }

  function itemHtml(item) {
    const hasText = String(item.text || '').trim() !== '';
    const heute = Util.todayISO();
    return '<li class="list-item in-item" data-id="' + Util.esc(item.id) + '">' +
      (hasText
        ? '<p class="in-item-text">' + Util.esc(item.text) + '</p>'
        : '<p class="in-item-text muted">🎙️ Sprachnotiz</p>') +
      (item.audio
        ? '<audio class="in-audio" controls src="' + Util.esc(item.audio) + '"></audio>'
        : '') +
      '<div class="in-item-meta muted small">Erfasst am ' + Util.esc(Util.fmtDateTime(item.createdAt)) + '</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-sm" data-act="task">→ Aufgabe</button>' +
      '<button class="btn btn-sm" data-act="note">→ Notiz</button>' +
      '<button class="btn btn-sm" data-act="event">→ Termin</button>' +
      '<button class="btn btn-sm btn-danger" data-act="del">Löschen</button>' +
      '</div>' +

      /* Mini-Formular: Aufgabe */
      '<div class="in-triage" data-form="task">' +
      '<div class="form-row">' +
      '<label>Fällig am<input type="date" data-f="due"></label>' +
      '<label>Priorität<select data-f="prio">' +
      '<option value="1">' + Util.esc(Util.PRIO_LABELS[1]) + '</option>' +
      '<option value="2" selected>' + Util.esc(Util.PRIO_LABELS[2]) + '</option>' +
      '<option value="3">' + Util.esc(Util.PRIO_LABELS[3]) + '</option>' +
      '</select></label>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-sm btn-primary" data-act="task-save">Aufgabe anlegen</button>' +
      '<button class="btn btn-sm" data-act="cancel">Abbrechen</button>' +
      '</div>' +
      '</div>' +

      /* Mini-Formular: Termin */
      '<div class="in-triage" data-form="event">' +
      '<div class="form-row">' +
      '<label>Datum<input type="date" data-f="date" value="' + Util.esc(heute) + '"></label>' +
      '<label>Uhrzeit (optional)<input type="time" data-f="time"></label>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-sm btn-primary" data-act="event-save">Termin anlegen</button>' +
      '<button class="btn btn-sm" data-act="cancel">Abbrechen</button>' +
      '</div>' +
      '</div>' +
      '</li>';
  }

  /* ---------- Sortier-Aktionen ---------- */

  function toTask(item, due, prio) {
    Store.add('tasks', {
      title: asTitle(item),
      due: due || null,
      priority: prio,
      status: due ? 'geplant' : 'eingang',
      completedAt: null
    });
    Store.remove('inbox', item.id);
    App.toast(due
      ? 'Aufgabe angelegt und für den ' + Util.fmtDate(due) + ' geplant.'
      : 'Aufgabe angelegt.');
  }

  function toNote(item) {
    const note = Store.add('notes', {
      title: firstLine(item.text, 'Sprachnotiz'),
      body: String(item.text || ''),
      audio: item.audio || undefined,
      audioMime: item.audioMime || undefined,
      linkTo: null,
      updatedAt: new Date().toISOString()
    });
    Store.remove('inbox', item.id);
    App.toast('Als Notiz übernommen.');
    App.openNoteEditor({ noteId: note.id });
  }

  function toEvent(item, date, time) {
    Store.add('events', {
      title: asTitle(item),
      date: date,
      time: time || ''
    });
    Store.remove('inbox', item.id);
    App.toast('Termin am ' + Util.fmtDate(date) + ' angelegt.');
  }

  /* ---------- Ansicht ---------- */

  App.registerView('eingang', {
    title: 'Eingang',
    icon: '📥',
    order: 1,

    render(el) {
      const items = Store.all('inbox').slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      el.innerHTML =
        '<div class="card in-capture">' +
        '<textarea id="in-capture" class="input" rows="3" autofocus ' +
        'placeholder="Was geht dir durch den Kopf?"></textarea>' +
        '<div class="in-actions">' +
        '<span id="in-mic-slot"></span>' +
        '<span class="in-hint muted small">Enter fügt hinzu · Shift+Enter = neue Zeile</span>' +
        '<button class="btn btn-primary" id="in-add">Hinzufügen</button>' +
        '</div>' +
        '</div>' +
        '<div class="card">' +
        (items.length
          ? '<h2>Zu sortieren (' + items.length + ')</h2>' +
            '<ul class="list">' + items.map(itemHtml).join('') + '</ul>'
          : '<div class="empty-state"><span class="big">📥</span>' +
            'Kopf leeren: schreib oder diktiere, was dir durch den Kopf geht — ' +
            'sortieren kannst du später.</div>') +
        '</div>';

      /* --- Erfassung --- */
      const ta = el.querySelector('#in-capture');
      ta.value = draft;
      ta.addEventListener('input', () => { draft = ta.value; });

      function addText() {
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        draft = '';
        Store.add('inbox', { text: text }); // rendert die Ansicht neu
        App.toast('Im Eingang erfasst.');
      }

      ta.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          addText();
        }
      });
      el.querySelector('#in-add').addEventListener('click', addText);

      /* Mikrofon: erkannter Text landet im Feld, Sprachnotiz direkt im Eingang. */
      const mic = Dictate.micButton({
        title: 'Diktieren',
        onText(text) {
          if (!ta.isConnected) return;
          const sep = ta.value && !/\s$/.test(ta.value) ? ' ' : '';
          ta.value += sep + text;
          draft = ta.value;
        },
        onAudio(dataUrl, mime) {
          Store.add('inbox', { text: '', audio: dataUrl, audioMime: mime });
          App.toast('Sprachnotiz im Eingang gespeichert.');
        }
      });
      el.querySelector('#in-mic-slot').appendChild(mic);

      // Autofokus (auch nach Neu-Rendern), Cursor ans Ende.
      try {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      } catch (_) {}

      /* --- Sortieren je Eintrag --- */
      el.querySelectorAll('.in-item').forEach((li) => {
        const item = Store.get('inbox', li.dataset.id);
        if (!item) return;
        const forms = li.querySelectorAll('.in-triage');

        function closeForms() { forms.forEach((f) => f.classList.remove('open')); }
        function toggleForm(name) {
          const open = li.querySelector('.in-triage.open');
          closeForms();
          if (open && open.dataset.form === name) return; // war offen → zu
          const f = li.querySelector('.in-triage[data-form="' + name + '"]');
          if (f) {
            f.classList.add('open');
            const first = f.querySelector('input, select');
            if (first) first.focus();
          }
        }
        const on = (sel, fn) => {
          li.querySelectorAll(sel).forEach((b) => b.addEventListener('click', fn));
        };

        on('[data-act="task"]', () => toggleForm('task'));
        on('[data-act="event"]', () => toggleForm('event'));
        on('[data-act="cancel"]', closeForms);

        on('[data-act="task-save"]', () => {
          const f = li.querySelector('.in-triage[data-form="task"]');
          const due = f.querySelector('[data-f="due"]').value || null;
          const prio = parseInt(f.querySelector('[data-f="prio"]').value, 10) || 2;
          toTask(item, due, prio);
        });

        on('[data-act="event-save"]', () => {
          const f = li.querySelector('.in-triage[data-form="event"]');
          const date = f.querySelector('[data-f="date"]').value;
          if (!date) { App.toast('Bitte ein Datum für den Termin wählen.'); return; }
          const time = f.querySelector('[data-f="time"]').value;
          toEvent(item, date, time);
        });

        on('[data-act="note"]', () => toNote(item));

        on('[data-act="del"]', async () => {
          if (await App.confirm('Diesen Eintrag wirklich löschen?')) {
            Store.remove('inbox', item.id);
            App.toast('Eintrag gelöscht.');
          }
        });
      });
    }
  });
})();
