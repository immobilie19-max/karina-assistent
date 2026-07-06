/* Karina Assistent — Fokus-Timer (Ansicht 'timer').
   Der komplette Timer-Zustand lebt in Modul-Variablen dieser IIFE und läuft
   über Ansichtswechsel und Neu-Darstellungen hinweg weiter. Die Restzeit wird
   immer aus Date.now() gegen den Endzeitpunkt berechnet (übersteht Tab-Schlaf). */
(function () {
  'use strict';

  /* ---------- Modul-Zustand ---------- */
  let selTaskId = null;    // gewählte Aufgabe
  let phase = 'idle';      // 'idle' | 'fokus' | 'pause'
  let endsAt = null;       // ms-Zeitstempel, wann der Countdown endet (null = läuft nicht)
  let paused = false;      // Fokus pausiert?
  let remainMs = 0;        // Restzeit beim Pausieren
  let totalMs = 0;         // Gesamtlänge des laufenden Countdowns
  let sessionMin = 0;      // zu protokollierende Minuten (fokusMin beim Start)
  let startedAt = null;    // ISO-Startzeit der Fokus-Sitzung
  let breakOffer = false;  // nach dem Ablauf: Pause anbieten?
  let tickerId = null;     // eine einzige setInterval-Uhr für alles
  let audioCtx = null;     // WebAudio, träge beim ersten Klick erzeugt

  const APP_TITLE = 'Karina – Assistent';

  /* ---------- Helfer ---------- */
  function fmtClock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function currentRemain() {
    if (paused) return remainMs;
    if (endsAt !== null) return Math.max(0, endsAt - Date.now());
    return 0;
  }

  // Läuft gerade ein Countdown (oder ist er pausiert)?
  function isEngaged() {
    return phase !== 'idle' && (endsAt !== null || paused);
  }

  function openTasks() {
    return Store.all('tasks').filter((t) => t.status !== 'erledigt');
  }

  /* ---------- Piepton (WebAudio, zwei kurze Töne) ---------- */
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { audioCtx = new AC(); } catch (e) { audioCtx = null; } }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function beep() {
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      const tones = [[880, 0], [1175, 0.22]];
      for (const tone of tones) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = tone[0];
        const t = t0 + tone[1];
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      }
    } catch (e) { console.warn('Piepton fehlgeschlagen:', e); }
  }

  /* ---------- Uhr: eine setInterval für Countdown, Pille & Titel ---------- */
  function ensureTicker() {
    if (tickerId === null) tickerId = setInterval(tick, 500);
    tick();
  }

  function tick() {
    // Ablauf feuert unabhängig davon, welche Ansicht gerade aktiv ist.
    if (phase !== 'idle' && endsAt !== null && !paused && Date.now() >= endsAt) {
      if (phase === 'fokus') completeFokus();
      else finishBreak(true);
    }
    // Countdown-Anzeige nur anfassen, wenn die Timer-Ansicht gerade da ist.
    const clock = document.getElementById('tm-clock');
    if (clock) clock.textContent = fmtClock(currentRemain());
    updateChrome();
    if (!isEngaged() && tickerId !== null) {
      clearInterval(tickerId);
      tickerId = null;
    }
  }

  // Schwebe-Pille (auf fremden Ansichten) + document.title pflegen
  function updateChrome() {
    if (isEngaged()) {
      document.title = (paused ? '⏸' : '⏱') + ' ' + fmtClock(currentRemain()) + ' – Karina';
    } else if (document.title !== APP_TITLE) {
      document.title = APP_TITLE;
    }

    const onTimerView = window.App && App.currentView && App.currentView() === 'timer';
    let pill = document.getElementById('tm-pill');
    if (isEngaged() && !onTimerView) {
      if (!pill) {
        pill = document.createElement('button');
        pill.id = 'tm-pill';
        pill.type = 'button';
        pill.title = 'Zum Fokus-Timer';
        pill.addEventListener('click', () => App.navigate('timer'));
        document.body.appendChild(pill);
      }
      const task = Store.get('tasks', selTaskId);
      const label = phase === 'pause' ? 'Pause' : (task ? task.title : '(gelöschte Aufgabe)');
      // textContent — kein HTML, daher automatisch sicher.
      pill.textContent = (paused ? '⏸ ' : '⏱ ') + fmtClock(currentRemain()) + ' · ' + label;
    } else if (pill) {
      pill.remove();
    }
  }

  // Timer-Ansicht neu zeichnen, falls sie gerade aktiv ist.
  function refresh() {
    if (window.App && App.currentView && App.currentView() === 'timer') {
      const root = document.getElementById('view-root');
      if (root) renderTimer(root, null);
    }
    updateChrome();
  }

  /* ---------- Aktionen ---------- */
  function startFokus() {
    const task = Store.get('tasks', selTaskId);
    if (!task) return;
    ensureAudio(); // Nutzergeste — AudioContext jetzt anlegen/entsperren
    sessionMin = Store.state.settings.fokusMin;
    totalMs = sessionMin * 60000;
    startedAt = new Date().toISOString();
    endsAt = Date.now() + totalMs;
    paused = false;
    remainMs = 0;
    phase = 'fokus';
    breakOffer = false;
    ensureTicker();
    refresh();
  }

  function togglePause() {
    if (phase !== 'fokus' || !isEngaged()) return;
    if (paused) {
      endsAt = Date.now() + remainMs;
      remainMs = 0;
      paused = false;
    } else {
      remainMs = Math.max(0, endsAt - Date.now());
      endsAt = null;
      paused = true;
    }
    ensureTicker();
    refresh();
  }

  function stopFokus() {
    if (phase !== 'fokus') return;
    const elapsedMs = totalMs - currentRemain();
    const info = { taskId: selTaskId, startedAt: startedAt };
    phase = 'idle';
    endsAt = null;
    paused = false;
    remainMs = 0;
    breakOffer = false;
    refresh();
    if (elapsedMs >= 60000) {
      const min = Math.max(1, Math.round(elapsedMs / 60000));
      App.confirm('Sitzung gestoppt. ' + min + ' Min. als Fokus-Sitzung speichern?')
        .then((yes) => {
          if (!yes) return;
          Store.add('sessions', { taskId: info.taskId, minutes: min, startedAt: info.startedAt });
          App.toast('Fokus-Sitzung gespeichert (' + Util.fmtMinutes(min) + ').');
        });
    } else {
      App.toast('Timer gestoppt.');
    }
  }

  // Natürlicher Ablauf der Fokus-Zeit — feuert auch auf fremden Ansichten.
  function completeFokus() {
    const info = { taskId: selTaskId, minutes: sessionMin, startedAt: startedAt };
    phase = 'pause';
    breakOffer = true;
    endsAt = null;
    paused = false;
    remainMs = 0;
    beep();
    Store.add('sessions', info); // rendert die aktive Ansicht automatisch neu
    App.toast('Fokus-Sitzung gespeichert – gut gemacht!');
    refresh();
  }

  function startBreak() {
    ensureAudio();
    totalMs = Store.state.settings.pauseMin * 60000;
    endsAt = Date.now() + totalMs;
    paused = false;
    remainMs = 0;
    phase = 'pause';
    breakOffer = false;
    ensureTicker();
    refresh();
  }

  // Pause vorbei (natürlich oder per Knopf) — zurück zu IDLE, Aufgabe bleibt gewählt.
  function finishBreak(natural) {
    phase = 'idle';
    endsAt = null;
    paused = false;
    remainMs = 0;
    breakOffer = false;
    if (natural) {
      beep();
      App.toast('Pause beendet – weiter geht\'s!');
    }
    refresh();
  }

  /* ---------- HTML-Bausteine ---------- */
  function idleHtml() {
    const tasks = openTasks();
    if (!tasks.length) {
      return '<div class="card tm-card"><h2>Fokus-Timer</h2>' +
        '<div class="empty-state"><span class="big">⏱️</span>' +
        'Keine offenen Aufgaben. Lege zuerst eine Aufgabe an – dann kannst du hier fokussiert loslegen.' +
        '<div class="btn-row tm-center-row"><button class="btn btn-primary" id="tm-to-tasks">Zu den Aufgaben</button></div>' +
        '</div></div>';
    }
    if (selTaskId && !tasks.some((t) => t.id === selTaskId)) selTaskId = null;
    const sel = Store.get('tasks', selTaskId);
    let opts = '<option value="">– Aufgabe wählen –</option>';
    for (const t of tasks) {
      opts += '<option value="' + Util.esc(t.id) + '"' + (t.id === selTaskId ? ' selected' : '') + '>' +
        Util.esc(t.title) + '</option>';
    }
    return '<div class="card tm-card"><h2>Fokus-Timer</h2>' +
      '<label class="tm-label">Aufgabe für die Fokus-Sitzung' +
      '<select class="input" id="tm-task">' + opts + '</select></label>' +
      (sel ? '<div class="tm-tasktitle">' + Util.esc(sel.title) + '</div>' : '') +
      '<div class="tm-clock">' + fmtClock(Store.state.settings.fokusMin * 60000) + '</div>' +
      '<div class="btn-row tm-center-row">' +
      '<button class="btn btn-primary tm-big-btn" id="tm-start"' + (sel ? '' : ' disabled') + '>Fokus starten</button>' +
      '</div>' +
      (sel ? '' : '<p class="muted small tm-hint">Wähle zuerst eine Aufgabe.</p>') +
      '</div>';
  }

  function fokusHtml() {
    const task = Store.get('tasks', selTaskId);
    return '<div class="card tm-card">' +
      '<div class="tm-phase"><span class="chip chip-primary">Fokus</span></div>' +
      '<div class="tm-tasktitle">' + Util.esc(task ? task.title : '(gelöschte Aufgabe)') + '</div>' +
      '<div class="tm-clock' + (paused ? ' tm-paused' : '') + '" id="tm-clock">' + fmtClock(currentRemain()) + '</div>' +
      (paused ? '<p class="muted small tm-hint">Pausiert – wenn du bereit bist, geht es weiter.</p>' : '') +
      '<div class="btn-row tm-center-row">' +
      '<button class="btn" id="tm-toggle">' + (paused ? 'Weiter' : 'Pause') + '</button>' +
      '<button class="btn btn-danger" id="tm-stop">Stopp</button>' +
      '</div></div>';
  }

  function breakOfferHtml() {
    const task = Store.get('tasks', selTaskId);
    return '<div class="card tm-card">' +
      '<div class="empty-state"><span class="big">🎉</span>' +
      'Fokus-Sitzung geschafft' + (task ? ' – <strong>' + Util.esc(task.title) + '</strong>' : '') +
      '! Gönn dir eine kurze Pause.' +
      '</div>' +
      '<div class="btn-row tm-center-row">' +
      '<button class="btn btn-primary" id="tm-break">Pause starten (' + Store.state.settings.pauseMin + ' Min.)</button>' +
      '<button class="btn" id="tm-skip">Überspringen</button>' +
      '</div></div>';
  }

  function breakHtml() {
    return '<div class="card tm-card">' +
      '<div class="tm-phase"><span class="chip">Pause</span></div>' +
      '<div class="tm-clock" id="tm-clock">' + fmtClock(currentRemain()) + '</div>' +
      '<p class="muted small tm-hint">Kurz durchatmen – gleich geht es weiter.</p>' +
      '<div class="btn-row tm-center-row">' +
      '<button class="btn btn-primary" id="tm-end-break">Pause beenden</button>' +
      '</div></div>';
  }

  function todayHtml() {
    const today = Util.todayISO();
    const sessions = Store.all('sessions')
      .filter((s) => s.startedAt && Util.isoOf(new Date(s.startedAt)) === today)
      .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
    let html = '<div class="card"><h2>Heute</h2>';
    if (!sessions.length) {
      html += '<div class="empty-state">Heute noch keine Fokus-Sitzung. Starte oben deine erste!</div>';
    } else {
      let total = 0;
      html += '<ul class="list">';
      for (const s of sessions) {
        total += s.minutes || 0;
        const d = new Date(s.startedAt);
        const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        const task = Store.get('tasks', s.taskId);
        html += '<li class="list-item tm-session">' +
          '<span class="muted small tm-time">' + hm + '</span>' +
          '<span class="tm-session-title">' + Util.esc(task ? task.title : '(gelöschte Aufgabe)') + '</span>' +
          '<span class="chip chip-primary">' + Util.esc(Util.fmtMinutes(s.minutes)) + '</span>' +
          '</li>';
      }
      html += '</ul><p class="tm-total small"><strong>Gesamt:</strong> ' + sessions.length +
        (sessions.length === 1 ? ' Sitzung' : ' Sitzungen') + ' · ' +
        Util.esc(Util.fmtMinutes(total)) + '</p>';
    }
    return html + '</div>';
  }

  /* ---------- Ansicht ---------- */
  function renderTimer(el, params) {
    if (params && params.taskId && phase === 'idle') {
      const t = Store.get('tasks', params.taskId);
      if (t && t.status !== 'erledigt') selTaskId = params.taskId;
    }
    let html;
    if (phase === 'fokus') html = fokusHtml();
    else if (phase === 'pause') html = breakOffer ? breakOfferHtml() : breakHtml();
    else html = idleHtml();
    el.innerHTML = html + todayHtml();

    const on = (id, fn) => {
      const b = el.querySelector('#' + id);
      if (b) b.addEventListener('click', fn);
    };
    const sel = el.querySelector('#tm-task');
    if (sel) {
      sel.addEventListener('change', () => {
        selTaskId = sel.value || null;
        refresh();
      });
    }
    on('tm-start', startFokus);
    on('tm-toggle', togglePause);
    on('tm-stop', stopFokus);
    on('tm-break', startBreak);
    on('tm-skip', () => finishBreak(false));
    on('tm-end-break', () => finishBreak(false));
    on('tm-to-tasks', () => App.navigate('aufgaben'));

    updateChrome(); // Pille sofort entfernen, wenn man auf die Timer-Ansicht kommt
  }

  /* ---------- CSS & Registrierung ---------- */
  Util.injectCSS('timer', '' +
    '.tm-card { text-align: center; }\n' +
    '.tm-label { display: block; text-align: left; font-size: 0.82rem; color: var(--text-muted); font-weight: 600; }\n' +
    '.tm-label select { margin-top: 4px; }\n' +
    '.tm-clock { font-size: 3.6rem; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; line-height: 1.1; margin: 14px 0 6px; }\n' +
    '.tm-clock.tm-paused { opacity: 0.45; }\n' +
    '.tm-tasktitle { font-weight: 700; font-size: 1.05rem; margin-top: 12px; overflow-wrap: anywhere; }\n' +
    '.tm-phase { margin-bottom: 2px; }\n' +
    '.tm-center-row { justify-content: center; margin-top: 10px; }\n' +
    '.tm-hint { margin: 8px 0 0; }\n' +
    '.tm-big-btn { padding: 12px 22px; font-size: 1rem; }\n' +
    '.tm-session .tm-session-title { flex: 1; overflow-wrap: anywhere; }\n' +
    '.tm-session .tm-time { flex: 0 0 auto; font-variant-numeric: tabular-nums; padding-top: 2px; }\n' +
    '.tm-total { text-align: right; margin: 10px 0 0; color: var(--text-muted); }\n' +
    '#tm-pill { position: fixed; left: 50%; transform: translateX(-50%); ' +
      'bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 12px); z-index: 40; ' +
      'border: none; border-radius: 999px; background: var(--primary); color: var(--primary-contrast); ' +
      'font: inherit; font-size: 0.88rem; font-weight: 700; padding: 9px 16px; box-shadow: var(--shadow); ' +
      'cursor: pointer; max-width: 88vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n');

  App.registerView('timer', {
    title: 'Timer',
    icon: '⏱️',
    order: 7,
    render: renderTimer
  });
})();
