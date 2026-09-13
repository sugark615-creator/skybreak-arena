import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Instrumentation is injected into test responses only; none is shipped to players.
const baseURL = process.env.ARENA_URL || 'http://127.0.0.1:5196/';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
const checks = [];

async function createPlayer(mobile = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 },
    hasTouch: mobile,
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/main-2d\.js(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + `
      window.__lifecycle = {
        state: () => ({ running, paused, onlineMode, onlineRole, exitPromptOpen,
          matchTime, countdown, input: localInputState(), remoteInput: {...remoteInput} }),
        disconnect: () => onlineClient.socket.close(4010, 'test connection loss'),
        finish: () => finishMatch(true),
      };
    ` });
  });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('#title-start-button:not([disabled])').click();
  await page.locator('#title-screen').waitFor({ state: 'hidden' });
  await page.locator('#online-button:not([disabled])').waitFor();
  return page;
}

async function search(page) {
  const resultVisible = await page.locator('#result-screen').evaluate(el => el.classList.contains('visible'));
  await page.locator(resultVisible ? '#restart-button' : '#online-button').click();
}

async function match(first, second) {
  await search(first);
  await first.waitForFunction(() => document.getElementById('online-screen').classList.contains('visible'));
  await search(second);
  for (const page of [first, second]) {
    await page.waitForFunction(() => window.__lifecycle.state().running);
    assert.equal(await page.locator('#pause-button').textContent(), '退出');
    assert.equal(await page.locator('#pause-button').isEnabled(), true);
  }
  const firstRole = await first.evaluate(() => window.__lifecycle.state().onlineRole);
  const host = firstRole === 'host' ? first : second;
  const guest = firstRole === 'guest' ? first : second;
  await host.waitForFunction(() => window.__lifecycle.state().countdown === 0);
  await guest.waitForFunction(() => window.__lifecycle.state().countdown === 0);
  return { host, guest };
}

async function result(page) {
  await page.locator('#result-screen.visible').waitFor();
  assert.equal(await page.evaluate(() => window.__lifecycle.state().running), false);
  assert.equal(await page.locator('#exit-screen').evaluate(el => el.classList.contains('visible')), false);
}

async function visibleButton(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  assert(box && box.height >= 44 && box.width >= 44, `${selector} must be a usable touch target`);
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
    `${selector} must fit on screen`);
}

