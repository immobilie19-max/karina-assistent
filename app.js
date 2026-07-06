/* Karina Assistent — App-Gerüst: Navigation, Ansichten-Registry, Einstellungen/Backup. */
(function () {
  'use strict';

  const App = {};
  const views = {};   // name -> {title, icon, order, render(el, params)}
  let activeView = null;
  let activeParams = null;

  /* ---------- Ansichten-Registry ---------- */
  App.registerView = function (name, def) {
    views[name] = def;
  };

  App.navigate = function (name, params) {
    const def = views[name];
    if (!def) { console.error('Unbekannte Ansicht:', name); return; }
    activeView = name;
    activeParams = params || null;
    document.getElementById('view-title').textContent = def.title;
    document.querySelectorAll('.tabbar button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    renderActive();
    const tab = document.querySelector('.tabbar button.active');
    if (tab) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    window.scrollTo(0, 0);
  };

  function renderActive() {
    const root = document.getElementById('view-root');
    const def = views[activeView];
    if (!def) return;
    try {
      def.render(root, activeParams);
    } catch (e) {
      console.error('Fehler in Ansicht ' + activeView + ':', e);
      root.innerHTML = '<div class="card"><p>In dieser Ansicht ist ein Fehler aufgetreten. ' +
        'Deine Daten sind sicher gespeichert.</p><pre class="error-detail">' +
        Util.esc(e && e.stack || e) + '</pre></div>';
    }
    activeParams = null; // Parameter gelten nur für die erste Darstellung
  }

  App.currentView = () => activeView;

  /* ---------- Verbindungen zwischen Funktionen ---------- */
  // Timer aus einer Aufgabe heraus starten
  App.startFocus = function (taskId) {
    App.navigate('timer', { taskId });
  };
  // Notiz-Editor öffnen, optional verknüpft oder zum Bearbeiten
  App.openNoteEditor = function (opts) {
    App.navigate('notizen', Object.assign({ edit: true }, opts || {}));
  };
  // Aufgabe/Termin an einem bestimmten Tag anlegen (aus dem Kalender)
  App.newTaskOn = function (dateISO) {
    App.navigate('aufgaben', { newDue: dateISO });
  };

  /* ---------- Toast ---------- */
  let toastTimer = null;
  App.toast = function (msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 300);
    }, 2200);
  };

  App.confirm = function (msg) { return Promise.resolve(window.confirm(msg)); };

  /* ---------- Tab-Leiste ---------- */
  function buildTabbar() {
    const bar = document.getElementById('tabbar');
    bar.innerHTML = '';
    const ordered = Object.entries(views).sort((a, b) => (a[1].order || 99) - (b[1].order || 99));
    for (const [name, def] of ordered) {
      const b = document.createElement('button');
      b.dataset.view = name;
      b.innerHTML = '<span class="tab-icon">' + def.icon + '</span>' +
        '<span class="tab-label">' + Util.esc(def.title) + '</span>' +
        '<span class="tab-badge" hidden></span>';
      b.addEventListener('click', () => App.navigate(name));
      bar.appendChild(b);
    }
  }

  function updateBadges() {
    const bar = document.getElementById('tabbar');
    const inboxBtn = bar.querySelector('button[data-view="eingang"] .tab-badge');
    if (inboxBtn) {
      const n = Store.all('inbox').length;
      inboxBtn.textContent = n;
      inboxBtn.hidden = n === 0;
    }
  }

  /* ---------- Einstellungen & Backup ---------- */
  function settingsHtml() {
    const s = Store.state.settings;
    return '' +
      '<h2>Einstellungen &amp; Backup</h2>' +
      '<section><h3>Fokus-Timer</h3>' +
      '<div class="form-row"><label>Fokus (Minuten)' +
      '<input type="number" id="set-fokus" min="1" max="120" value="' + s.fokusMin + '"></label>' +
      '<label>Pause (Minuten)' +
      '<input type="number" id="set-pause" min="1" max="60" value="' + s.pauseMin + '"></label></div>' +
      '</section>' +
      '<section><h3>Backup (lesbare Dateien)</h3>' +
      '<p class="muted">Exportiert eine ZIP-Datei mit deinen Notizen als .md und allem anderen als .json. ' +
      'Der Import stellt ein Backup vollständig wieder her.</p>' +
      '<div class="btn-row">' +
      '<button class="btn" id="btn-export">Backup exportieren</button>' +
      '<button class="btn" id="btn-import">Backup importieren…</button>' +
      '<input type="file" id="import-file" accept=".zip" hidden>' +
      '</div>' +
      (Store.folderSupported
        ? '<h3 style="margin-top:16px">Ordner-Spiegel (dieser PC)</h3>' +
          '<p class="muted">Hält dieselben Dateien automatisch in einem Ordner deiner Wahl aktuell.</p>' +
          '<div class="btn-row">' +
          (Store.folderConnected()
            ? '<button class="btn" id="btn-folder-off">Ordner trennen</button>'
            : (Store._pendingHandle
              ? '<button class="btn" id="btn-folder-re">Ordner-Zugriff erneut erlauben</button>'
              : '') +
              '<button class="btn" id="btn-folder-on">Mit Ordner verbinden…</button>') +
          '</div>'
        : '') +
      '</section>' +
      '<section><h3>Gefahrenzone</h3>' +
      '<div class="btn-row"><button class="btn btn-danger" id="btn-reset">Alle Daten löschen</button></div>' +
      '</section>' +
      '<div class="btn-row dialog-close-row"><button class="btn btn-primary" id="btn-close-settings">Schließen</button></div>';
  }

  function openSettings() {
    const dlg = document.getElementById('settings-dialog');
    dlg.innerHTML = settingsHtml();
    dlg.showModal();

    const on = (id, fn) => { const el = dlg.querySelector('#' + id); if (el) el.addEventListener('click', fn); };

    dlg.querySelector('#set-fokus').addEventListener('change', (e) => {
      const v = Math.max(1, Math.min(120, +e.target.value || 25));
      Store.setSettings({ fokusMin: v });
    });
    dlg.querySelector('#set-pause').addEventListener('change', (e) => {
      const v = Math.max(1, Math.min(60, +e.target.value || 5));
      Store.setSettings({ pauseMin: v });
    });

    on('btn-export', () => {
      const blob = Store.exportZip();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = Store.exportFilename();
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      App.toast('Backup exportiert.');
    });

    on('btn-import', () => dlg.querySelector('#import-file').click());
    dlg.querySelector('#import-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!await App.confirm('Backup importieren? Die aktuellen Daten in der App werden dabei ersetzt.')) return;
      try {
        await Store.importZip(await f.arrayBuffer());
        App.toast('Backup importiert.');
        dlg.close();
      } catch (err) {
        console.error(err);
        alert('Import fehlgeschlagen: ' + (err.message || err));
      }
    });

    on('btn-folder-on', async () => {
      try {
        await Store.connectFolder();
        App.toast('Ordner verbunden — Dateien werden gespiegelt.');
        dlg.close();
      } catch (err) { if (err && err.name !== 'AbortError') alert('Konnte Ordner nicht verbinden: ' + err.message); }
    });
    on('btn-folder-off', async () => { await Store.disconnectFolder(); App.toast('Ordner getrennt.'); dlg.close(); });
    on('btn-folder-re', async () => {
      if (await Store.reauthorizeFolder()) { App.toast('Ordner wieder verbunden.'); dlg.close(); }
    });

    on('btn-reset', async () => {
      if (!await App.confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
      Store.resetAll();
      App.toast('Alle Daten gelöscht.');
      dlg.close();
    });

    on('btn-close-settings', () => dlg.close());
  }

  /* ---------- Start ---------- */
  App.init = function () {
    Store.load();
    Store.restoreFolder && Store.restoreFolder();
    buildTabbar();

    Store.onChange(() => {
      updateBadges();
      renderActive();
    });

    document.getElementById('btn-settings').addEventListener('click', openSettings);

    updateBadges();
    App.navigate('eingang');

    // Service Worker nur über http(s) — bei file:// läuft die App trotzdem
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service Worker:', e));
    }
  };

  window.App = App;
})();
