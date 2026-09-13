import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.ARENA_URL || 'http://127.0.0.1:5196/';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];

async function createPlayer(fighter) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/main-2d\.js(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const instrumentation = `\nwindow.__onlineQA=()=>({running,onlineMode,onlineRole,player:{key:player.key,x:player.x,damage:player.damage,combo:player.comboStep},opponent:{key:cpu.key,x:cpu.x,damage:cpu.damage,combo:cpu.comboStep}});window.__onlineClose=()=>{player.x=700;cpu.x=810;player.y=690-player.height;cpu.y=690-cpu.height;player.vx=cpu.vx=0;};`;
    await route.fulfill({ response, body: (await response.text()) + instrumentation });
  });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('#title-start-button:not([disabled])').click();
  await page.locator('#title-screen').waitFor({ state: 'hidden' });
  await page.locator('#online-button:not([disabled])').waitFor();
  await page.locator(`[data-character="${fighter}"]`).click();
  return { context, page };
}

try {
  const first = await createPlayer('arc');
  const second = await createPlayer('jet');
  await Promise.all([first.page.locator('#online-button').click(), second.page.locator('#online-button').click()]);
  await Promise.all([
    first.page.waitForFunction(() => window.__onlineQA().running),
    second.page.waitForFunction(() => window.__onlineQA().running),
  ]);

  const firstState = await first.page.evaluate(() => window.__onlineQA());
  const secondState = await second.page.evaluate(() => window.__onlineQA());
  const host = firstState.onlineRole === 'host' ? first : second;
  const guest = firstState.onlineRole === 'guest' ? first : second;
  assert.deepEqual(new Set([firstState.onlineRole, secondState.onlineRole]), new Set(['host', 'guest']));
  assert.equal(firstState.player.key, 'arc');
  assert.equal(secondState.player.key, 'jet');

  await Promise.all([
    first.page.waitForFunction(() => document.getElementById('timer').textContent === '02:59', null, { timeout: 7_000 }),
    second.page.waitForFunction(() => document.getElementById('timer').textContent === '02:59', null, { timeout: 7_000 }),
  ]);
  const before = await host.page.evaluate(() => window.__onlineQA().opponent.x);
  await guest.page.keyboard.down('KeyA');
  await guest.page.waitForTimeout(350);
  await guest.page.keyboard.up('KeyA');
  await host.page.waitForTimeout(250);
  const hostAfter = await host.page.evaluate(() => window.__onlineQA());
  const guestAfter = await guest.page.evaluate(() => window.__onlineQA());
  assert(hostAfter.opponent.x < before - 5);
  assert(Math.abs(hostAfter.opponent.x - guestAfter.player.x) < 35);
  await host.page.evaluate(() => window.__onlineClose());
  await guest.page.keyboard.press('KeyJ');
  await host.page.waitForFunction(() => window.__onlineQA().player.damage > 0);
  await guest.page.waitForFunction(() => window.__onlineQA().opponent.damage > 0);
  assert.deepEqual(errors, []);
  await host.page.screenshot({ path: '/private/tmp/skybreak-online-match.png' });
  console.log('Quick match browser check passed.', JSON.stringify({ first: firstState.onlineRole, second: secondState.onlineRole, moved: Math.round(before - hostAfter.opponent.x) }));
  await first.context.close();
  await second.context.close();
} finally {
  await browser.close();
}
