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

test('tab Pickleball chỉ hiện sơ đồ loại trực tiếp, không còn bảng vòng loại', async ({ page }) => {
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  await expect(page.locator('#draw-panel .bracket-sheet')).toBeVisible();
  await expect(page.locator('#draw-panel .draw-sheet'), 'Pickleball dùng sơ đồ nên không được kèm bảng vòng loại').toHaveCount(0);
  // 8 suất + 4 ô bán kết + NHẤT + NHÌ
  await expect(page.locator('.bracket-slot')).toHaveCount(14);
  await expect(page.locator('.bracket-tag')).toHaveCount(4);
});

test('4 môn còn lại chỉ hiện bảng đấu và chỉ hiện nút Nhập bảng đấu', async ({ page }) => {
  await page.goto('/');
  for (const i of [0, 1, 3, 4]) {
    await page.locator(`#draw-tab-${i}`).click();
    await expect(page.locator('#draw-panel .draw-sheet')).toBeVisible();
    await expect(page.locator('#draw-panel .bracket-sheet'), `tab ${i} không dùng sơ đồ`).toHaveCount(0);
    await expect(page.locator('#bang-dau [data-entry="draw"]'), `tab ${i} phải hiện nút Nhập bảng đấu`).toBeVisible();
    await expect(page.locator('#bang-dau [data-entry="bracket"]'), `tab ${i} không được hiện nút Nhập sơ đồ`).toBeHidden();
  }
});

test('lúc mới tải trang và mỗi lần đổi tab, đúng một nút nhập liệu hiện ra', async ({ page }) => {
  await page.goto('/');
  const draw = page.locator('#bang-dau [data-entry="draw"]');
  const bracket = page.locator('#bang-dau [data-entry="bracket"]');
  await expect(draw, 'tab mặc định là Kéo co nên phải hiện nút Nhập bảng đấu').toBeVisible();
  await expect(bracket, 'tab mặc định là Kéo co nên phải ẩn nút Nhập sơ đồ').toBeHidden();
  for (const i of [2, 0, 2, 4, 2]) {
    await page.locator(`#draw-tab-${i}`).click();
    const pickle = i === 2;
    await expect(draw, `tab ${i}: nút Nhập bảng đấu phải ${pickle ? 'ẩn' : 'hiện'}`).toBeVisible({ visible: !pickle });
    await expect(bracket, `tab ${i}: nút Nhập sơ đồ phải ${pickle ? 'hiện' : 'ẩn'}`).toBeVisible({ visible: pickle });
  }
});

test('form nhập bảng đấu bỏ Pickleball nhưng giữ nguyên chỉ số môn của 4 môn còn lại', async ({ page }) => {
  const creds = credentials();
  test.skip(!creds, 'Cần .env.local có ADMIN_USER và ADMIN_PASS');

  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers: { Origin: origin }, data: creds })).status()).toBe(200);

  await page.reload();
  await expect(page.locator('#huy-chuong tbody tr')).toHaveCount(3, { timeout: 15000 });
  await page.locator('#bang-dau [data-entry="draw"]').click();

  const options = page.locator('#entry-dialog #draw-sport option');
  await expect(options).toHaveCount(4);
  expect(await options.evaluateAll(els => els.map(e => e.value)),
    'value phải là chỉ số gốc, đánh số lại sẽ ghi lệch sport_id').toEqual(['0', '1', '3', '4']);
  expect((await options.allTextContents()).join(' | ')).not.toContain('Pickleball');
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
