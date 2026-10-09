#!/usr/bin/env node
// Screenshots of every Tractor Rally track, for checking the art.
//
//   npm run shots                 every track, whole-track camera
//   npm run shots -- --close      close-up camera instead
//   npm run shots -- iron-blaster meadow    just these tracks
//
// Saves screenshots/<track>.png and screenshots/index.html (all of them on
// one page). First time: `npm run shots:setup` (installs Playwright and the
// Chromium it drives).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const Tracks = require(path.join(ROOT, 'js/tractor/tracks.js'));

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    try {
      const { execSync } = require('child_process');
      const globalRoot = execSync('npm root -g').toString().trim();
      return require(path.join(globalRoot, 'playwright'));
    } catch (e2) {
      console.error('Playwright isn\'t installed. Run this once, then try again:\n\n  npm run shots:setup\n');
      process.exit(1);
    }
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

(async () => {
  const args = process.argv.slice(2);
  const close = args.includes('--close');
  const wanted = args.filter((a) => !a.startsWith('--'));
  const ids = Tracks.TRACKS.map((t) => t.id).filter((id) => !wanted.length || wanted.includes(id));
  fs.mkdirSync(OUT, { recursive: true });

  const server = await serve();
  const base = `http://localhost:${server.address().port}/index.html`;
  const { chromium, devices } = loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.error('Couldn\'t start Chromium. Run this once, then try again:\n\n  npm run shots:setup\n');
    server.close();
    process.exit(1);
  }
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const errors = [];
  for (const id of ids) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${id}: ${e.message}`));
    await page.goto(base);
    await page.evaluate(([id, view]) => {
      localStorage.clear();
      localStorage.setItem('farmCasino.rewards.v1', JSON.stringify({ welcomed: true }));
      localStorage.setItem('farmCasino.tractor.v1', JSON.stringify({ unlockAll: true }));
      localStorage.setItem('farmCasino.tractor.track', id);
      localStorage.setItem('farmCasino.tractor.view', view);
    }, [id, close ? 'chase' : 'full']);
    await page.goto(`${base}#/tractor-rally`);
    await page.reload();
    await page.waitForTimeout(400);
    await page.tap('#dock-race');
    // Let the countdown run and the field get going.
    await page.waitForTimeout(close ? 6500 : 5000);
    await page.screenshot({ path: path.join(OUT, `${id}.png`) });
    await page.close();
    console.log('saved', `screenshots/${id}.png`);
  }
  await browser.close();
  server.close();

  const html = `<!doctype html><meta charset="utf-8"><title>Track screenshots</title>
<style>body{font-family:sans-serif;background:#222;color:#eee;margin:16px}div{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}
figure{margin:0}img{width:100%;border-radius:6px}figcaption{padding:4px 2px}</style>
<h1>Tractor Rally tracks</h1><div>${ids.map((id) => `<figure><img src="${id}.png"><figcaption>${Tracks.TRACKS.find((t) => t.id === id).name} (${id})</figcaption></figure>`).join('')}</div>`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  console.log('saved screenshots/index.html');
  if (errors.length) {
    console.error('Page errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
})();
