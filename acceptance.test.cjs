/* Karina Assistent — Abnahme-Test: kompletter Durchlauf durch alle Funktionen
   und alle Verbindungen, inklusive Neustart-Prüfung.
   Start:  node tests/acceptance.test.cjs   (benötigt Playwright + Chromium) */
'use strict';

const { spawn } = require('child_process');
const path = require('path');

let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }

const PORT = 8791;
const BASE = 'http://127.0.0.1:' + PORT + '/';
const ROOT = path.join(__dirname, '..');

const results = [];
function step(name) { results.push({ name, ok: true }); console.log('  ✔ ' + name); }
function fail(name, err) { results.push({ name, ok: false, err }); console.log('  ✘ ' + name + ' — ' + err); }

async function expectVisible(page, selector, text, name) {
  const loc = text != null
    ? page.locator(selector, { hasText: text }).first()
    : page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  step(name);
  return loc;
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 400, height: 850 } });
  const errors = [];
  let page = await context.newPage();
  const hookPage = (p) => {
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('dialog', d => d.accept());
  };
  hookPage(page);

  const today = new Date();
  const todayISO = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');

  const TASK = 'Steuererklärung vorbereiten';
  const NOTE_TITLE = 'Unterlagen-Checkliste';
  const NOTE_BODY = '## Wichtig\n\n- Belege sortieren\n- **Frist** beachten';
  const EVENT = 'Zahnarzt Kontrolle';

  try {
    /* ---------- 1. App öffnet auf dem Eingang ---------- */
    await page.goto(BASE);
    await expectVisible(page, '#in-capture', null, 'App startet auf dem Eingang (Erfassungsbox sichtbar)');

    /* ---------- 2. Gedanke erfassen ---------- */
    await page.fill('#in-capture', TASK);
    await page.click('#in-add');
    await expectVisible(page, '.list-item', TASK, 'Gedanke landet im Eingang');
    const badge = await page.textContent('.tabbar button[data-view="eingang"] .tab-badge');
    if (badge.trim() === '1') step('Eingang-Zähler in der Tab-Leiste zeigt 1');
    else fail('Eingang-Zähler', 'Badge = ' + badge);

    /* ---------- 3. Sortieren: → Aufgabe mit Fälligkeit heute ---------- */
    await page.click('button[data-act="task"]');
    await page.fill('input[data-f="due"]', todayISO);
    await page.click('button[data-act="task-save"]');
    await page.waitForTimeout(200);
    if (await page.locator('.list-item', { hasText: TASK }).count() === 0)
      step('Eingangs-Eintrag ist nach dem Sortieren verschwunden');
    else fail('Eingang leeren', 'Eintrag noch da');

    /* ---------- 4. Aufgabe in der Übersicht ---------- */
    await page.click('.tabbar button[data-view="uebersicht"]');
    await expectVisible(page, '.card', TASK, 'Aufgabe erscheint in der Übersicht (Heute)');

    /* ---------- 5. Aufgabe im Kalender ---------- */
    await page.click('.tabbar button[data-view="kalender"]');
    await expectVisible(page, '.cal-root, #view-root', TASK, 'Aufgabe erscheint im Kalender (Tagesdetail heute)');

    /* ---------- 6. Aufgabe im Board (Spalte Geplant) ---------- */
    await page.click('.tabbar button[data-view="board"]');
    const col = page.locator('.kb-col', { hasText: 'Geplant' }).first();
    await col.locator('.kb-card', { hasText: TASK }).first().waitFor({ timeout: 5000 });
    step('Aufgabe liegt im Board in der Spalte „Geplant"');

    /* ---------- 7. Board: Karte nach „In Arbeit" verschieben ---------- */
    await col.locator('.kb-card', { hasText: TASK }).first().locator('button').last().click();
    await page.locator('button, [role="menuitem"]', { hasText: 'In Arbeit' }).first().click();
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => Store.all('tasks')[0] && Store.all('tasks')[0].status);
    if (st === 'inarbeit') step('Kartenverschieben ändert den Aufgaben-Status (Board = Aufgaben)');
    else fail('Board-Verschieben', 'Status = ' + st);

    /* ---------- 8. Fokus-Timer aus der Aufgabe starten ---------- */
    await page.click('.tabbar button[data-view="aufgaben"]');
    await page.locator('.tk-row', { hasText: TASK }).first().click();
    await page.click('button[data-act="focus"]');
    await expectVisible(page, '#tm-task', null, 'Timer öffnet sich mit Aufgabenauswahl');
    const preselected = await page.locator('#tm-task option:checked').textContent();
    if (preselected.includes(TASK)) step('Timer hat die Aufgabe vorausgewählt');
    else fail('Timer-Vorauswahl', 'gewählt: ' + preselected);

    // Kurze Sitzung erzwingen (2,4 s), damit der Test den natürlichen Ablauf prüft
    await page.evaluate(() => Store.setSettings({ fokusMin: 0.04 }));
    await page.click('#tm-start');
    await expectVisible(page, '#tm-clock', null, 'Timer läuft (Countdown sichtbar)');
    await page.locator('button', { hasText: 'Überspringen' }).first().waitFor({ timeout: 15000 });
    step('Sitzung läuft natürlich ab und bietet eine Pause an');
    await page.locator('button', { hasText: 'Überspringen' }).first().click();
    const nSess = await page.evaluate(() => Store.all('sessions').length);
    if (nSess === 1) step('Fokus-Sitzung wurde gespeichert');
    else fail('Sitzung speichern', 'sessions = ' + nSess);
    await page.evaluate(() => Store.setSettings({ fokusMin: 25 }));

    /* ---------- 9. Sitzung im Kalender ---------- */
    await page.click('.tabbar button[data-view="kalender"]');
    await expectVisible(page, '#view-root', 'Fokus', 'Fokus-Sitzung erscheint im Kalender-Tagesdetail');

    /* ---------- 10. Notiz an die Aufgabe hängen ---------- */
    await page.click('.tabbar button[data-view="aufgaben"]');
    await page.locator('.tk-row', { hasText: TASK }).first().click();
    await page.click('button[data-act="note"]');
    await expectVisible(page, '#nt-in-title', null, 'Notiz-Editor öffnet sich (verknüpft mit Aufgabe)');
    const linkSel = await page.locator('#nt-in-link option:checked').textContent();
    if (linkSel.includes(TASK)) step('Verknüpfung zur Aufgabe ist im Editor vorausgewählt');
    else fail('Notiz-Verknüpfung', 'gewählt: ' + linkSel);
    await page.fill('#nt-in-title', NOTE_TITLE);
    await page.fill('#nt-in-body', NOTE_BODY);
    await page.click('#nt-save');
    await expectVisible(page, '#view-root h2, #view-root h3', 'Wichtig', 'Notiz gespeichert, Markdown wird gerendert');

    /* ---------- 11. Notiz an der Aufgabe sichtbar ---------- */
    await page.click('.tabbar button[data-view="aufgaben"]');
    await page.locator('.tk-row', { hasText: TASK }).first().click();
    await expectVisible(page, '.tk-detail', NOTE_TITLE, 'Aufgabe zeigt die verknüpfte Notiz');

    /* ---------- 12. Termin über den Kalender anlegen ---------- */
    await page.click('.tabbar button[data-view="kalender"]');
    await page.click('button[data-act="add-event"]');
    await page.locator('#view-root form input[type="text"], #view-root form .input').first().fill(EVENT);
    await page.locator('button', { hasText: 'Termin anlegen' }).first().click();
    await expectVisible(page, '#view-root', EVENT, 'Termin über den Kalender angelegt');

    /* ---------- 13. Termin in der Übersicht ---------- */
    await page.click('.tabbar button[data-view="uebersicht"]');
    await expectVisible(page, '.card', EVENT, 'Termin erscheint in der Übersicht');

    /* ---------- 14. Eingang → Notiz und → Termin (Sortierwege) ---------- */
    await page.click('.tabbar button[data-view="eingang"]');
    await page.fill('#in-capture', 'Geschenkidee: Kochbuch für Mama');
    await page.click('#in-add');
    await page.locator('.list-item button[data-act="note"]').first().click();
    await expectVisible(page, '#nt-in-title', null, 'Eingang → Notiz öffnet den Editor');
    const noteTitleVal = await page.inputValue('#nt-in-title');
    if (noteTitleVal.includes('Geschenkidee')) step('Notiz-Titel aus erster Zeile übernommen');
    else fail('Eingang→Notiz Titel', 'Titel: ' + noteTitleVal);
    await page.click('#nt-save');

    /* ---------- 15. Neustart: Daten bleiben erhalten ---------- */
    page = await context.newPage();
    hookPage(page);
    await page.goto(BASE);
    await page.waitForSelector('#in-capture');
    const persisted = await page.evaluate(() => ({
      tasks: Store.all('tasks').length,
      notes: Store.all('notes').length,
      events: Store.all('events').length,
      sessions: Store.all('sessions').length,
      inbox: Store.all('inbox').length
    }));
    if (persisted.tasks === 1 && persisted.notes === 2 && persisted.events === 1 &&
        persisted.sessions === 1 && persisted.inbox === 0)
      step('Neustart: alle Daten sind noch da (' + JSON.stringify(persisted) + ')');
    else fail('Neustart-Persistenz', JSON.stringify(persisted));
    await page.click('.tabbar button[data-view="uebersicht"]');
    await expectVisible(page, '.card', TASK, 'Nach Neustart: Aufgabe weiterhin in der Übersicht');
    await page.click('.tabbar button[data-view="notizen"]');
    await expectVisible(page, '.nt-row', NOTE_TITLE, 'Nach Neustart: Notiz weiterhin da');

    /* ---------- 16. Backup-Export liefert lesbares ZIP ---------- */
    await page.click('#btn-settings');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.click('#btn-export')
    ]);
    const zipPath = path.join(require('os').tmpdir(), 'karina-test-backup.zip');
    await download.saveAs(zipPath);
    const names = require('child_process')
      .execSync('python3 -c "import zipfile;print(chr(10).join(zipfile.ZipFile(\'' + zipPath + '\').namelist()))"')
      .toString();
    if (names.includes('aufgaben.json') && names.includes('_meta.json') && /notizen\/.*\.md/.test(names))
      step('Backup-ZIP enthält aufgaben.json, _meta.json und notizen/*.md');
    else fail('Backup-Inhalt', names);
    await page.click('#btn-close-settings');

    /* ---------- 16b. Import-Rundweg: löschen, dann Backup zurückspielen ---------- */
    await page.evaluate(() => Store.resetAll());
    const cleared = await page.evaluate(() => Store.all('tasks').length + Store.all('notes').length);
    if (cleared === 0) step('Daten gelöscht (Vorbereitung Import-Test)');
    else fail('Reset', 'noch ' + cleared + ' Objekte');
    await page.click('#btn-settings');
    await page.setInputFiles('#import-file', zipPath);
    await page.waitForTimeout(400);
    const restored = await page.evaluate(() => ({
      tasks: Store.all('tasks').length, notes: Store.all('notes').length,
      events: Store.all('events').length, sessions: Store.all('sessions').length
    }));
    if (restored.tasks === 1 && restored.notes === 2 && restored.events === 1 && restored.sessions === 1)
      step('Backup-Import stellt alle Daten wieder her');
    else fail('Backup-Import', JSON.stringify(restored));
    if (!await page.locator('#settings-dialog[open]').count()) step('Einstellungen nach Import geschlossen');
    else await page.click('#btn-close-settings').catch(() => {});

    /* ---------- 17. Alle Ansichten öffnen ohne Fehler / Platzhalter ---------- */
    for (const v of ['eingang', 'uebersicht', 'aufgaben', 'board', 'kalender', 'notizen', 'timer']) {
      await page.click('.tabbar button[data-view="' + v + '"]');
      await page.waitForTimeout(120);
      const txt = (await page.textContent('#view-root')).trim();
      if (txt.length > 10 && !/error|undefined|NaN|\[object/i.test(txt)) step('Ansicht „' + v + '" rendert sauber');
      else fail('Ansicht ' + v, txt.slice(0, 120));
    }
  } catch (e) {
    fail('Testlauf abgebrochen', e.message);
  }

  /* ---------- Null-Fehler-Kriterium ---------- */
  if (errors.length === 0) step('Null Konsolen-/Seitenfehler im gesamten Durchlauf');
  else fail('Fehlerfreiheit', errors.length + ' Fehler: ' + errors.slice(0, 5).join(' | '));

  await browser.close();
  server.kill();

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' Prüfungen bestanden.');
  if (failed.length) { console.log('FEHLGESCHLAGEN:'); failed.forEach(f => console.log(' - ' + f.name + ': ' + f.err)); process.exit(1); }
  console.log('ABNAHME BESTANDEN ✔');
  process.exit(0);
})();
