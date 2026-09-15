import { test, expect } from '@playwright/test';

const REVEALED = ['lien-minh', 'dau-truong', 'lich-trinh', 'huy-chuong', 'luat-thi-dau', 'faq'];
const NEVER_REVEALED = ['bang-dau', 'ket-qua'];

async function classesOf(page, id){
  return page.$eval(`#${id}`, el => [...el.classList]);
}

test.describe('chuyển động mặc định', () => {
  test('mọi mục được chọn đều hiện ra hết mờ sau khi cuộn tới', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    for (const id of REVEALED){
      await expect(page.locator(`#${id}`), `${id} phải mang lớp reveal`).toHaveClass(/bt-reveal/);
      await expect.poll(async () => page.$eval(`#${id}`, el => getComputedStyle(el).opacity),
        { message: `${id} bị kẹt ở trạng thái mờ, người xem sẽ không đọc được nội dung` }).toBe('1');
    }
  });

  test('hai mục bị đo vùng chạm không bao giờ mang lớp chuyển động', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('#faq')).toHaveClass(/bt-shown/);
    for (const id of NEVER_REVEALED){
      const classes = await classesOf(page, id);
      expect(classes, `${id} dùng elementFromPoint để đo vùng chạm, transform sẽ làm lệch phép đo`)
        .not.toContain('bt-reveal');
      expect(classes).not.toContain('bt-shown');
    }
  });

  test('đồng hồ đếm ngược không có chuyển động vì bị vẽ lại mỗi giây', async ({ page }) => {
    await page.goto('/');
    const style = await page.$eval('#countdown', el => {
      const s = getComputedStyle(el);
      return { animation: s.animationName, transition: s.transitionDuration };
    });
    expect(style.animation).toBe('none');
    expect(parseFloat(style.transition) || 0).toBe(0);
  });

  test('chấm báo đang cập nhật có nhịp nhấp nháy', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.live-status')).toBeVisible();
    const name = await page.$eval('.live-status', el => getComputedStyle(el, '::before').animationName);
    expect(name).toBe('bt-pulse');
  });
});

test.describe('người dùng chọn giảm chuyển động', () => {
  test.use({ reducedMotion: 'reduce' });

  test('không mục nào bị đặt lớp reveal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    for (const id of [...REVEALED, ...NEVER_REVEALED]){
      expect(await classesOf(page, id), `${id} không được ẩn đi khi người dùng đã tắt chuyển động`)
        .not.toContain('bt-reveal');
    }
  });

  test('mọi chuyển động và hoạt ảnh đều bị tắt', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.live-status')).toBeVisible();
    const durations = await page.evaluate(() => {
      const read = sel => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).transitionDuration : null;
      };
      return {
        alliance: read('.alliance'),
        sport: read('.sport'),
        entry: read('.entry-button'),
        tab: read('.sport-tabs button'),
        dot: getComputedStyle(document.querySelector('.live-status'), '::before').animationName,
      };
    });
    for (const [name, value] of Object.entries(durations)){
      if (name === 'dot') expect(value, 'chấm live vẫn nhấp nháy').toBe('none');
      else expect(parseFloat(value) || 0, `${name} vẫn còn transition`).toBe(0);
    }
  });
});
