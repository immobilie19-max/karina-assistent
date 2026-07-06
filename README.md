# Karina – Persönlicher Assistent

**App im Browser öffnen / am Handy installieren:**
👉 **https://immobilie19-max.github.io/karina-assistent/**

Am Handy: Adresse öffnen → Browser-Menü → **„Zum Startbildschirm hinzufügen"** —
danach läuft die App wie eine normale App, auch offline.

Ein persönlicher Assistent zum Kopf-Freimachen: **Eingang** (Gedanken erfassen, auch per
Diktat), **Übersicht** (alles lesbar an einem Ort), **Aufgaben**, **Kanban-Board**,
**Kalender**, **Notizen** (Markdown) und **Fokus-Timer** — alles miteinander verbunden.

## Datenschutz

In diesem Repo liegt **nur der App-Code**. Deine Aufgaben, Notizen und Termine werden
ausschließlich im Speicher deines Geräts abgelegt und **nie übertragen** — keine Konten,
keine Server. Backup: Zahnrad → „Backup exportieren" erzeugt eine ZIP mit deinen Notizen
als `.md` und allem anderen als lesbares `.json`; „Backup importieren" stellt alles wieder
her (so überträgst du Daten auch zwischen Handy und PC).

## Technik

Reines HTML/CSS/JavaScript, null Abhängigkeiten, kein Build-Schritt. Jede Funktion ist eine
Datei in `js/`; die Regeln stehen in [`CONTRACT.md`](CONTRACT.md), die Spezifikation in
[`SPEC.md`](SPEC.md). Der komplette Abnahme-Test (`tests/acceptance.test.cjs`, Playwright)
deckt alle Funktionen, Verbindungen, Backup und Neustart-Persistenz ab.

Die Veröffentlichung übernimmt `.github/workflows/pages.yml` automatisch bei jedem Push
auf `main`. Nach Änderungen an App-Dateien die Cache-Version in `sw.js`
(`CACHE = 'karina-assistent-vN'`) hochzählen, damit installierte Apps das Update laden.

Dieses Repo ist die veröffentlichte Kopie; die Entwicklung fand im (privaten) Repo
`Karina` im Ordner `assistant/` statt.
