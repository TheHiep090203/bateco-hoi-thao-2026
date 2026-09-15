import { test, expect } from '@playwright/test';

// CSP hiện tại là `default-src 'self'`. Không có `frame-src https://www.google.com`
// thì iframe bị chặn hoàn toàn, nên test này canh cả phần nhúng lẫn phần CSP.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('FAQ địa điểm tổ chức mở ra bản đồ Google nhúng', async ({ page }) => {
  const item = page.locator('#faq details', { hasText: 'Địa điểm tổ chức ở đâu?' });
  await item.locator('summary').click();

  const frame = item.locator('iframe');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.google\.com\/maps\/embed\?pb=/);
  await expect(frame).toHaveAttribute('title', /Sân Bóng Biên Phòng Cầu Diễn/);
  await expect(frame).toHaveAttribute('loading', 'lazy');
});

test('bản đồ không tràn ngang ở màn 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const item = page.locator('#faq details', { hasText: 'Địa điểm tổ chức ở đâu?' });
  await item.locator('summary').click();

  const box = await item.locator('.faq-map').boundingBox();
  expect(box.width).toBeLessThanOrEqual(375);
  expect(box.height).toBeGreaterThan(100);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('trang phục vụ CSP cho phép nhúng khung từ Google', async ({ page }) => {
  // scripts/dev.mjs phục vụ tĩnh qua header của worker, nên đọc thẳng response.
  const response = await page.request.get('/api/scoreboard');
  expect(response.headers()['content-security-policy']).toContain('frame-src https://www.google.com');
});
