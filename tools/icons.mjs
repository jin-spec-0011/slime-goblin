// SVG 아이콘 -> PNG 192/512 생성 (사전 설치된 Playwright 사용)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch();
for (const size of [192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: new URL(`../icons/icon-${size}.png`, import.meta.url).pathname, omitBackground: true });
  await p.close();
}
await b.close();
console.log('icons ok');
