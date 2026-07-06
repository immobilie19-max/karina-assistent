# Karina Assistent — Integrationsvertrag (für Entwicklung & Wartung)

Jede Funktion ist genau eine Datei in `js/` und registriert sich als Ansicht.
Reines JavaScript (IIFE, `'use strict'`), **keine Abhängigkeiten, keine Module, kein Build**.
Alle UI-Texte auf Deutsch. Alles Benutzergenerierte wird mit `Util.esc()` escaped.

## Ansicht registrieren

```js
(function () {
  'use strict';
  Util.injectCSS('meinfeature', ` ...feature-eigenes CSS... `);
  App.registerView('name', {
    title: 'Titel', icon: '🔤', order: N,
    render(el, params) { el.innerHTML = ...; /* Listener anhängen */ }
  });
})();
```

- `render` wird bei Navigation UND nach jeder Datenänderung neu aufgerufen —
  immer komplett neu rendern, keinen DOM-Zustand voraussetzen.
- `params` ist nur beim ersten Rendern nach `App.navigate(name, params)` gesetzt, sonst `null`.
- Langlebiger Zustand (z. B. laufender Timer, gewählter Monat) gehört in Modul-Variablen der IIFE.

## Ansichten & Reihenfolge (order)

| name        | title      | icon | order | Datei          | params                                              |
|-------------|-----------|------|-------|----------------|-----------------------------------------------------|
| `eingang`   | Eingang    | 📥  | 1     | js/inbox.js    | —                                                   |
| `uebersicht`| Übersicht  | 🏠  | 2     | js/overview.js | —                                                   |
| `aufgaben`  | Aufgaben   | ✅  | 3     | js/tasks.js    | `{newDue}` neue Aufgabe mit Datum · `{taskId}` hervorheben |
| `board`     | Board      | 📋  | 4     | js/kanban.js   | —                                                   |
| `kalender`  | Kalender   | 📅  | 5     | js/calendar.js | `{date}` Tag auswählen                              |
| `notizen`   | Notizen    | 📝  | 6     | js/notes.js    | `{noteId}` öffnen · `{edit:true, noteId?, linkTo?}` Editor |
| `timer`     | Timer      | ⏱️  | 7     | js/timer.js    | `{taskId}` Aufgabe vorauswählen                     |

## Datenschicht (`Store`, fertig — nicht ändern)

- `Store.all(coll)` / `Store.get(coll, id)` / `Store.add(coll, obj)` /
  `Store.update(coll, id, patch)` / `Store.remove(coll, id)` / `Store.setSettings(patch)`
- `Store.state.settings` → `{fokusMin, pauseMin}`
- `id` und `createdAt` setzt `Store.add` automatisch. Nach jeder Mutation wird die aktive Ansicht neu gerendert.

### Sammlungen & Felder

- `inbox`:   `{id, text, audio?, audioMime?, createdAt}` — `audio` ist eine dataURL (Sprachnotiz, max. 60 s).
- `tasks`:   `{id, title, due, priority, status, createdAt, completedAt}`
  - `due`: `'YYYY-MM-DD'` oder `null` · `priority`: 1|2|3 (`Util.PRIO_LABELS`)
  - `status`: `Util.STATUS` = `eingang|geplant|inarbeit|erledigt` (`Util.STATUS_LABELS`)
  - Beim Erledigen `completedAt` (ISO) setzen, beim Zurückholen auf `null`.
- `events`:  `{id, title, date, time?, createdAt}` — `time` `'HH:MM'` oder leer.
- `notes`:   `{id, title, body, audio?, audioMime?, linkTo, createdAt, updatedAt}`
  - `linkTo`: `{type:'task'|'event', id}` oder `null`. Bei Bearbeitung `updatedAt` setzen.
- `sessions`:`{id, taskId, minutes, startedAt, createdAt}` — nur abgeschlossene/gestoppte Fokus-Sitzungen.

**Verwaiste Verweise immer abfangen:** `Store.get` kann `null` liefern (gelöschte Aufgabe usw.) —
dann `„(gelöschte Aufgabe)"` anzeigen, nie crashen.

## App-API (Verbindungen — fertig, benutzen!)

- `App.navigate(name, params?)`
- `App.startFocus(taskId)` — öffnet Timer mit Aufgabe (aus Aufgaben/Board/Übersicht heraus).
- `App.openNoteEditor({linkTo?, noteId?})` — Notiz-Editor, optional verknüpft.
- `App.newTaskOn(dateISO)` — Aufgabenformular mit Datum (aus dem Kalender).
- `App.toast(msg)` · `App.confirm(msg) → Promise<bool>`

