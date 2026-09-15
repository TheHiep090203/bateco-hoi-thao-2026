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

const DEFAULT_ROWS = 9;

async function restoreDefault(page, origin){
  await page.request.delete('/api/admin/schedule', {
    headers: { Origin: origin, 'Content-Type': 'application/json' }, data: {} });
}

test('chưa nhập gì thì mục Lịch trình vẫn hiện đúng nội dung nướng sẵn', async ({ page }) => {
  const creds = credentials();
  test.skip(!creds, 'Cần .env.local có ADMIN_USER và ADMIN_PASS');

  await page.goto('/');
  const origin = new URL(page.url()).origin;
  await page.request.post('/api/admin/login', { headers: { Origin: origin }, data: creds });
  await restoreDefault(page, origin);

  await page.reload();
  await expect(page.locator('#lich-trinh .timeline li')).toHaveCount(DEFAULT_ROWS);
  await expect(page.locator('#lich-trinh .timeline li').first().locator('time')).toHaveText('07:30 – 08:00');
  await expect(page.locator('#lich-trinh .timeline li').nth(6).locator('strong'),
    'dấu & phải hiện ra thành dấu &, không thành thực thể HTML').toHaveText('Pickleball & Esport');
  await expect(page.locator('#lich-trinh .timeline .pill')).toHaveCount(1);
});

test('lịch trình admin nhập hiện ra trang, và chữ nhập vào không bao giờ thành HTML', async ({ page }) => {
  const creds = credentials();
  test.skip(!creds, 'Cần .env.local có ADMIN_USER và ADMIN_PASS');

  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers: { Origin: origin }, data: creds })).status()).toBe(200);

  const marker = 'Kiem thu lich trinh ' + Date.now();
  const xss = '<img src=x onerror="window.__bidoc=1">';
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await expect(page.locator('#lich-trinh .entry-button')).toBeVisible({ timeout: 15000 });
    await page.locator('#lich-trinh .entry-button').click();

    const box = page.locator('#entry-dialog textarea[name="text"]');
    await expect(box).toBeVisible();
    await box.fill([`06:00 | ${marker}`, `07:00 | ${xss}`, `08:00 | Trận chốt | ${marker} CUP`].join('\n'));
    await page.locator('#schedule-save').click();
    await expect(page.locator('#entry-status')).toHaveText('Đã lưu. Mục Lịch trình đã cập nhật.');
    await page.locator('#entry-close').click();

    const items = page.locator('#lich-trinh .timeline li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0).locator('strong')).toHaveText(marker);
    await expect(items.nth(1).locator('strong'), 'thẻ img phải hiện thành chữ').toHaveText(xss);
    await expect(page.locator('#lich-trinh .timeline img'), 'không được sinh ra thẻ img thật').toHaveCount(0);
    expect(await page.evaluate(() => window.__bidoc), 'script nhúng qua nội dung không được chạy').toBeUndefined();

    await expect(page.locator('#lich-trinh .timeline .pill')).toHaveCount(1);
    await expect(items.nth(2).locator('.pill'), 'nhãn phải nằm đúng mục có cột thứ ba').toHaveText(marker + ' CUP');
    await expect(items.nth(0).locator('.pill')).toHaveCount(0);
  } finally {
    await restoreDefault(page, origin);
  }
});

test('nút Khôi phục mặc định gỡ hẳn nội dung đã nhập và trả Lịch trình về mặc định', async ({ page }) => {
  const creds = credentials();
  test.skip(!creds, 'Cần .env.local có ADMIN_USER và ADMIN_PASS');

  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers: { Origin: origin }, data: creds })).status()).toBe(200);

  const saved = await page.request.post('/api/admin/schedule', {
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    data: { text: '05:00 | Mục sẽ bị khôi phục' } });
  expect(saved.status()).toBe(200);

  await page.reload();
  await expect(page.locator('#lich-trinh .timeline li')).toHaveCount(1);

  await page.locator('#lich-trinh .entry-button').click();
  await expect(page.locator('#entry-dialog textarea[name="text"]')).toHaveValue('05:00 | Mục sẽ bị khôi phục');
  await page.locator('#schedule-reset').click();
  await page.locator('#confirm-dialog #confirm-yes').click();

  await expect(page.locator('#entry-status'),
    'phải chờ đúng chuỗi kết thúc: Đang khôi phục… cũng chứa chữ khôi phục').toHaveText('Đã khôi phục nội dung mặc định.');
  await expect(page.locator('#lich-trinh .timeline li')).toHaveCount(DEFAULT_ROWS);

  await page.locator('#entry-close').click();
  const after = await (await page.request.get('/api/schedule')).json();
  expect(after.schedule, 'khôi phục phải xoá hẳn dòng override, không chỉ ghi đè').toBeNull();
});
