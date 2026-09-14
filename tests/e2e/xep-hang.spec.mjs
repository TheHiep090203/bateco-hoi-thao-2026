import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Bảng tổng sắp phải sắp lại THỨ TỰ DÒNG theo tổng số huy chương, không chỉ gán số hạng.
// Unit test phủ standings() với đầu vào chính xác; test này phủ nốt đoạn còn lại —
// rằng quy tắc đó đúng trên dữ liệu sống và DOM render đúng thứ tự API trả về.
//
// Cố ý KHÔNG dọn sạch bảng results: các file e2e khác chạy song song và cũng gieo
// dữ liệu. Vì vậy test khẳng định BẤT BIẾN của thứ hạng chứ không khẳng định một
// thứ tự tuyệt đối — bất biến đúng bất kể còn dòng nào của test khác.

test.describe.configure({ mode: 'serial' });

const MARKER = '[e2e-xep-hang]';

function credentials(){
  try{
    const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
      .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
      .map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
    return env.ADMIN_USER&&env.ADMIN_PASS?{user:env.ADMIN_USER,pass:env.ADMIN_PASS}:null;
  }catch{ return null }
}

// Chỉ xóa dòng do chính test này tạo, kể cả sót lại từ lần chạy bị ngắt.
async function purge(page, origin){
  const snap = await (await page.request.get('/api/scoreboard')).json();
  for (const r of snap.results.filter(r => r.event.includes(MARKER)))
    await page.request.delete('/api/admin/results', { headers:{Origin:origin}, data:{ id:r.id, revision:r.revision } });
}

test('bảng tổng sắp xếp theo tổng huy chương và render đúng thứ tự API', async ({ page }) => {
  test.skip(!credentials(), 'Cần .env.local có ADMIN_USER và ADMIN_PASS');
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers:{Origin:origin}, data:credentials() })).status()).toBe(200);
  await purge(page, origin);

  const add = (n, medals) => page.request.post('/api/admin/results', { headers:{Origin:origin}, data:{
    id: crypto.randomUUID(), sport_id: 1, event: `Phần thi ${n} ${MARKER}`,
    participants: 'A vs B', score: '1–0', revision: 0, gold:null, silver:null, bronze:null, ...medals } });

  // Gieo đủ để thứ hạng không tầm thường: một liên minh nhiều HCB/HCĐ, một liên minh có HCV.
  expect((await add(0, { gold: 1 })).status()).toBe(200);
  for (let i = 1; i <= 5; i++) expect((await add(i, { silver: 2, bronze: 2 })).status()).toBe(200);

  const standings = (await (await page.request.get('/api/scoreboard')).json()).standings;
  const total = a => a.gold + a.silver + a.bronze;

  // 1. Quy tắc: tổng giảm dần; bằng tổng thì HCV giảm dần, rồi HCB.
  for (let i = 1; i < standings.length; i++) {
    const prev = standings[i-1], cur = standings[i];
    expect(total(prev), `dòng ${i} có tổng lớn hơn dòng ${i-1}`).toBeGreaterThanOrEqual(total(cur));
    if (total(prev) === total(cur)) {
      expect(prev.gold, `bằng tổng nhưng HCV không phá hoà đúng ở dòng ${i}`).toBeGreaterThanOrEqual(cur.gold);
      if (prev.gold === cur.gold) expect(prev.silver).toBeGreaterThanOrEqual(cur.silver);
    }
  }

  // 2. Liên minh có tổng lớn nhất phải đứng đầu, kể cả khi không có HCV nào.
  const best = Math.max(...standings.map(total));
  expect(total(standings[0])).toBe(best);
  expect(standings[0].rank).toBe(1);

  // 3. DOM phải render đúng thứ tự API trả về — bảng thật sự đổi chỗ dòng.
  await page.reload();
  await expect(page.locator('#huy-chuong tbody tr')).toHaveCount(standings.length, { timeout: 15000 });
  const dom = await page.evaluate(() => Array.from(document.querySelectorAll('#huy-chuong tbody tr th'))
    .map(th => th.textContent.replace('LIÊN MINH ', '').trim()));
  expect(dom).toEqual(standings.map(a => a.name));

  await purge(page, origin);
});
