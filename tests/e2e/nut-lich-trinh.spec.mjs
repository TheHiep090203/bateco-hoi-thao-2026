import { test, expect } from '@playwright/test';

const NUT = '#lich-trinh .date-row .entry-button';

async function toiMucLichTrinh(page){
  await page.goto('/');
  await page.locator('#lich-trinh').scrollIntoViewIfNeeded();
  await expect(page.locator('#lich-trinh .date-chip')).toBeVisible({ timeout: 15000 });
}

test('nút nhập lịch trình nằm cạnh thẻ ngày chứ không còn trong tiêu đề mục', async ({ page }) => {
  await toiMucLichTrinh(page);

  await expect(page.locator(NUT)).toHaveCount(1);
  await expect(page.locator('#lich-trinh .section-head .entry-button'),
    'nút còn sót trong section-head thì luật CSS flex-wrap cũ vẫn sống và vị trí mới không đúng yêu cầu')
    .toHaveCount(0);

  const canh = await page.evaluate(() => {
    const nut = document.querySelector('#lich-trinh .date-row .entry-button');
    const chip = document.querySelector('#lich-trinh .date-chip');
    const a = nut.getBoundingClientRect(), b = chip.getBoundingClientRect();
    return {
      cungCha: nut.parentElement === chip.parentElement,
      benPhai: a.left >= b.right,
      khoangCach: Math.round(a.left - b.right),
      cungHang: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) < 4,
    };
  });
  expect(canh.cungCha, 'nút và thẻ ngày phải chung một hàng flex').toBe(true);
  expect(canh.benPhai, 'nút phải nằm bên phải thẻ ngày').toBe(true);
  expect(canh.khoangCach, 'nút bị đẩy ra xa thẻ ngày, margin-left:auto chưa được huỷ')
    .toBeLessThanOrEqual(20);
  expect(canh.cungHang, 'nút và thẻ ngày lệch nhau theo chiều dọc').toBe(true);
});

test('nút icon vẫn đạt vùng chạm 44px ở cả màn rộng lẫn màn 320px', async ({ page }) => {
  for (const width of [1280, 320]){
    await page.setViewportSize({ width, height: 900 });
    await toiMucLichTrinh(page);
    const hop = await page.locator(NUT).boundingBox();
    expect(hop.width, `ở ${width}px nút icon hụt bề ngang so với chuẩn nền tảng 44px`)
      .toBeGreaterThanOrEqual(44);
    expect(hop.height, `ở ${width}px nút icon hụt chiều cao so với chuẩn nền tảng 44px`)
      .toBeGreaterThanOrEqual(44);
  }
});

test('nút chỉ còn icon nhưng vẫn giữ tên cho trình đọc màn hình', async ({ page }) => {
  await toiMucLichTrinh(page);

  const theoVaiTro = page.locator('#lich-trinh').getByRole('button', { name: 'Nhập lịch trình' });
  await expect(theoVaiTro,
    'trình đọc màn hình phải tìm được nút theo đúng tên Nhập lịch trình').toHaveCount(1);

  const noiDung = await page.evaluate(() => {
    const nut = document.querySelector('#lich-trinh .date-row .entry-button');
    return {
      chu: nut.innerText.trim(),
      soSvg: nut.querySelectorAll('svg').length,
      svgBiAnVoiTrinhDoc: nut.querySelector('svg')?.getAttribute('aria-hidden'),
      giuDataEntry: nut.dataset.entry,
    };
  });
  expect(noiDung.chu, 'nút phải là icon thuần, không còn chữ hiện ra').toBe('');
  expect(noiDung.soSvg, 'icon phải là SVG nội tuyến để ăn theo currentColor').toBe(1);
  expect(noiDung.svgBiAnVoiTrinhDoc, 'SVG trang trí phải bị trình đọc màn hình bỏ qua').toBe('true');
  expect(noiDung.giuDataEntry, 'mất data-entry thì entry.js không gắn được handler').toBe('schedule');
});

test('canh giữ: bốn mục nhập liệu còn lại vẫn giữ nguyên nút chữ như cũ', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#ket-qua .entry-button')).toHaveText('Nhập kết quả', { timeout: 15000 });
  await expect(page.locator('#huy-chuong .entry-button')).toHaveText('Nhập huy chương');
  await expect(page.locator('#luat-thi-dau .entry-button')).toHaveText('Nhập luật thi đấu');

  await expect(page.locator('#bang-dau [data-entry]')).toHaveCount(2);
  const hienRa = page.locator('#bang-dau [data-entry]:not([hidden])');
  await expect(hienRa, 'mục Bảng đấu chỉ được hiện đúng một nút theo tab đang chọn').toHaveCount(1);
  await expect(hienRa).toHaveText('Nhập bảng đấu');
});
