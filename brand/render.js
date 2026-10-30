// Uso: node render.js <input.svg> <output.png> <larghezza> [trasparente]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [, , input, output, wArg, transparent] = process.argv;
  const svg = fs.readFileSync(input, 'utf8');
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const vw = parseFloat(m[1]);
  const vh = parseFloat(m[2]);
  const w = parseInt(wArg, 10);
  const h = Math.round((w * vh) / vw);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const body = svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  await page.screenshot({ path: output, omitBackground: transparent === 'transparent', clip: { x: 0, y: 0, width: w, height: h } });
  await browser.close();
  console.log('ok', output, w + 'x' + h);
})();
