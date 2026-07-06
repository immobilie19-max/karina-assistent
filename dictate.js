/* Karina Assistent — Diktierfunktion (js/dictate.js).
   Spracherkennung des Geräts (de-DE, kontinuierlich); wo keine Erkennung
   verfügbar ist, nimmt der Button per MediaRecorder eine Sprachnotiz auf
   (max. 60 s, als dataURL). Ohne beides wird der Button versteckt. */
(function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const canRecord = !!(navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window.MediaRecorder === 'function');

  const MAX_AUFNAHME_SEK = 60;

  Util.injectCSS('dictate', `
    .mic-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 1.05rem;
      line-height: 1;
      cursor: pointer;
      min-width: 44px;
      min-height: 40px;
    }
    .mic-btn:hover { background: var(--surface-2); }
    .mic-btn.recording {
      background: var(--danger);
      border-color: var(--danger);
      color: #fff;
      animation: mic-pulse 1.2s ease-out infinite;
    }
    .mic-btn .mic-sec { font-size: 0.72rem; font-weight: 700; }
    @keyframes mic-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.55); }
      70%  { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
      100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
    }
  `);

  const Dictate = {};
  Dictate.available = !!SR;

  function setState(btn, recording, sec) {
    btn.classList.toggle('recording', recording);
    btn.setAttribute('aria-pressed', recording ? 'true' : 'false');
    if (recording) {
      btn.innerHTML = '⏹' + (sec != null ? ' <span class="mic-sec">' + sec + 's</span>' : '');
    } else {
      btn.textContent = '🎤';
    }
  }

  function permissionToast() {
    App.toast('Mikrofon-Zugriff wurde verweigert — bitte in den Browser-Einstellungen erlauben.');
  }

  /* ---------- Variante 1: Spracherkennung (bevorzugt) ---------- */
  function wireRecognition(btn, opts) {
    let rec = null;
    let active = false;

    function stop() {
      active = false;
      if (rec) {
        const r = rec;
        rec = null;
        try { r.stop(); } catch (_) {}
      }
      setState(btn, false);
    }

    btn.addEventListener('click', () => {
      if (active) { stop(); return; }

      rec = new SR();
      rec.lang = 'de-DE';
      rec.continuous = true;
      rec.interimResults = true; // Zwischenergebnisse kommen, angehängt wird nur Finales

      rec.onresult = (ev) => {
        // Button wurde durch ein Neu-Rendern ersetzt? Dann Aufnahme beenden.
        if (!btn.isConnected) { stop(); return; }
        let finalText = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
        }
        finalText = finalText.trim();
        if (finalText && typeof opts.onText === 'function') opts.onText(finalText);
      };

      rec.onerror = (ev) => {
        const err = ev && ev.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          permissionToast();
        } else if (err === 'audio-capture') {
          App.toast('Kein Mikrofon gefunden.');
        } else if (err && err !== 'aborted' && err !== 'no-speech') {
          App.toast('Diktieren hat leider nicht geklappt.');
        }
        stop();
      };

      // Erkennung kann von selbst enden (Stille, Netz) — Zustand aufräumen.
      rec.onend = () => { if (active) stop(); };

      try {
        rec.start();
        active = true;
        setState(btn, true);
      } catch (_) {
        stop();
        App.toast('Diktieren konnte nicht gestartet werden.');
      }
    });
  }

  /* ---------- Variante 2: Sprachnotiz per MediaRecorder (Fallback) ---------- */
  function wireRecorder(btn, opts) {
    let recorder = null;
    let stream = null;
    let chunks = [];
    let stopTimer = null;
    let tick = null;
    let starting = false;

    function cleanup() {
      clearTimeout(stopTimer);
      clearInterval(tick);
      stopTimer = null;
      tick = null;
      if (stream) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
        stream = null;
      }
      recorder = null;
      setState(btn, false);
    }

    btn.addEventListener('click', async () => {
      if (recorder && recorder.state === 'recording') {
        try { recorder.stop(); } catch (_) { cleanup(); }
        return;
      }
      if (starting) return;
      starting = true;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        starting = false;
        if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' ||
                  e.name === 'SecurityError')) {
          permissionToast();
        } else {
          App.toast('Kein Mikrofon gefunden oder Aufnahme nicht möglich.');
        }
        return;
      }
      starting = false;

      chunks = [];
      try {
        recorder = new MediaRecorder(stream);
      } catch (_) {
        cleanup();
        App.toast('Sprachaufnahme wird auf diesem Gerät nicht unterstützt.');
        return;
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        const mime = (recorder && recorder.mimeType) || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        chunks = [];
        cleanup();
        if (!blob.size) { App.toast('Es wurde nichts aufgenommen.'); return; }
        const fr = new FileReader();
        fr.onload = () => {
          if (typeof opts.onAudio === 'function') opts.onAudio(String(fr.result), mime);
        };
        fr.onerror = () => App.toast('Aufnahme konnte nicht gespeichert werden.');
        fr.readAsDataURL(blob);
      };

      recorder.onerror = () => {
        cleanup();
        App.toast('Bei der Aufnahme ist ein Fehler aufgetreten.');
      };

      recorder.start();
      let remaining = MAX_AUFNAHME_SEK;
      setState(btn, true, remaining);
      tick = setInterval(() => {
        remaining -= 1;
        if (remaining >= 0 && btn.isConnected) setState(btn, true, remaining);
      }, 1000);
      stopTimer = setTimeout(() => {
        if (recorder && recorder.state === 'recording') {
          try { recorder.stop(); } catch (_) { cleanup(); }
          App.toast('Maximale Aufnahmedauer (60 s) erreicht.');
        }
      }, MAX_AUFNAHME_SEK * 1000);
    });
  }

  /* ---------- Öffentliche API ---------- */
  Dictate.micButton = function (opts) {
    opts = opts || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mic-btn';
    setState(btn, false);
    const title = opts.title || (SR ? 'Diktieren' : 'Sprachnotiz aufnehmen (max. 60 s)');
    btn.title = title;
    btn.setAttribute('aria-label', title);

    if (SR) {
      wireRecognition(btn, opts);
    } else if (canRecord && typeof opts.onAudio === 'function') {
      wireRecorder(btn, opts);
    } else {
      // Weder Erkennung noch Aufnahme möglich → Button versteckt.
      btn.hidden = true;
      btn.style.display = 'none';
    }
    return btn;
  };

  window.Dictate = Dictate;
})();
