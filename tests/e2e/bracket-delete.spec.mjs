import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Mật khẩu đọc từ .env.local lúc chạy (file này đã gitignore), không nhúng vào repo.
function credentials(){
  try{
    const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
      .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
      .map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
    return env.ADMIN_USER&&env.ADMIN_PASS?{user:env.ADMIN_USER,pass:env.ADMIN_PASS}:null;
  }catch{ return null }
}

test('tab Pickleball giữ bảng vòng loại và thêm sơ đồ loại trực tiếp 8 đội', async ({ page }) => {
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  await expect(page.locator('#draw-panel .draw-sheet')).toBeVisible();
  await expect(page.locator('#draw-panel .bracket-sheet')).toBeVisible();
  // 8 suất + 4 ô bán kết + NHẤT + NHÌ
  await expect(page.locator('.bracket-slot')).toHaveCount(14);
  await expect(page.locator('.bracket-tag')).toHaveCount(4);
});

test('4 môn còn lại không có sơ đồ', async ({ page }) => {
  await page.goto('/');
  for (const i of [0, 1, 3, 4]) {
    await page.locator(`#draw-tab-${i}`).click();
    await expect(page.locator('#draw-panel .draw-sheet')).toBeVisible();
    await expect(page.locator('#draw-panel .bracket-sheet')).toHaveCount(0);
  }
});

test('người xem ẩn danh không thấy bất kỳ nút Xóa nào', async ({ page }) => {
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  await expect(page.locator('.bracket')).toBeVisible();
  await expect(page.locator('.row-delete')).toHaveCount(0);
  await expect(page.locator('.bracket-del')).toHaveCount(0);
  await expect(page.locator('.bracket-del-match')).toHaveCount(0);
  // Cột thao tác cũng không được chiếm chỗ trong bảng kết quả.
  await expect(page.locator('.results-table .row-actions')).toHaveCount(0);
});

test('admin đăng nhập thấy nút Xóa, xác nhận bằng modal của site rồi dòng biến mất', async ({ page }) => {
  const creds = credentials();
  test.skip(!creds, 'Cần .env.local có ADMIN_USER và ADMIN_PASS');

  await page.goto('/');
  const origin = new URL(page.url()).origin;
  const login = await page.request.post('/api/admin/login', { headers: { Origin: origin }, data: creds });
  expect(login.status()).toBe(200);

  const event = 'Kiểm thử xóa ' + Date.now();
  const created = await page.request.post('/api/admin/results', {
    headers: { Origin: origin },
    data: { id: crypto.randomUUID(), sport_id: 1, event, participants: 'Đội A', score: '1–0', revision: 0 },
  });
  expect(created.status()).toBe(200);

  await page.reload();
  const row = page.locator('#result-panel tr', { hasText: event });
  await expect(row).toBeVisible();

  const del = row.locator('.row-delete');
  await expect(del).toBeVisible();
  await del.click();

  // Phải là modal của site, không phải hộp thoại mặc định của trình duyệt.
  const dialog = page.locator('#confirm-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(event);
  await expect(dialog.locator('#confirm-no')).toBeVisible();

  await dialog.locator('#confirm-yes').click();
  await expect(row).toHaveCount(0);
});

test('bấm Không trong modal xác nhận thì không xóa gì', async ({ page }) => {
  const creds = credentials();
  test.skip(!creds, 'Cần .env.local có ADMIN_USER và ADMIN_PASS');

  await page.goto('/');
  const origin = new URL(page.url()).origin;
  await page.request.post('/api/admin/login', { headers: { Origin: origin }, data: creds });

  const event = 'Kiểm thử giữ lại ' + Date.now();
  const id = crypto.randomUUID();
  await page.request.post('/api/admin/results', {
    headers: { Origin: origin },
    data: { id, sport_id: 1, event, participants: 'Đội B', score: '2–0', revision: 0 },
  });

  await page.reload();
  const row = page.locator('#result-panel tr', { hasText: event });
  await row.locator('.row-delete').click();
  await page.locator('#confirm-dialog #confirm-no').click();
  await expect(page.locator('#confirm-dialog')).toBeHidden();
  await expect(row).toBeVisible();

  // Dọn lại để lần chạy sau không tích dữ liệu thừa.
  await page.request.delete('/api/admin/results', { headers: { Origin: origin }, data: { id, revision: 1 } });
});
