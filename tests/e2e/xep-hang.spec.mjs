import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test.describe.configure({ mode: 'serial' });

function credentials(){
  try{
    const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
      .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
      .map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
    return env.ADMIN_USER&&env.ADMIN_PASS?{user:env.ADMIN_USER,pass:env.ADMIN_PASS}:null;
  }catch{ return null }
}

test('bảng tổng sắp xếp theo số HCV và render đúng thứ tự API', async ({ page }) => {
  test.skip(!credentials(), 'Cần .env.local có ADMIN_USER và ADMIN_PASS');
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers:{Origin:origin}, data:credentials() })).status()).toBe(200);

  const snapshot = async () => (await page.request.get('/api/scoreboard')).json();
  const setMedals = async (alliance_id, gold, silver, bronze) => {
    const now = (await snapshot()).alliances.find(a => a.id === alliance_id);
    return page.request.post('/api/admin/medals', { headers:{Origin:origin}, data:{ alliance_id, gold, silver, bronze,
      prev: { gold: now.gold, silver: now.silver, bronze: now.bronze } } });
  };

  const before = (await snapshot()).alliances.map(a => [a.id, a.gold, a.silver, a.bronze]);

  try {
    expect((await setMedals(1, 1, 0, 0)).status()).toBe(200);
    expect((await setMedals(2, 0, 5, 5)).status()).toBe(200);
    expect((await setMedals(3, 0, 0, 0)).status()).toBe(200);

    const standings = (await snapshot()).standings;
    const total = a => a.gold + a.silver + a.bronze;

    for (let i = 1; i < standings.length; i++) {
      const prev = standings[i-1], cur = standings[i];
      expect(prev.gold, `dòng ${i} có HCV nhiều hơn dòng ${i-1}`).toBeGreaterThanOrEqual(cur.gold);
      if (prev.gold === cur.gold) {
        expect(prev.silver, `bằng HCV nhưng HCB không phá hoà đúng ở dòng ${i}`).toBeGreaterThanOrEqual(cur.silver);
        if (prev.silver === cur.silver) expect(prev.bronze).toBeGreaterThanOrEqual(cur.bronze);
      }
    }

    expect(standings[0].id, 'liên minh có HCV duy nhất phải đứng trên liên minh 10 huy chương nhưng không HCV').toBe(1);
    expect(standings[0].rank).toBe(1);
    expect(total(standings[0]), 'đội dẫn đầu theo HCV có thể có tổng huy chương thấp hơn đội xếp sau')
      .toBeLessThan(Math.max(...standings.map(total)));

    await page.reload();
    await expect(page.locator('#huy-chuong tbody tr')).toHaveCount(standings.length, { timeout: 15000 });
    const dom = await page.evaluate(() => Array.from(document.querySelectorAll('#huy-chuong tbody tr th'))
      .map(th => th.textContent.replace('LIÊN MINH ', '').trim()));
    expect(dom, 'bảng phải thật sự đổi chỗ dòng, không chỉ gán lại số hạng').toEqual(standings.map(a => a.name));
  } finally {
    for (const [id, gold, silver, bronze] of before) {
      const restored = await setMedals(id, gold, silver, bronze);
      expect(restored.status(), 'lệnh khôi phục huy chương phải thành công, nếu không lần chạy sau sẽ lệch dữ liệu').toBe(200);
    }
  }
});
