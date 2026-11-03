const { chromium } = require('/opt/appjet/browser/node_modules/playwright/index.js');
const { execFileSync } = require('node:child_process');
const URL = process.env.GAME_URL || 'https://q386ykkaxo.dev.ap-jt.com';
const fails = [];
const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails.push(m); };

const stddev = (file) => Number(execFileSync('convert', [file, '-format', '%[fx:standard_deviation]', 'info:']).toString().trim());
const diff = (a, b) => { try { execFileSync('compare', ['-metric', 'AE', a, b, 'null:'], { stdio: 'pipe' }); return 0; } catch (e) { return Number(String(e.stderr).trim()) || 0; } };

(async () => {
  const browser = await chromium.launch();

  /* ---------------- desktop ---------------- */
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
    await page.goto(URL + '/?touch=0', { waitUntil: 'load' });
    await page.waitForTimeout(3500);

    ok(await page.locator('#startScreen').isVisible(), 'desktop: start screen visible');
    ok(/ASHFALL/.test(await page.locator('#startScreen').innerText()), 'desktop: start screen shows ASHFALL title');
    ok(/6 vs 6/.test(await page.locator('#startScreen').innerText()), 'desktop: brief states 6 vs 6 teams');

    await page.screenshot({ path: '/tmp/d_start.png' });
    ok(stddev('/tmp/d_start.png') > 0.03, 'desktop: WebGL city renders (image variance ' + stddev('/tmp/d_start.png').toFixed(3) + ')');

    await page.locator('#deployBtn').click();
    await page.waitForTimeout(2500);
    ok(await page.locator('#hud').isVisible(), 'desktop: HUD appears after DEPLOY');
    ok((await page.locator('#scorebar').innerText()).includes('TEAM DEATHMATCH'), 'desktop: scorebar shows game mode');
    ok(await page.locator('#vitals').isVisible(), 'desktop: health panel visible');
    ok((await page.locator('#timer').innerText()).match(/^\d+:\d\d$/) !== null, 'desktop: match timer running (' + await page.locator('#timer').innerText() + ')');
    ok((await page.locator('#weaponName').innerText()) === 'M4A1 CARBINE', 'desktop: primary weapon M4A1 CARBINE');

    await page.locator('#slot2').click();
    await page.waitForTimeout(500);
    ok((await page.locator('#weaponName').innerText()) === 'SR-25', 'desktop: weapon swap to SR-25');
    await page.locator('#slot1').click();
    await page.waitForTimeout(400);

    const before = await page.locator('#mag').innerText();
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await page.locator('#mag').innerText();
    ok(Number(after) < Number(before) || /RELOAD/i.test(await page.locator('#ammoBox').innerText()),
       'desktop: firing consumes ammo (' + before + ' -> ' + after + ')');

    // bots fight -> scoreboard moves
    const s0 = (await page.locator('#scoreA').innerText()) + '-' + (await page.locator('#scoreB').innerText());
    await page.waitForTimeout(12000);
    const s1 = (await page.locator('#scoreA').innerText()) + '-' + (await page.locator('#scoreB').innerText());
    ok(s0 !== s1, 'desktop: bots score kills over time (' + s0 + ' -> ' + s1 + ')');

    // respawn / unlimited lives
    await page.waitForTimeout(4000);
    ok(await page.locator('#hud').isVisible(), 'desktop: still playing (unlimited respawns)');
    ok(errs.length === 0, 'desktop: no page/console errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
    await page.close();
  }

  /* ---------------- mobile ---------------- */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
    await page.goto(URL + '/?touch=1', { waitUntil: 'load' });
    await page.waitForTimeout(3500);

    ok(await page.evaluate(() => document.body.classList.contains('touch')), 'mobile: body.touch class applied');
    ok(await page.locator('#startScreen').isVisible(), 'mobile: start screen visible');
    await page.locator('#deployBtn').tap();
    await page.waitForTimeout(2500);

    ok(await page.locator('#hud').isVisible(), 'mobile: HUD appears after DEPLOY');
    for (const id of ['#joyZone', '#lookZone', '#tFire', '#tAim', '#tReload', '#tSwap', '#tCrouch']) {
      ok(await page.locator(id).isVisible(), 'mobile: touch control visible ' + id);
    }
    ok(await page.locator('#aimBtn').isHidden(), 'mobile: desktop AIM button hidden in touch mode');

    // joystick drag should move the player -> frames differ
    await page.screenshot({ path: '/tmp/m0.png' });
    const jz = await page.locator('#joyZone').boundingBox();
    const cx = jz.x + jz.width / 2, cy = jz.y + jz.height / 2;
    await page.locator('#joyZone').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, buttons: 1 });
    await page.locator('#joyZone').dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy - 60, buttons: 1 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: '/tmp/m1.png' });
    const moved = diff('/tmp/m0.png', '/tmp/m1.png');
    ok(moved > 500, 'mobile: virtual joystick moves the camera/world (' + moved + ' px changed)');
    await page.locator('#joyZone').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy });

    // look zone drag rotates view
    const lz = await page.locator('#lookZone').boundingBox();
    const lx = lz.x + lz.width / 2, ly = lz.y + lz.height / 2;
    await page.screenshot({ path: '/tmp/m2.png' });
    await page.locator('#lookZone').dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: lx, clientY: ly, buttons: 1 });
    await page.locator('#lookZone').dispatchEvent('pointermove', { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: lx + 120, clientY: ly, buttons: 1 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: '/tmp/m3.png' });
    const looked = diff('/tmp/m2.png', '/tmp/m3.png');
    ok(looked > 500, 'mobile: look pad rotates the view (' + looked + ' px changed)');
    await page.locator('#lookZone').dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: lx + 120, clientY: ly });

    // fire button consumes ammo
    const magBefore = Number(await page.locator('#mag').innerText());
    await page.locator('#tFire').dispatchEvent('pointerdown', { pointerId: 3, pointerType: 'touch', isPrimary: true, buttons: 1 });
    await page.waitForTimeout(900);
    await page.locator('#tFire').dispatchEvent('pointerup', { pointerId: 3, pointerType: 'touch', isPrimary: true });
    await page.waitForTimeout(300);
    const magAfter = Number(await page.locator('#mag').innerText());
    ok(magAfter < magBefore, 'mobile: FIRE button shoots (' + magBefore + ' -> ' + magAfter + ')');

    // aim button enters ADS (crosshair fades / scope or fov change)
    const chBefore = await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).opacity);
    await page.locator('#tAim').dispatchEvent('pointerdown', { pointerId: 4, pointerType: 'touch', isPrimary: true, buttons: 1 });
    await page.waitForTimeout(900);
    const chAfter = await page.evaluate(() => getComputedStyle(document.getElementById('crosshair')).opacity);
    const scoped = await page.evaluate(() => !document.getElementById('scope').classList.contains('hidden'));
    ok(Number(chAfter) < Number(chBefore) || scoped, 'mobile: AIM enters ADS (crosshair ' + chBefore + ' -> ' + chAfter + ', scope=' + scoped + ')');
    await page.locator('#tAim').dispatchEvent('pointerup', { pointerId: 4, pointerType: 'touch', isPrimary: true });

    // swap button
    await page.locator('#tSwap').click();
    await page.waitForTimeout(500);
    ok((await page.locator('#weaponName').innerText()) === 'SR-25', 'mobile: SWAP button switches to SR-25');

    ok(errs.length === 0, 'mobile: no page/console errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
    await page.close();
  }

  await browser.close();
  console.log(fails.length ? '\nFAILURES: ' + fails.length : '\nALL GAMEPLAY CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
