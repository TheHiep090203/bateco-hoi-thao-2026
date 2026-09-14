import { test, expect } from '@playwright/test';

// sports[] in dist/app.js and competitionViews[] share one order, so the card
// index is the rules tab index. These titles come from ruleSummaries.
const ARENAS = [
  { card: 'Kéo co 10 vs 10',                 tab: 'Kéo co',                 heading: 'Kéo co' },
  { card: 'Điền kinh',                       tab: 'Điền kinh',              heading: 'Nam 1.500m' },
  { card: 'Pickleball',                      tab: 'Pickleball',             heading: 'Pickleball' },
  { card: 'AOE 4 vs 4',                      tab: 'AOE',                    heading: 'AOE' },
  { card: 'Giải bóng đá Nam – BATECO CUP',   tab: 'Bóng đá Nam – BATECO CUP', heading: 'Bóng đá Nam – BATECO CUP' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#dau-truong .sport')).toHaveCount(5);
});

test('mỗi card đấu trường là nút bấm được và đổi con trỏ chuột khi hover', async ({ page }) => {
  const cards = page.locator('#dau-truong .sport');
  for (let i = 0; i < 5; i++) {
    const card = cards.nth(i);
    await expect(card).toHaveAttribute('data-arena', String(i));
    expect(await card.evaluate(el => el.tagName)).toBe('BUTTON');
    await card.hover();
    expect(await card.evaluate(el => getComputedStyle(el).cursor)).toBe('pointer');
  }
});

for (const [i, arena] of ARENAS.entries()) {
  test(`bấm card "${arena.card}" cuộn tới Luật Thi Đấu và mở đúng luật`, async ({ page }) => {
    await page.locator(`#dau-truong [data-arena="${i}"]`).click();

    // Đúng tab được chọn
    const tab = page.locator(`#rules-tab-${i}`);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab).toHaveText(arena.tab);

    // Các tab khác phải bỏ chọn
    for (let j = 0; j < 5; j++) {
      if (j !== i) await expect(page.locator(`#rules-tab-${j}`)).toHaveAttribute('aria-selected', 'false');
    }

    // Nội dung luật đúng môn
    await expect(page.locator('#rules-panel')).toContainText(arena.heading);

    // Đã cuộn tới đúng khu vực, không bị header dính che
    await expect(page.locator('#luat-thi-dau')).toBeInViewport();
    const headerBottom = await page.locator('header').evaluate(el => el.getBoundingClientRect().bottom);
    const sectionTop = await page.locator('#luat-thi-dau').evaluate(el => el.getBoundingClientRect().top);
    expect(sectionTop).toBeGreaterThanOrEqual(headerBottom - 1);

    // Focus chuyển sang tab để tiếp tục điều hướng bằng bàn phím
    await expect(tab).toBeFocused();
  });
}

test('bấm bằng bàn phím (Enter) cũng mở đúng luật', async ({ page }) => {
  await page.locator('#dau-truong [data-arena="2"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rules-tab-2')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#rules-panel')).toContainText('Pickleball');
});

test('điền kinh giữ được bộ chọn nội dung nam/nữ/tiếp sức sau khi mở từ card', async ({ page }) => {
  await page.locator('#dau-truong [data-arena="1"]').click();
  await expect(page.locator('#rules-panel [data-athletics]')).toHaveCount(3);
  await page.locator('#rules-panel [data-athletics="women"]').click();
  await expect(page.locator('#rules-panel')).toContainText('Nữ 1.500m');
});
