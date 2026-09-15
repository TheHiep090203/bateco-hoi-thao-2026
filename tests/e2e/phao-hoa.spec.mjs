import { test, expect } from '@playwright/test';

const FX = '.hero canvas.hero-fx';
const TRAN_DPR = 1.5;

async function pixelsDrawn(page){
  return page.evaluate(() => {
    const fx = document.querySelector('.hero canvas.hero-fx');
    if (!fx) return -1;
    const ctx = fx.getContext('2d');
    const { data } = ctx.getImageData(0, 0, fx.width, fx.height);
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
    return lit;
  });
}

async function demRaf(page){
  return page.evaluate(() => window.__demRaf);
}

async function gaiDemRaf(page){
  await page.addInitScript(() => {
    window.__demRaf = 0;
    const goc = window.requestAnimationFrame;
    window.requestAnimationFrame = cb => { window.__demRaf++; return goc.call(window, cb) };
  });
}

test.describe('pháo hoa nền khối giới thiệu', () => {
  test('canvas pháo hoa có mặt và là con trực tiếp của khối hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(FX)).toHaveCount(1);

    const shape = await page.evaluate(() => {
      const fx = document.querySelector('.hero canvas.hero-fx');
      return { parentIsHero: fx.parentElement === document.querySelector('.hero'),
               ariaHidden: fx.getAttribute('aria-hidden') };
    });
    expect(shape.parentIsHero, 'canvas phải là con trực tiếp của .hero mới ăn đúng thứ tự lớp').toBe(true);
    expect(shape.ariaHidden, 'canvas trang trí phải bị trình đọc màn hình bỏ qua').toBe('true');
  });

  test('pháo hoa vẽ ra điểm ảnh thật chứ không phải canvas rỗng', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(FX)).toHaveCount(1);
    await expect.poll(() => pixelsDrawn(page),
      { message: 'canvas không có điểm ảnh nào sáng, pháo hoa chưa vẽ gì', timeout: 12000 })
      .toBeGreaterThan(0);
  });

  test('chữ trong hero luôn được xếp trên canvas, và canvas không nhận sự kiện chuột', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(FX)).toHaveCount(1);

    const lop = await page.evaluate(() => {
      const doc = sel => getComputedStyle(document.querySelector(sel)).zIndex;
      return {
        canvas: doc('.hero canvas.hero-fx'),
        chuTren: doc('.hero-inner'),
        chuDuoi: doc('.hero-bottom'),
        pointerEvents: getComputedStyle(document.querySelector('.hero canvas.hero-fx')).pointerEvents,
      };
    });
    expect(lop.canvas, 'canvas leo lên z-index khác 0 sẽ che mất chữ trong hero').toBe('0');
    expect(lop.chuTren, 'hero-inner mất z-index 1 thì tiêu đề và nút sẽ chìm xuống dưới pháo hoa').toBe('1');
    expect(lop.chuDuoi, 'hero-bottom mất z-index 1 thì dòng 03 LIÊN MINH sẽ chìm xuống dưới pháo hoa').toBe('1');
    expect(lop.pointerEvents, 'canvas phủ kín hero nên phải trong suốt với chuột').toBe('none');
  });

  test('cuộn khỏi khối hero thì vòng vẽ dừng hẳn chứ không chỉ xoá canvas', async ({ page }) => {
    await gaiDemRaf(page);
    await page.goto('/');
    await expect(page.locator(FX)).toHaveCount(1);

    const dangChay = await demRaf(page);
    await page.waitForTimeout(700);
    expect(await demRaf(page), 'hero đang trong khung nhìn mà vòng vẽ không quay')
      .toBeGreaterThan(dangChay);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => pixelsDrawn(page),
      { message: 'hạt bị đóng băng giữa màn hình sau khi hero cuộn khuất', timeout: 12000 }).toBe(0);

    const sauKhiCuon = await demRaf(page);
    await page.waitForTimeout(1200);
    expect(await demRaf(page),
      'canvas đã sạch nhưng vòng rAF vẫn quay, máy vẫn tốn pin dù không ai nhìn thấy gì')
      .toBe(sauKhiCuon);
  });

  test('bật giảm chuyển động giữa phiên thì gỡ luôn canvas, không bắt người dùng tải lại trang', async ({ page }) => {
    await gaiDemRaf(page);
    await page.goto('/');
    await expect(page.locator(FX)).toHaveCount(1);
    await expect.poll(() => pixelsDrawn(page), { timeout: 12000 }).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expect(page.locator(FX),
      'người bật giảm chuyển động vì trang đang gây khó chịu phải được dừng ngay, không phải tải lại trang')
      .toHaveCount(0);
    const sauKhiTat = await demRaf(page);
    await page.waitForTimeout(1200);
    expect(await demRaf(page), 'canvas đã bị gỡ nhưng vòng rAF vẫn quay').toBe(sauKhiTat);
  });

  test('kéo cạnh cửa sổ không cấp phát lại bitmap canvas theo từng sự kiện resize', async ({ page }) => {
    await page.addInitScript(() => {
      window.__capPhat = 0;
      const goc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
      Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
        get: goc.get,
        set(v){ if (this.classList?.contains('hero-fx')) window.__capPhat++; goc.set.call(this, v) },
        configurable: true,
      });
    });
    await page.goto('/');
    await expect(page.locator(FX)).toHaveCount(1);

    const truoc = await page.evaluate(() => window.__capPhat);
    await page.evaluate(() => { for (let i = 0; i < 60; i++) window.dispatchEvent(new Event('resize')) });
    await page.waitForTimeout(500);
    const them = await page.evaluate(() => window.__capPhat) - truoc;

    expect(them,
      'mỗi lần gán canvas.width là một lần cấp phát bitmap mới; kéo cạnh cửa sổ bắn hàng chục sự kiện mỗi giây nên phải gom về một khung hình')
      .toBeLessThanOrEqual(2);
  });

});

test.describe('điện thoại màn hình mật độ cao', () => {
  test.use({ deviceScaleFactor: 3, viewport: { width: 390, height: 844 } });

  test('trần devicePixelRatio chặn số điểm ảnh phải tô, không để canvas phình theo dpr 3', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(FX)).toHaveCount(1);

    const do_ = await page.evaluate(() => {
      const fx = document.querySelector('.hero canvas.hero-fx');
      const hero = document.querySelector('.hero');
      return { dpr: devicePixelRatio, heroCssW: hero.clientWidth, heroCssH: hero.clientHeight,
               backingW: fx.width, backingH: fx.height };
    });
    expect(do_.dpr, 'phép đo này chỉ có nghĩa khi trình duyệt thật sự báo dpr 3').toBe(3);
    expect(do_.backingW,
      `bỏ trần dpr thì canvas rộng ${do_.heroCssW * 3}px thay vì ${do_.heroCssW * TRAN_DPR}px, gấp 4 lần số điểm ảnh phải tô mỗi khung`)
      .toBe(Math.round(do_.heroCssW * TRAN_DPR));
    expect(do_.backingH).toBe(Math.round(do_.heroCssH * TRAN_DPR));
  });
});

test.describe('người dùng chọn giảm chuyển động', () => {
  test.use({ reducedMotion: 'reduce' });

  test('canh giữ nếp cứng: không có canvas pháo hoa nào được tạo ra', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await expect(page.locator(FX),
      'giảm chuyển động thì canvas phải không tồn tại, không phải chỉ đứng im').toHaveCount(0);
  });
});