try {
  const desktop = await createPlayer();
  const mobile = await createPlayer(true);
  let { host, guest } = await match(desktop, mobile);
  await visibleButton(mobile, '#pause-button');
  await mobile.screenshot({ path: '/private/tmp/skybreak-exit-battle.png' });

  await guest.keyboard.down('KeyD');
  await host.waitForFunction(() => window.__lifecycle.state().remoteInput.right);
  await guest.locator('#pause-button').click();
  await guest.locator('#exit-screen.visible').waitFor();
  await host.waitForFunction(() => !window.__lifecycle.state().remoteInput.right);
  await guest.keyboard.up('KeyD');
  const before = await host.evaluate(() => window.__lifecycle.state().matchTime);
  await guest.keyboard.press('KeyK');
  assert.equal(await guest.evaluate(() => window.__lifecycle.state().input.specialSeq), 0);
  assert.equal(await guest.evaluate(() => window.__lifecycle.state().paused), false);
  await host.waitForFunction(time => window.__lifecycle.state().matchTime < time - .3, before);
  await visibleButton(guest, '#exit-confirm-button');
  await guest.screenshot({ path: '/private/tmp/skybreak-exit-landscape.png' });
  await guest.locator('#exit-cancel-button').click();
  assert.equal(await guest.evaluate(() => window.__lifecycle.state().running), true);
  checks.push('exit is visible; confirmation clears input without pausing; cancel resumes controls');

  await guest.keyboard.press('Escape');
  await guest.locator('#exit-screen.visible').waitFor();
  assert.equal(await guest.evaluate(() => document.activeElement.id), 'exit-cancel-button');
  await guest.keyboard.press('Shift+Tab');
  assert.equal(await guest.evaluate(() => document.activeElement.id), 'exit-confirm-button');
  await guest.keyboard.press('Tab');
  assert.equal(await guest.evaluate(() => document.activeElement.id), 'exit-cancel-button');
  await guest.keyboard.press('Escape');
  assert.equal(await guest.evaluate(() => window.__lifecycle.state().exitPromptOpen), false);
  await guest.evaluate(() => document.activeElement.blur());
  await guest.keyboard.press('Escape');
  await guest.keyboard.press('Escape');
  assert.equal(await guest.evaluate(() => document.activeElement.id), 'pause-button');
  checks.push('Escape toggle and keyboard focus trap');

  await guest.keyboard.down('KeyD');
  await host.waitForFunction(() => window.__lifecycle.state().remoteInput.right);
  await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
  await host.waitForFunction(() => !window.__lifecycle.state().remoteInput.right);
  await guest.keyboard.up('KeyD');
  checks.push('backgrounding a guest immediately releases remote movement');

  await guest.locator('#pause-button').click();
  await host.evaluate(() => window.__lifecycle.finish());
  await Promise.all([result(host), result(guest)]);
  assert.equal(await host.locator('#result-title').textContent(), '勝利');
  assert.equal(await guest.locator('#result-title').textContent(), '敗北');
  await guest.locator('#change-character-button').click();
  assert.equal(await host.locator('#result-title').textContent(), '勝利');
  checks.push('natural result closes exit dialog; later peer departure does not overwrite result');

  ({ host, guest } = await match(desktop, mobile));
  await mobile.setViewportSize({ width: 568, height: 320 });
  await mobile.locator('#pause-button').tap();
  await mobile.locator('#exit-screen.visible').waitFor();
  await visibleButton(mobile, '#exit-confirm-button');
  await mobile.locator('#exit-cancel-button').tap();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.locator('#portrait-exit-button').waitFor({ state: 'visible' });
  await visibleButton(mobile, '#portrait-exit-button');
  await mobile.locator('#portrait-exit-button').tap();
  await mobile.locator('#exit-screen.visible').waitFor();
  await visibleButton(mobile, '#exit-confirm-button');
  await mobile.screenshot({ path: '/private/tmp/skybreak-exit-portrait.png' });
  await mobile.locator('#exit-confirm-button').tap();
  await mobile.locator('#start-screen.visible').waitFor();
  assert.equal(await mobile.evaluate(() => window.__lifecycle.state().onlineMode), false);
  await result(desktop);
  assert.match(await desktop.locator('#result-copy').textContent(), /退出/);
  await mobile.setViewportSize({ width: 844, height: 390 });
  checks.push('portrait exit works and grants opponent a win');

  for (const role of ['host', 'guest']) {
    ({ host, guest } = await match(desktop, mobile));
    const lost = role === 'host' ? host : guest;
    const peer = role === 'host' ? guest : host;
    await lost.locator('#pause-button').click();
    if(lost === mobile)await mobile.setViewportSize({ width: 390, height: 844 });
    await lost.evaluate(() => window.__lifecycle.disconnect());
    await Promise.all([result(lost), result(peer)]);
    assert.equal(await lost.locator('#result-title').textContent(), '通信が切れました');
    assert.equal(await peer.locator('#result-title').textContent(), '勝利');
    if(lost === mobile){
      assert.equal(await mobile.locator('#rotate-notice').isVisible(), false);
      await visibleButton(mobile, '#restart-button');
      await mobile.setViewportSize({ width: 844, height: 390 });
    }
    checks.push(`${role} connection loss closes confirmation and offers next match`);
  }

  await desktop.locator('#change-character-button').click();
  await mobile.locator('#change-character-button').click();
  await search(desktop);
  await desktop.waitForFunction(() => window.__lifecycle.state().onlineMode);
  await desktop.evaluate(() => window.__lifecycle.disconnect());
  await desktop.locator('#online-retry-button').waitFor({ state: 'visible' });
  await desktop.locator('#online-retry-button').click();
  await desktop.waitForFunction(() => document.getElementById('online-title').textContent === '対戦相手を探しています');
  await desktop.locator('#online-cancel-button').click();
  await desktop.locator('#start-screen.visible').waitFor();
  checks.push('failed search retries directly; cancel returns to selection');

  await desktop.locator('#start-button').click();
  await desktop.waitForFunction(() => window.__lifecycle.state().running);
  await desktop.keyboard.press('Escape');
  await desktop.locator('#pause-screen.visible').waitFor();
  assert.equal(await desktop.evaluate(() => window.__lifecycle.state().paused), true);
  await desktop.locator('#menu-button').click();
  await desktop.locator('#start-screen.visible').waitFor();
  checks.push('offline pause/menu still works');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  await browser.close();
}