## Diktat-API (`js/dictate.js`, gehört dem Eingang-Agenten)

```js
Dictate.available            // bool: Spracherkennung des Geräts verfügbar
Dictate.micButton({
  onText(text),              // erkannter Text (wird an Feldinhalt angehängt)
  onAudio(dataUrl, mime),    // optional: Fallback Sprachnotiz-Aufnahme (max 60 s)
  title                      // Tooltip
}) // → HTMLButtonElement (Klasse 'mic-btn', toggelt Aufnahme, zeigt Zustand)
```
Spracherkennung: `webkitSpeechRecognition`/`SpeechRecognition`, `lang='de-DE'`, `continuous`.
Ohne Erkennung & mit `onAudio`: MediaRecorder-Sprachnotiz. Ohne beides: Button versteckt.
Notizen-Editor nutzt denselben Button.

## Pflicht-Verbindungen je Funktion

- **Eingang:** Erfassungsbox (Autofokus, Enter = hinzufügen) + `Dictate.micButton`. Jeder Eintrag hat
  Sortier-Aktionen: → Aufgabe (Mini-Formular: Datum/Priorität; Status `geplant` wenn Datum, sonst `eingang`),
  → Notiz (Titel = erste Zeile, Audio wandert mit; danach `App.openNoteEditor({noteId})`),
  → Termin (Mini-Formular: Datum/Uhrzeit), Löschen. Nach dem Sortieren wird der Eingangs-Eintrag entfernt.
- **Aufgaben:** Anlegen/Bearbeiten (Titel, Datum, Priorität, Status), Abhaken ↔ Status `erledigt`.
  Je Aufgabe: „▶ Fokus" → `App.startFocus(id)`, „+ Notiz" → `App.openNoteEditor({linkTo:{type:'task',id}})`,
  verknüpfte Notizen anzeigen (Klick → `App.navigate('notizen',{noteId})`), Fokus-Bilanz (Anzahl, Minuten).
- **Board:** Spalten = `Util.STATUS`. Karte ziehen (Drag & Drop) **und** mobiler Fallback (Verschieben-Menü).
  Spaltenwechsel = `Store.update('tasks', id, {status, completedAt})`. Kartenklick → `App.navigate('aufgaben',{taskId})`.
- **Kalender:** Monatsraster (Mo zuerst, `Util.WOCHENTAGE_KURZ`), Punkte/Einträge für Termine,
  fällige Aufgaben (erledigt = durchgestrichen) und Fokus-Sitzungen. Tag antippen → Tagesdetail mit
  allen Einträgen + „+ Aufgabe" (`App.newTaskOn(date)`) + „+ Termin" (Inline-Formular). Heute-Knopf.
- **Notizen:** Liste + Editor (Titel, Markdown-Text, Mikrofon, Vorschau via `Util.mdToHtml`),
  Verknüpfung wählbar (keine / Aufgabe / Termin), Verknüpfungs-Chip in Liste und Ansicht
  (Klick → zur Aufgabe/zum Kalendertag), Audio-Player wenn `audio` vorhanden.
- **Timer:** Aufgabe wählen (offene Aufgaben; Pflicht vor Start), Countdown `settings.fokusMin`,
  Start/Pause/Weiter/Stopp. Ablauf oder Stopp ≥ 1 Min → `Store.add('sessions', …)` + Hinweis auf Pause
  (`pauseMin`). Läuft über Ansichtswechsel hinweg weiter (Modul-Zustand + `setInterval`), Piepton am Ende
  (WebAudio). Heutige Sitzungen unter dem Timer auflisten.
- **Übersicht:** ALLES lesbar an einem Ort: Heute (fällige + überfällige Aufgaben, Termine, Sitzungen),
  Eingang-Zähler, offene Aufgaben, nächste Termine (14 Tage), neueste Notizen, Fokus-Bilanz der Woche.
  Jeder Eintrag antippbar → zur jeweiligen Ansicht.

## Gestaltung

Basis-Klassen aus `style.css` verwenden: `.card .btn .btn-primary .btn-sm .btn-danger .btn-row
.input .form-row .chip .chip-prio-1/2/3 .chip-primary .list .list-item .empty-state .muted .small .done-text`.
Feature-eigenes CSS über `Util.injectCSS('feature', css)` — Selektoren mit Feature-Präfix
(z. B. `.kb-` für Kanban), damit nichts kollidiert. Leere Zustände immer mit `.empty-state` und
freundlichem deutschen Text erklären.
