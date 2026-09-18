import { test, expect } from '@playwright/test';

const TEAM = { TP: 1, BP: 2, CP: 3 };

function standing(id, name, gold, silver, bronze, rank){
  return { id, name, gold, silver, bronze, rank, tied: false };
}

const LEAD_BP = [
  standing(TEAM.BP, 'BỨT PHÁ', 2, 5, 0, 1),
  standing(TEAM.CP, 'CHINH PHỤC', 2, 1, 2, 2),
  standing(TEAM.TP, 'TIÊN PHONG', 2, 0, 3, 3),
];
const LEAD_TP = [
  standing(TEAM.TP, 'TIÊN PHONG', 4, 0, 3, 1),
  standing(TEAM.BP, 'BỨT PHÁ', 2, 5, 0, 2),
  standing(TEAM.CP, 'CHINH PHỤC', 2, 1, 2, 3),
];
const ALL_TIED = [
  { ...standing(TEAM.BP, 'BỨT PHÁ', 1, 1, 1, 1), tied: true },
  { ...standing(TEAM.CP, 'CHINH PHỤC', 1, 1, 1, 1), tied: true },
  { ...standing(TEAM.TP, 'TIÊN PHONG', 1, 1, 1, 1), tied: true },
];

async function serve(page, getStandings){
  await page.route('**/api/scoreboard', async route => {
    const res = await route.fetch();
    const body = await res.json();
    body.standings = getStandings();
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });
}

async function rowsReady(page){
  await page.locator('#huy-chuong').scrollIntoViewIfNeeded();
  await expect(page.locator('#huy-chuong tbody tr[data-team]')).toHaveCount(3, { timeout: 15000 });
}

test('bảng nêu rõ tổng huy chương, vốn là tiêu chí xếp hạng số một', async ({ page }) => {
  await serve(page, () => LEAD_BP);
  await page.goto('/');
  await rowsReady(page);
  await expect(page.locator('#huy-chuong thead th'), 'thêm cột Tổng thì thead phải có đúng 6 cột').toHaveCount(6);
  await expect(page.locator('#huy-chuong thead')).toContainText('Tổng');
  const totals = await page.locator('#huy-chuong td.total').allInnerTexts();
  expect(totals, 'không hiện tổng thì người xem phải tự cộng mới hiểu vì sao đội này xếp trên đội kia')
    .toEqual(['7', '5', '5']);
});

test('hạng 1, 2, 3 mang dấu hiệu thị giác riêng chứ không chỉ là con số', async ({ page }) => {
  await serve(page, () => LEAD_BP);
  await page.goto('/');
  await rowsReady(page);
  const rows = page.locator('#huy-chuong tbody tr[data-team]');
  for (const [i, rank] of [[0, '1'], [1, '2'], [2, '3']]){
    await expect(rows.nth(i)).toHaveAttribute('data-rank', rank);
  }
  const colours = await page.locator('#huy-chuong .rank').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor));
  expect(new Set(colours).size, 'ba hạng phải có ba màu huy hiệu khác nhau').toBe(3);
  const leadRow = await rows.first().evaluate(el => getComputedStyle(el).backgroundColor);
  const secondRow = await rows.nth(1).evaluate(el => getComputedStyle(el).backgroundColor);
  expect(leadRow, 'hàng dẫn đầu phải được tô nền khác các hàng còn lại').not.toBe(secondRow);
});

test('đội đồng hạng phải mang huy hiệu giống hệt nhau, không tô theo thứ tự dòng', async ({ page }) => {
  await serve(page, () => ALL_TIED);
  await page.goto('/');
  await rowsReady(page);
  const ranks = await page.locator('#huy-chuong tbody tr[data-team]').evaluateAll(els => els.map(e => e.dataset.rank));
  expect(ranks, 'ba đội bằng nhau cả ba loại huy chương thì cùng hạng 1').toEqual(['1', '1', '1']);
  const colours = await page.locator('#huy-chuong .rank').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor));
  expect(new Set(colours).size, 'tô theo vị trí dòng sẽ gán bạc cho đội đang đồng hạng nhất, tức là nói dối').toBe(1);
  await expect(page.locator('#huy-chuong .tie').first()).toBeVisible();
});

test('khi thứ hạng đổi chỗ thì hàng trượt sang vị trí mới chứ không nhảy cóc', async ({ page }) => {
  let data = LEAD_BP;
  await serve(page, () => data);
  await page.goto('/');
  await rowsReady(page);
  await expect(page.locator('#huy-chuong tbody tr').first()).toHaveAttribute('data-team', String(TEAM.BP));

  data = LEAD_TP;
  const moved = await page.evaluate(() => new Promise(resolve => {
    const tbody = document.querySelector('#huy-chuong tbody');
    let seen = 0;
    const timer = setInterval(() => {
      for (const tr of tbody.querySelectorAll('tr')){
        const t = getComputedStyle(tr).transform;
        if (t !== 'none' && Math.abs(Number(t.split(',')[5]?.replace(')', '') ?? 0)) > 1) seen++;
      }
    }, 60);
    setTimeout(() => { clearInterval(timer); resolve(seen) }, 9000);
  }));
  await expect(page.locator('#huy-chuong tbody tr').first()).toHaveAttribute('data-team', String(TEAM.TP));
  expect(moved, 'không bắt được khung hình nào có hàng đang dịch chuyển, tức là hàng nhảy cóc sang chỗ mới').toBeGreaterThan(0);
});

test('đổi thứ hạng thì báo cho trình đọc màn hình, nhưng không báo ngay lần vẽ đầu', async ({ page }) => {
  let data = LEAD_BP;
  await serve(page, () => data);
  await page.goto('/');
  await rowsReady(page);
  await expect(page.locator('#huy-chuong-say'),
    'lần vẽ đầu mà đã báo thì trình đọc màn hình đọc một thay đổi chưa hề xảy ra').toHaveText('');
  data = LEAD_TP;
  await expect(page.locator('#huy-chuong-say')).toContainText('Thứ hạng thay đổi', { timeout: 15000 });
  await expect(page.locator('#huy-chuong-say')).toContainText('Hạng 1 LIÊN MINH TIÊN PHONG');
});

test('dòng trạng thái cập nhật không được đọc lại cho trình đọc màn hình mỗi 5 giây', async ({ page }) => {
  await serve(page, () => LEAD_BP);
  await page.goto('/');
  await rowsReady(page);
  const role = await page.locator('.live-status').getAttribute('role');
  expect(role,
    'dòng này bị ghi lại kèm mốc giờ mới mỗi 5 giây; để role=status thì trình đọc màn hình nói suốt cả ngày')
    .toBeNull();
});

test('bật giảm chuyển động thì thứ hạng đổi ngay, không trượt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let data = LEAD_BP;
  await serve(page, () => data);
  await page.goto('/');
  await rowsReady(page);
  data = LEAD_TP;
  const moved = await page.evaluate(() => new Promise(resolve => {
    const tbody = document.querySelector('#huy-chuong tbody');
    let seen = 0;
    const timer = setInterval(() => {
      for (const tr of tbody.querySelectorAll('tr')){
        const t = getComputedStyle(tr).transform;
        if (t !== 'none' && Math.abs(Number(t.split(',')[5]?.replace(')', '') ?? 0)) > 1) seen++;
      }
    }, 60);
    setTimeout(() => { clearInterval(timer); resolve(seen) }, 9000);
  }));
  await expect(page.locator('#huy-chuong tbody tr').first()).toHaveAttribute('data-team', String(TEAM.TP));
  expect(moved, 'người dùng đã xin giảm chuyển động thì không được cho hàng trượt').toBe(0);
});
