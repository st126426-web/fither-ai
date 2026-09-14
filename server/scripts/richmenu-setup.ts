/**
 * Registers the 6-cell rich menu on the LINE Official Account.
 *
 *   LINE_CHANNEL_ACCESS_TOKEN=... npm run -w server richmenu -- ./richmenu.png
 *
 * The image is optional: without it the menu is created but not activated,
 * which is enough to verify the payload. LINE requires 2500x1686 (or
 * 2500x843) PNG/JPEG under 1 MB.
 */
import { readFileSync } from 'node:fs';

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN is required.');
  process.exit(1);
}

const W = 2500;
const H = 1686;
const cell = (col: number, row: number) => ({
  x: Math.round((W / 3) * col),
  y: Math.round((H / 2) * row),
  width: Math.round(W / 3),
  height: Math.round(H / 2),
});

const richmenu = {
  size: { width: W, height: H },
  selected: true,
  name: 'FitHer main',
  chatBarText: 'เมนู',
  areas: [
    { bounds: cell(0, 0), action: { type: 'postback', data: 'action=plan', displayText: 'แผนสัปดาห์นี้' } },
    { bounds: cell(1, 0), action: { type: 'postback', data: 'action=checkin', displayText: 'เช็คอิน' } },
    { bounds: cell(2, 0), action: { type: 'postback', data: 'action=find_gym', displayText: 'หายิม/กิจกรรม' } },
    { bounds: cell(0, 1), action: { type: 'postback', data: 'action=meals', displayText: 'มื้ออาหาร' } },
    { bounds: cell(1, 1), action: { type: 'postback', data: 'action=coach', displayText: 'โค้ช' } },
    { bounds: cell(2, 1), action: { type: 'postback', data: 'action=web', displayText: 'เว็บแอป' } },
  ],
};

const created = await fetch('https://api.line.me/v2/bot/richmenu', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(richmenu),
});

if (!created.ok) {
  console.error('create failed:', created.status, await created.text());
  process.exit(1);
}

const { richMenuId } = await created.json() as { richMenuId: string };
console.log('created rich menu:', richMenuId);

const imagePath = process.argv[2];
if (!imagePath) {
  console.log('No image supplied — upload one and set it as default with:');
  console.log(`  npm run -w server richmenu -- ./richmenu.png`);
  process.exit(0);
}

const body = readFileSync(imagePath);
const upload = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
  method: 'POST',
  headers: {
    'Content-Type': imagePath.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    Authorization: `Bearer ${token}`,
  },
  body,
});
if (!upload.ok) {
  console.error('image upload failed:', upload.status, await upload.text());
  process.exit(1);
}

const setDefault = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});
console.log(setDefault.ok ? 'rich menu is live ✓' : `set default failed: ${setDefault.status}`);
