/**
 * Functional check for ASHFALL against a running deployment.
 * Usage: GAME_URL=https://... node scripts/verify-gameplay.cjs
 *
 * Headless software WebGL renders at only a few fps, so interaction waits are
 * generous; gameplay state is asserted through the real DOM/HUD, not screenshots.
 */
const { chromium } = require('/opt/appjet/browser/node_modules/playwright/index.js');
const { execFileSync } = require('node:child_process');

const URL = process.env.GAME_URL || 'http://127.0.0.1:3000';
const fails = [];
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails.push(msg); };
const text = (page, sel) => page.locator(sel).innerText();
const pxDiff = (a, b) => {
  try { execFileSync('compare', ['-metric', 'AE', a, b, 'null:'], { stdio: 'pipe' }); return 0; }
  catch (e) { return Number(String(e.stderr).trim()) || 0; }
};
const touchEvt = (id, x, y, extra = {}) =>
  ({ pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1, ...extra });

(async () => {
  const browser = await chromium.launch();

  /* ------------------------------------------------ desktop ---------------- */
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    await page.goto(URL + '/?touch=0', { waitUntil: 'load' });
    await page.waitForTimeout(4000);

    const start = await text(page, '#startScreen');
    ok(await page.locator('#startScreen').isVisible(), 'desktop: start screen visible');
    ok(/ASHFALL/.test(start), 'desktop: start screen shows ASHFALL title');
    ok(/6 vs 6/.test(start), 'desktop: brief states 6 vs 6 teams');
    await page.screenshot({ path: '/tmp/d_start.png' });
    const variance = Number(execFileSync('convert', ['/tmp/d_start.png', '-format', '%[fx:standard_deviation]', 'info:']).toString().trim());
    ok(variance > 0.03, 'desktop: WebGL city renders, not a blank frame (variance ' + variance.toFixed(3) + ')');

    await page.locator('#deployBtn').click();
    await page.waitForTimeout(3000);

    ok(await page.locator('#hud').isVisible(), 'desktop: HUD appears after DEPLOY');
    ok(/TEAM DEATHMATCH/.test(await text(page, '#scorebar')), 'desktop: scorebar shows TEAM DEATHMATCH');
    ok(await page.locator('#vitals').isVisible(), 'desktop: health panel visible');
    ok((await text(page, '#weaponName')) === 'M4A1 CARBINE', 'desktop: primary weapon is M4A1 CARBINE');
    ok((await text(page, '#timer')).match(/^\d+:\d\d$/) !== null, 'desktop: match timer shows (' + await text(page, '#timer') + ')');

    // the match clock must follow wall time, not the clamped physics step
    const t0 = await text(page, '#timer');
    await page.waitForTimeout(6000);
    const t1 = await text(page, '#timer');
    ok(t0 !== t1, 'desktop: match clock advances in real time (' + t0 + ' -> ' + t1 + ')');

    // weapon swap via HUD slot
    await page.locator('#slot2').dispatchEvent('click');
    await page.waitForTimeout(800);
    ok((await text(page, '#weaponName')) === 'SR-25 DMR', 'desktop: slot 2 equips SR-25 DMR');
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(800);
    ok((await text(page, '#weaponName')) === 'M4A1 CARBINE', 'desktop: key 1 re-equips M4A1 CARBINE');

    // fire consumes ammo
    const magBefore = Number(await text(page, '#mag'));
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.waitForTimeout(3000);
    await page.mouse.up();
    await page.waitForTimeout(800);
    const magAfter = Number(await text(page, '#mag'));
    ok(magAfter < magBefore, 'desktop: firing consumes ammo (' + magBefore + ' -> ' + magAfter + ')');

    // right mouse enters ADS on the carbine: crosshair tightens
    const chHip = Number(await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).opacity));
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(2500);
    const chAds = Number(await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).opacity));
    ok(chAds < chHip, 'desktop: right mouse enters ADS on carbine (crosshair ' + chHip + ' -> ' + chAds + ')');
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(600);

    // the DMR carries a magnified optic: full ADS must reveal the scope overlay
    await page.locator('#slot2').dispatchEvent('click');
    await page.waitForTimeout(900);
    ok(await page.evaluate(() => document.getElementById('scope').classList.contains('hidden')),
      'desktop: scope overlay hidden while hip-firing the DMR');
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(4000);
    const scopeOn = await page.evaluate(() => !document.getElementById('scope').classList.contains('hidden'));
    const chScoped = Number(await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).opacity));
    ok(scopeOn, 'desktop: aiming the DMR reveals the scope overlay');
    ok(chScoped === 0, 'desktop: crosshair hidden behind the scope (' + chScoped + ')');
    await page.screenshot({ path: '/tmp/d_scope.png' });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => document.getElementById('scope').classList.contains('hidden')),
      'desktop: releasing aim leaves the scope');
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(700);

    ok(errs.length === 0, 'desktop: no page/console errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
    await page.close();
  }

  /* ------------------------------------------------ mobile ---------------- */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    await page.goto(URL + '/?touch=1', { waitUntil: 'load' });
    await page.waitForTimeout(4000);

    ok(await page.evaluate(() => document.body.classList.contains('touch')), 'mobile: touch layout class applied');
    await page.locator('#deployBtn').dispatchEvent('click');
    await page.waitForTimeout(3000);
    ok(await page.locator('#hud').isVisible(), 'mobile: HUD appears after DEPLOY');

    for (const id of ['#joyZone', '#lookZone', '#tFire', '#tAim', '#tReload', '#tSwap', '#tCrouch']) {
      ok(await page.locator(id).isVisible(), 'mobile: on-screen control visible ' + id);
    }

    // joystick moves the player/world
    await page.screenshot({ path: '/tmp/m0.png' });
    const jz = await page.locator('#joyZone').boundingBox();
    const cx = jz.x + jz.width / 2, cy = jz.y + jz.height / 2;
    await page.locator('#joyZone').dispatchEvent('pointerdown', touchEvt(1, cx, cy));
    await page.locator('#joyZone').dispatchEvent('pointermove', touchEvt(1, cx, cy - 60));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/m1.png' });
    ok(pxDiff('/tmp/m0.png', '/tmp/m1.png') > 300, 'mobile: joystick moves the view (' + pxDiff('/tmp/m0.png', '/tmp/m1.png') + ' px changed)');
    await page.locator('#joyZone').dispatchEvent('pointerup', touchEvt(1, cx, cy));

    // look pad rotates the view
    const lz = await page.locator('#lookZone').boundingBox();
    const lx = lz.x + lz.width / 2, ly = lz.y + lz.height / 2;
    await page.screenshot({ path: '/tmp/m2.png' });
    await page.locator('#lookZone').dispatchEvent('pointerdown', touchEvt(2, lx, ly));
    await page.locator('#lookZone').dispatchEvent('pointermove', touchEvt(2, lx + 120, ly));
    await page.waitForTimeout(1800);
    await page.screenshot({ path: '/tmp/m3.png' });
    ok(pxDiff('/tmp/m2.png', '/tmp/m3.png') > 300, 'mobile: look pad rotates the view (' + pxDiff('/tmp/m2.png', '/tmp/m3.png') + ' px changed)');
    await page.locator('#lookZone').dispatchEvent('pointerup', touchEvt(2, lx + 120, ly));

    // FIRE button shoots
    const magBefore = Number(await text(page, '#mag'));
    await page.locator('#tFire').dispatchEvent('pointerdown', touchEvt(3, 0, 0));
    await page.waitForTimeout(2500);
    await page.locator('#tFire').dispatchEvent('pointerup', touchEvt(3, 0, 0));
    await page.waitForTimeout(600);
    ok(Number(await text(page, '#mag')) < magBefore, 'mobile: FIRE button shoots (' + magBefore + ' -> ' + await text(page, '#mag') + ')');

    // AIM button enters ADS
    const chHip = Number(await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).opacity));
    await page.locator('#tAim').dispatchEvent('pointerdown', touchEvt(4, 0, 0));
    await page.waitForTimeout(2500);
    const chAds = Number(await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).opacity));
    const scoped = await page.evaluate(() => !document.getElementById('scope').classList.contains('hidden'));
    ok(chAds < chHip || scoped, 'mobile: AIM button enters ADS (crosshair ' + chHip + ' -> ' + chAds + ', scope=' + scoped + ')');
    await page.locator('#tAim').dispatchEvent('pointerup', touchEvt(4, 0, 0));

    // SWAP button switches weapon
    await page.locator('#tSwap').dispatchEvent('pointerdown', touchEvt(5, 0, 0));
    await page.waitForTimeout(1200);
    ok((await text(page, '#weaponName')) === 'SR-25 DMR', 'mobile: SWAP button equips SR-25 DMR');

    // AIM button on the scoped DMR must reveal the scope overlay
    await page.locator('#tAim').dispatchEvent('pointerdown', touchEvt(6, 0, 0));
    await page.waitForTimeout(4000);
    ok(await page.evaluate(() => !document.getElementById('scope').classList.contains('hidden')),
      'mobile: AIM button reveals the DMR scope overlay');
    await page.locator('#tAim').dispatchEvent('pointerup', touchEvt(6, 0, 0));
    await page.waitForTimeout(800);

    ok(errs.length === 0, 'mobile: no page/console errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
    await page.close();
  }

  /* ---------------------------- match ends, most kills wins ---------------- */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(URL + '/?touch=1&time=6', { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    await page.locator('#deployBtn').dispatchEvent('click');
    await page.waitForTimeout(12000);

    const ended = await page.locator('#endScreen').isVisible();
    const result = ended ? (await text(page, '#endResult')).trim() : '';
    ok(ended, 'match: end screen appears when the timer runs out');
    ok(['VICTORY', 'DEFEAT', 'DRAW'].includes(result), 'match: a winner is declared from kills (' + (result || 'none') + ')');
    ok(/TEAM DEATHMATCH|\d/.test(await text(page, '#endScore')), 'match: final score is shown (' + (await text(page, '#endScore')).replace(/\s+/g, ' ') + ')');
    ok(await page.locator('#rematchBtn').isVisible(), 'match: rematch button offered');
    ok(errs.length === 0, 'match: no page errors during a full round' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
    await page.close();
  }

  await browser.close();
  console.log(fails.length ? '\nFAILURES: ' + fails.length : '\nALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
