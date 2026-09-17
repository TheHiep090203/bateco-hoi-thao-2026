import { test, expect } from '@playwright/test';

const OPEN_AT = '08:00';

async function atClock(page, iso){
  await page.addInitScript(`{const F=Date.now;const fake=new Date(${JSON.stringify(iso)}).getTime();const t0=F();
    const R=Date;
    globalThis.Date=class extends R{constructor(...a){if(!a.length)super(fake+(F()-t0));else super(...a)}static now(){return fake+(F()-t0)}};
    Date.now=()=>fake+(F()-t0);}`);
  await page.goto('/');
}

test('trước ngày hội thao thì đếm ngược đủ bốn ô và giữ nhãn đếm ngược', async ({ page }) => {
  await atClock(page, '2026-09-15T09:00:00+07:00');
  await expect(page.locator('#count-label')).toHaveText('ĐẾM NGƯỢC ĐẾN NGÀY HỘI THAO');
  await expect(page.locator('#countdown > div'), 'còn hơn một ngày thì giữ đủ bốn ô').toHaveCount(4);
  await expect(page.locator('#countdown')).toContainText('Ngày');
});

test('rạng sáng ngày hội thao thì đếm tới giờ khai mạc chứ không đứng im ở bốn số không', async ({ page }) => {
  await atClock(page, '2026-09-18T01:40:00+07:00');
  await expect(page.locator('#count-label'),
    'nhãn phải nói rõ còn bao lâu tới khai mạc, không phải chỉ báo đã tới ngày').toHaveText(`HÔM NAY · KHAI MẠC LÚC ${OPEN_AT}`);
  await expect(page.locator('#countdown > div'), 'dưới 24 giờ thì bỏ hẳn ô Ngày thay vì để 00 chết').toHaveCount(3);
  await expect(page.locator('#countdown'), 'ô Ngày phải biến mất hoàn toàn').not.toContainText('Ngày');
  const hours = await page.locator('#countdown > div').first().locator('b').innerText();
  expect(Number(hours), 'từ 01:40 tới 08:00 phải còn 6 giờ lẻ').toBe(6);
});

test('đồng hồ không được đứng im ở bốn số không trong suốt đêm trước hội thao', async ({ page }) => {
  await atClock(page, '2026-09-18T03:00:00+07:00');
  const shown = await page.locator('#countdown').innerText();
  expect(shown.replace(/[^0-9]/g, ''), 'toàn số không nghĩa là đồng hồ nhắm sai mốc').not.toMatch(/^0+$/);
});

test('sau giờ khai mạc thì nhãn chuyển sang đang diễn ra', async ({ page }) => {
  await atClock(page, '2026-09-18T09:30:00+07:00');
  await expect(page.locator('#count-label')).toHaveText('ĐANG DIỄN RA');
});
