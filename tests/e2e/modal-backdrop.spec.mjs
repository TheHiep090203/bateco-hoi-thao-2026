import { test, expect } from '@playwright/test';

async function openEntryDialog(page) {
  await page.goto('/');
  await page.locator('#ket-qua .entry-button').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('#entry-dialog').open)).toBe(true);
}

const isOpen = (page, sel) => page.evaluate(s => document.querySelector(s).open, sel);

test('bấm nền mờ đóng modal nhập liệu', async ({ page }) => {
  await openEntryDialog(page);
  await page.mouse.click(4, 4);
  await expect.poll(() => isOpen(page, '#entry-dialog')).toBe(false);
});

test('bấm phần đệm bên trong modal nhập liệu thì KHÔNG đóng', async ({ page }) => {
  await openEntryDialog(page);

  const spot = await page.evaluate(() => {
    const d = document.querySelector('#entry-dialog');
    const r = d.getBoundingClientRect();
    const x = Math.round(r.left + 6), y = Math.round(r.top + 6);
    return { x, y, hit: document.elementFromPoint(x, y) === d };
  });

  expect(spot.hit, 'điểm thử phải rơi vào phần đệm của dialog, nếu không test bấm trúng phần tử con và pass vì lý do sai').toBe(true);

  await page.mouse.click(spot.x, spot.y);
  expect(await isOpen(page, '#entry-dialog'), 'bấm trong hộp bao vẫn cho e.target===dialog nên chỉ so toạ độ mới phân biệt được nền mờ').toBe(true);
});

test('đang lưu thì bấm nền mờ không đóng modal', async ({ page }) => {
  await openEntryDialog(page);

  await page.evaluate(() => entryLock(true));
  await page.mouse.click(4, 4);
  expect(await isOpen(page, '#entry-dialog'), 'đóng modal giữa lúc đang ghi dữ liệu').toBe(true);

  await page.evaluate(() => entryLock(false));
  await page.mouse.click(4, 4);
  await expect.poll(() => isOpen(page, '#entry-dialog')).toBe(false);
});

test('bấm nền mờ đóng hộp xác nhận và trả về “không”', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__confirm = confirmDialog('Kiểm thử bấm nền mờ', 'Xóa'); });
  await expect.poll(() => isOpen(page, '#confirm-dialog')).toBe(true);

  await page.mouse.click(4, 4);
  await expect.poll(() => isOpen(page, '#confirm-dialog')).toBe(false);

  expect(await page.evaluate(() => window.__confirm), 'đóng bằng bất kỳ cách nào cũng phải resolve thành “không”').toBe(false);
});
