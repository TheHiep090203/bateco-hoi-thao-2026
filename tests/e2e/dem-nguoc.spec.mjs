import { test, expect } from '@playwright/test';

const OPEN_AT = '08:00';

async function atClock(page, iso, opts = {}){
  const serverIso = opts.serverIso ?? iso;
  await page.route('**/api/schedule', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { Date: new Date(serverIso).toUTCString() },
    body: JSON.stringify({ schedule: null }),
  }));
  const fake = new Date(iso).getTime();
  await page.addInitScript(`{const F=Date.now;const fake=${fake};const t0=F();const R=Date;
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
  const hours = await page.locator('#countdown > div').first().locator('.roll-d').evaluateAll(els => els.map(e => e.dataset.d).join(''));
  expect(Number(hours), 'từ 01:40 tới 08:00 phải còn 6 giờ lẻ').toBe(6);
  await expect(page.locator('#hero-note'), 'rạng sáng phải chỉ rõ giờ tập trung và địa điểm').toContainText('07:30');
});

test('đồng hồ không được đứng im ở bốn số không trong suốt đêm trước hội thao', async ({ page }) => {
  await atClock(page, '2026-09-18T03:00:00+07:00');
  const shown = await page.locator('#countdown .roll-d').evaluateAll(els => els.map(e => e.dataset.d).join(''));
  expect(shown, 'toàn số không nghĩa là đồng hồ nhắm sai mốc').not.toMatch(/^0+$/);
});

test('trong giờ thi đấu thì hero hiện nội dung đang diễn ra và nội dung kế tiếp', async ({ page }) => {
  await atClock(page, '2026-09-18T09:00:00+07:00');
  await expect(page.locator('#count-label')).toHaveText('ĐANG DIỄN RA');
  await expect(page.locator('#countdown .hero-now'), 'phải nêu đúng nội dung đang thi đấu').toHaveText('Điền kinh');
  await expect(page.locator('#hero-note'), 'phải cho biết nội dung kế tiếp và còn bao lâu').toContainText('10:00 Pickleball');
  await expect(page.locator('#countdown > div'), 'đang thi đấu thì không còn ô đếm ngược nào').toHaveCount(0);
});

test('lúc giao giữa hai nội dung thì nói rõ đang chuyển tiếp chứ không bịa nội dung đang diễn ra', async ({ page }) => {
  await atClock(page, '2026-09-18T12:30:00+07:00');
  await expect(page.locator('#countdown .hero-now')).toHaveText('Đang chuyển nội dung');
  await expect(page.locator('#hero-note')).toContainText('14:00');
});

test('hết hội thao thì hero chuyển sang lời kết và ba liên minh dẫn đầu', async ({ page }) => {
  await page.route('**/api/scoreboard', async route => {
    const res = await route.fetch();
    const body = await res.json();
    body.standings = [
      { id: 2, name: 'BỨT PHÁ', gold: 5, silver: 2, bronze: 1, rank: 1, tied: false },
      { id: 1, name: 'TIÊN PHONG', gold: 3, silver: 4, bronze: 2, rank: 2, tied: false },
      { id: 3, name: 'CHINH PHỤC', gold: 1, silver: 3, bronze: 5, rank: 3, tied: false },
    ];
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });
  await atClock(page, '2026-09-18T22:30:00+07:00');
  await expect(page.locator('#count-label')).toHaveText('HỘI THAO 2026 ĐÃ KHÉP LẠI');
  await expect(page.locator('.hero-rank'), 'phải nêu đúng ba liên minh dẫn đầu').toHaveCount(3);
  await expect(page.locator('.hero-rank').first()).toContainText('BỨT PHÁ');
});

test('đồng hồ máy khách chạy sai vẫn phải theo giờ máy chủ chứ không tự ý báo đang diễn ra', async ({ page }) => {
  await atClock(page, '2026-09-18T09:30:00+07:00', { serverIso: '2026-09-18T06:00:00+07:00' });
  await expect(page.locator('#count-label'),
    'máy khách nhanh 3 tiếng rưỡi mà báo ĐANG DIỄN RA thì khách mời đứng ở sân sẽ thấy sai').toHaveText(`HÔM NAY · KHAI MẠC LÚC ${OPEN_AT}`);
});

test('đồng hồ đếm ngược không đọc lải nhải từng giây cho trình đọc màn hình', async ({ page }) => {
  await atClock(page, '2026-09-18T01:40:00+07:00');
  await expect(page.locator('#countdown'), 'vùng đếm phải là role=timer, vốn im lặng mặc định').toHaveAttribute('role', 'timer');
  await expect(page.locator('#hero-say')).toContainText('khai mạc');
  const writes = await page.evaluate(() => new Promise(resolve => {
    let n = 0;
    const target = document.querySelector('#hero-say');
    const obs = new MutationObserver(records => { n += records.length });
    obs.observe(target, { childList: true, characterData: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(n) }, 3200);
  }));
  expect(writes, 'ghi lại vùng aria-live mỗi giây sẽ khiến trình đọc màn hình nói liên tục và không ai nghe hết trang')
    .toBe(0);
});
