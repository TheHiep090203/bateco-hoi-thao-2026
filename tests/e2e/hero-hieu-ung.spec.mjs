import { test, expect } from '@playwright/test';

const HERO_PARTS = ['.hero .eyebrow', '.hero h1', '.hero .tagline', '.hero .actions', '.hero-bottom'];

async function styleOf(page, sel, prop){
  return page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
}

test('các khối trong hero hiện ra so le chứ không bật lên cùng lúc', async ({ page }) => {
  await page.goto('/');
  const delays = [];
  for (const sel of HERO_PARTS){
    expect(await styleOf(page, sel, 'animationName'), `${sel} phải có hiệu ứng hiện dần`).toBe('heroRise');
    delays.push(parseFloat(await styleOf(page, sel, 'animationDelay')));
  }
  for (let i = 1; i < delays.length; i++){
    expect(delays[i], `khối thứ ${i + 1} phải hiện sau khối trước, nếu bằng nhau thì không còn là so le`)
      .toBeGreaterThan(delays[i - 1]);
  }
  expect(await styleOf(page, '.hero .event-card', 'animationName'),
    'thẻ ngày chỉ mờ dần, không dịch chuyển, để không đụng vào transform sẵn có').toBe('heroFade');
});

test('bật giảm chuyển động thì hero tắt hiệu ứng nhưng nội dung vẫn phải đọc được', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForTimeout(200);
  for (const sel of [...HERO_PARTS, '.hero .event-card']){
    expect(await styleOf(page, sel, 'animationName'), `${sel} phải tắt hiệu ứng`).toBe('none');
    expect(Number(await styleOf(page, sel, 'opacity')),
      `${sel} dùng animation-fill-mode backwards nên nếu tắt sai cách sẽ kẹt ở trạng thái vô hình`).toBe(1);
  }
});

test('mọi khối hero đều hiện rõ sau khi hiệu ứng chạy xong', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1600);
  for (const sel of [...HERO_PARTS, '.hero .event-card']){
    expect(Number(await styleOf(page, sel, 'opacity')), `${sel} phải hiện hẳn`).toBeGreaterThan(0.98);
  }
});

test('đồng hồ dùng cột chữ số cuộn và giấu cột đó khỏi trình đọc màn hình', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#countdown .roll-d');
  await expect(page.locator('#countdown b').first(),
    'cột mười chữ số nếu lọt vào cây trợ năng sẽ bị đọc thành 0 1 2 3 4 5 6 7 8 9').toHaveAttribute('aria-hidden', 'true');
  const box = await page.locator('#countdown .roll-d').first().boundingBox();
  const col = await page.locator('#countdown .roll-col').first().boundingBox();
  expect(col.height, 'cột phải cao gấp mười lần ô nhìn thấy, tức chứa đủ mười chữ số').toBeGreaterThan(box.height * 9);
  expect(box.height, 'ô nhìn thấy chỉ được cao đúng một chữ số').toBeLessThan(col.height / 9);
  const moved = await page.evaluate(() => {
    const el = document.querySelector('#countdown .roll-col');
    return getComputedStyle(el).transform;
  });
  expect(moved, 'cột phải được dịch bằng transform để chỉ lộ đúng một chữ số').not.toBe('none');
});

test('giảm chuyển động thì chữ số vẫn đổi nhưng không cuộn', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForSelector('#countdown .roll-col');
  expect(await styleOf(page, '#countdown .roll-col', 'transitionDuration'),
    'giữ hiệu ứng cuộn khi người dùng đã xin giảm chuyển động là sai').toBe('0s');
});

test('trên điện thoại, trạng thái sự kiện phải nằm trong màn hình đầu tiên', async ({ page }) => {
  for (const [w, h, name] of [[360, 800, 'Android phổ thông'], [390, 844, 'iPhone 14'], [414, 896, 'iPhone Plus']]){
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.waitForSelector('#countdown .roll-d');
    const bottom = await page.evaluate(() => Math.round(document.querySelector('#countdown').getBoundingClientRect().bottom));
    expect(bottom,
      `${name}: sáng ngày hội thao khách mời mở web là để xem còn bao lâu, bắt cuộn mới thấy thì hỏng mục đích`)
      .toBeLessThanOrEqual(h);
  }
});
