/* Karina Assistent — Hilfsfunktionen (keine Abhängigkeiten) */
(function () {
  'use strict';

  const Util = {};

  /* ---------- IDs ---------- */
  let uidCounter = 0;
  Util.uid = function () {
    uidCounter = (uidCounter + 1) % 1296;
    return Date.now().toString(36) + '-' +
      Math.floor(Math.random() * 1679616).toString(36) + '-' +
      uidCounter.toString(36);
  };

  /* ---------- HTML-Escaping ---------- */
  Util.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---------- Datum & Zeit (deutsch, Montag zuerst) ---------- */
  Util.MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  Util.WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  Util.WOCHENTAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  // Lokales Datum als YYYY-MM-DD (nicht UTC!)
  Util.isoOf = function (d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };
  Util.todayISO = function () { return Util.isoOf(new Date()); };

  Util.parseISO = function (iso) {
    const p = String(iso || '').split('-').map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  };

  Util.addDays = function (iso, n) {
    const d = Util.parseISO(iso);
    d.setDate(d.getDate() + n);
    return Util.isoOf(d);
  };

  // '2026-07-05' -> '05.07.2026'
  Util.fmtDate = function (iso) {
    if (!iso) return '';
    const p = String(iso).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  };

  // Relative Beschriftung: Heute / Morgen / Gestern / Mo, 06.07.2026
  Util.fmtDateRel = function (iso) {
    if (!iso) return '';
    const today = Util.todayISO();
    if (iso === today) return 'Heute';
    if (iso === Util.addDays(today, 1)) return 'Morgen';
    if (iso === Util.addDays(today, -1)) return 'Gestern';
    const d = Util.parseISO(iso);
    const wd = Util.WOCHENTAGE_KURZ[(d.getDay() + 6) % 7];
    return wd + ', ' + Util.fmtDate(iso);
  };

  // ISO-Zeitstempel -> '05.07.2026, 14:30'
  Util.fmtDateTime = function (ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return String(d.getDate()).padStart(2, '0') + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() + ', ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  Util.fmtMinutes = function (min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' Min.';
    const h = Math.floor(min / 60), m = min % 60;
    return h + ' Std.' + (m ? ' ' + m + ' Min.' : '');
  };

  /* ---------- Status & Priorität ---------- */
  Util.STATUS = ['eingang', 'geplant', 'inarbeit', 'erledigt'];
  Util.STATUS_LABELS = {
    eingang: 'Eingang', geplant: 'Geplant', inarbeit: 'In Arbeit', erledigt: 'Erledigt'
  };
  Util.PRIO_LABELS = { 1: 'Hoch', 2: 'Mittel', 3: 'Niedrig' };

  /* ---------- Mini-Markdown (sicher: erst escapen, dann formatieren) ---------- */
  Util.mdToHtml = function (md) {
    const lines = String(md || '').split(/\r?\n/);
    const out = [];
    let inUl = false, inOl = false;
    const closeLists = () => {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    };
    const inline = (s) => {
      s = Util.esc(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        closeLists();
        const lvl = m[1].length + 1; // h2..h4
        out.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>');
      } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push('<li>' + inline(m[1]) + '</li>');
      } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push('<li>' + inline(m[1]) + '</li>');
      } else if (line.trim() === '') {
        closeLists();
      } else {
        closeLists();
        out.push('<p>' + inline(line) + '</p>');
      }
    }
    closeLists();
    return out.join('\n');
  };

  /* ---------- CSS-Injektion pro Feature ---------- */
  Util.injectCSS = function (id, cssText) {
    if (document.getElementById('css-' + id)) return;
    const el = document.createElement('style');
    el.id = 'css-' + id;
    el.textContent = cssText;
    document.head.appendChild(el);
  };

  /* ---------- Dateiname-Slug für Exporte ---------- */
  Util.slug = function (s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'notiz';
  };

  window.Util = Util;
})();
