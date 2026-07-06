# Karina Assistant — Spezifikation (1 Seite)

**Was die App tut:** Ein persönlicher Assistent zum Kopf-Freimachen. Jeder Gedanke wird in
Sekunden erfasst und später zu Aufgabe, Notiz oder Termin sortiert; gearbeitet wird mit
Fokus-Timer und Kanban-Board. Deutsche Oberfläche, läuft auf Handy und PC, alle Daten bleiben
auf dem Gerät. Keine Konten, keine externen Server, keine Abhängigkeiten.

## Funktionen (je eine Zeile)

- **Eingang (Inbox):** Immer erreichbare Erfassungsbox — jeder Gedanke landet hier in Sekunden, unsortiert. *Das ist die Startseite.*
- **Diktierfunktion:** Mikrofon-Knopf an der Erfassungsbox und im Notiz-Editor — sprechen statt tippen; der Text erscheint direkt im Feld (Spracherkennung des Geräts; wo nicht verfügbar, wird eine Sprachnotiz als Audiodatei lokal gespeichert).
- **Übersicht („Alles"):** Eine lesbare Liste von allem in der App — heute Fälliges, alle Aufgaben, Termine, Notizen und Fokus-Sitzungen an einem Ort. Nichts ist nur im Kalender versteckt.
- **Aufgaben:** To-do-Liste mit Fälligkeitsdatum, Priorität und Status.
- **Kalender:** Zusätzliche Monats- und Wochenansicht (Montag zuerst) *innerhalb der App* — kein Zugriff auf den Handy-Kalender, nichts verlässt die App.
- **Notizen:** Markdown-Notizen mit Vorschau.
- **Fokus-Timer:** Pomodoro-Timer (25/5, einstellbar), läuft immer gegen eine gewählte Aufgabe.
- **Kanban-Board:** Dieselben Aufgaben als Board — Spalten = Status (Eingang · Geplant · In Arbeit · Erledigt), Karten per Drag & Drop verschiebbar.

## Verbindungen (das eigentliche Produkt)

1. **Eingang → alles:** Jeder Eingangs-Eintrag wird mit einem Tipp zu *Aufgabe*, *Notiz* oder *Termin* — oder gelöscht.
2. **Aufgaben = Kanban:** Ein und dieselben Objekte. Karte verschieben ändert den Aufgaben-Status überall; Aufgabe abhaken schiebt die Karte nach *Erledigt*.
3. **Aufgaben → Kalender:** Eine Aufgabe mit Fälligkeitsdatum erscheint automatisch an diesem Kalendertag; erledigt = durchgestrichen im Kalender.
4. **Kalender → Aufgaben/Termine:** Tipp auf einen Tag legt dort direkt eine Aufgabe oder einen Termin an.
5. **Timer → Aufgaben:** Der Timer wird aus einer Aufgabe gestartet; abgeschlossene Sitzungen werden an der Aufgabe gezählt (Anzahl + Minuten).
6. **Timer → Kalender:** Jede abgeschlossene Fokus-Sitzung erscheint als Zeitblock im Kalender.
7. **Notizen ↔ Aufgaben/Termine:** Eine Notiz kann an jede Aufgabe / jeden Termin angehängt werden; die Aufgabe zeigt ihre Notizen, die Notiz zeigt ihre Verknüpfung.
8. **Alles → Übersicht:** Jedes Objekt (Eingang, Aufgabe, Termin, Notiz, Fokus-Sitzung) ist in der Übersicht lesbar und antippbar — der Kalender ist nur eine zusätzliche Ansicht, nie der einzige Ort.
9. **Diktieren → überall erfassen:** Diktierter Text landet genau wie getippter im Eingang oder in der Notiz und durchläuft dieselbe Sortierung.

## Technik & Datenhaltung

- **Stack:** Reines HTML/CSS/JavaScript als PWA. Null Abhängigkeiten, kein Build-Schritt — wartbar für immer. Liegt im Ordner `assistant/` dieses Repos.
- **Phone-first:** Auf dem Handy zum Homescreen installierbar, läuft komplett offline. Daten liegen im Gerätespeicher des Browsers und verlassen das Gerät nie.
- **Backup (lesbares Format):** Ein Knopf exportiert eine ZIP-Datei mit `notizen/*.md` (echte Markdown-Dateien) und `aufgaben.json`, `kalender.json`, `eingang.json`, `sitzungen.json` (formatiertes JSON). Import stellt alles wieder her. Am PC (Chrome/Edge) zusätzlich: „Mit Ordner verbinden" — die App spiegelt dieselben Dateien live in einen echten Ordner.
- **Ein Hinweis zur Installation:** Damit das Handy die App als PWA installieren kann, müssen die statischen App-Dateien einmal über HTTPS erreichbar sein. Vorschlag: GitHub Pages aus diesem Repo — dabei liegt nur der App-Code dort, **deine Daten berühren nie einen Server**. Am PC geht auch direkt `index.html` öffnen.

## Abnahme-Durchlauf (muss in einem Rutsch klappen)

App öffnen → Gedanke im Eingang erfassen (getippt oder diktiert) → zu Aufgabe mit
Fälligkeitsdatum sortieren → Aufgabe erscheint in der Übersicht **und** im Kalender →
Fokus-Timer auf diese Aufgabe starten → Notiz an die Aufgabe hängen → App schließen und neu
öffnen → alles noch da, null Fehler, keine Platzhalter-Seiten.
