import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Hồi quy responsive ở màn hẹp, cho các trạng thái chỉ xuất hiện khi có dữ liệu
// và khi admin đã đăng nhập — những trạng thái mà bản production rỗng không lộ ra.

// Ba test dùng chung một DB local: chạy song song sẽ đụng ràng buộc UNIQUE trên
// (sport_id,event) và ghi đè draws/bracket của nhau.
test.describe.configure({ mode: 'serial' });

const WIDTHS = [320, 360, 414];
const PICKLE = 2; // tab index 2 = sport_id 3 (Pickleball)
const TUG = 0;
const AA_MIN = 24; // WCAG 2.5.8 Target Size (Minimum)
const MARKER = '[e2e-responsive]'; // để dọn lại dữ liệu của chính test, kể cả sau lần chạy hỏng

// Mật khẩu đọc từ .env.local lúc chạy (đã gitignore), không nhúng vào repo.
function credentials(){
  try{
    const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
      .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
      .map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
    return env.ADMIN_USER&&env.ADMIN_PASS?{user:env.ADMIN_USER,pass:env.ADMIN_PASS}:null;
  }catch{ return null }
}

const TUG_PAIRS = [
  'Liên minh TIÊN PHONG – Đội hình 10 người chính thức đối đầu Liên minh BỨT PHÁ',
  'Liên minh CHINH PHỤC – Đội hình 10 người chính thức đối đầu Liên minh TIÊN PHONG',
];
const TEAMS = [
  'Liên minh Thăng Long – Đội tuyển Pickleball số 1',
  'Liên minh Vạn Xuân – Đội tuyển Pickleball số 2',
  'Liên minh Đại Việt – Đội tuyển Pickleball số 3',
  'Liên minh Thăng Long – Đội hình dự bị mở rộng',
  'Liên minh Vạn Xuân – Đội hình dự bị mở rộng',
  'Liên minh Đại Việt – Đội hình dự bị mở rộng',
  'Đội tuyển Khối Văn phòng Tổng hợp Hà Nội',
  'Đội tuyển Khối Kỹ thuật Vận hành Sản xuất',
];
const MATCHES = {
  QF1:{score:'2–1',winner:1}, QF2:{score:'2–0',winner:2},
  QF3:{score:'2–1',winner:1}, QF4:{score:'0–2',winner:2},
  SF1:{score:'2–1',winner:1}, SF2:{score:'1–2',winner:2},
  F:{score:'3–2',winner:1},
};

// Seed dữ liệu cố ý khắc nghiệt: tên dài, có dấu, có xuống dòng. Trả về id kết quả để dọn.
// Xóa mọi kết quả do test này tạo, kể cả sót lại từ lần chạy bị ngắt giữa chừng.
async function purge(page, origin){
  const snap = await (await page.request.get('/api/scoreboard')).json();
  for (const r of snap.results.filter(r => r.event.includes(MARKER)))
    await page.request.delete('/api/admin/results', { headers:{Origin:origin}, data:{ id: r.id, revision: r.revision } });
}

async function seed(page, origin){
  await purge(page, origin);
  const id = crypto.randomUUID();
  const r = await page.request.post('/api/admin/results', { headers:{Origin:origin}, data:{
    id, sport_id: 3,
    event: `Tứ kết 1 – Nội dung đôi nam nữ mở rộng ${MARKER}`,
    participants: `${TEAMS[0]}\nđối đầu\n${TEAMS[6]}`,
    score: '2–1 (11–9, 8–11, 11–7)', revision: 0 } });
  expect(r.status(), await r.text()).toBe(200);
  // draws và bracket ghi đè theo sport_id nên chạy lại nhiều lần vẫn cho cùng trạng thái.
  const d = await page.request.post('/api/admin/draws', { headers:{Origin:origin}, data:{
    sport_id: TUG + 1, rows: [
      ['Bảng A', TUG_PAIRS[0], 'Lượt 1 – thi đấu hai hiệp thắng một', 'Sân kéo co số 1 – Nhà thi đấu trung tâm'],
      ['Bảng B', TUG_PAIRS[1], 'Lượt 2 – thi đấu hai hiệp thắng một', 'Sân kéo co số 2 – Nhà thi đấu trung tâm'],
    ] } });
  expect(d.status(), await d.text()).toBe(200);
  const b = await page.request.post('/api/admin/bracket', { headers:{Origin:origin}, data:{
    sport_id: 3, teams: TEAMS, matches: MATCHES } });
  expect(b.status(), await b.text()).toBe(200);
}

async function loginAndSeed(page){
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers:{Origin:origin}, data:credentials() })).status()).toBe(200);
  await seed(page, origin);
  return { origin };
}

// Đo vùng chạm THẬT bằng elementFromPoint: getBoundingClientRect không tính phần
// ::after nong ra, nên chỉ đo hộp nhìn thấy sẽ bỏ sót đúng thứ ta muốn kiểm.
async function hitArea(page, selector){
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const reach = (dx, dy) => { let n = 0;
      for (let d = 1; d <= 60; d++){ if (document.elementFromPoint(cx+dx*d, cy+dy*d) !== el) break; n = d }
      return n };
    return { w: reach(1,0)+reach(-1,0), h: reach(0,1)+reach(0,-1) };
  }, selector);
}

async function openPickleballWithAdmin(page){
  await expect(page.locator('#ket-qua .entry-button')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#huy-chuong tbody tr')).toHaveCount(3, { timeout: 15000 });
  await page.locator(`#draw-tab-${PICKLE}`).click();
  // Nút Xóa chỉ mọc sau khi refreshAdminSession() lật adminSession sang true.
  await expect(page.locator('.bracket-del').first()).toBeVisible({ timeout: 15000 });
}

test('quy tắc mobile trong modal admin thật sự được áp dụng', async ({ page }) => {
  test.skip(!credentials(), 'Cần .env.local có ADMIN_USER và ADMIN_PASS');
  await loginAndSeed(page);

  await page.setViewportSize({ width: 320, height: 860 });
  await page.reload();
  await expect(page.locator('#ket-qua .entry-button')).toBeVisible({ timeout: 15000 });
  await page.locator('#ket-qua .entry-button').click();
  await expect(page.locator('#entry-dialog .admin-record').first()).toBeVisible({ timeout: 15000 });

  // Một dấu phẩy thừa trước @media từng làm trình duyệt vứt cả khối này, khiến
  // cột nhãn giữ cứng 145px trong khoang chỉ rộng ~250px.
  const dl = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#entry-dialog .record-details dl')).gridTemplateColumns);
  expect(dl.trim().split(/\s+/)).toHaveLength(1);
  expect(parseFloat(dl)).toBeGreaterThan(200);

});

test('mọi nút thao tác đạt ngưỡng vùng chạm của WCAG 2.5.8', async ({ page }) => {
  test.skip(!credentials(), 'Cần .env.local có ADMIN_USER và ADMIN_PASS');
  await loginAndSeed(page);

  await page.setViewportSize({ width: 320, height: 860 });
  await page.reload();
  await openPickleballWithAdmin(page);

  // .entry-button là chuẩn nền tảng 44px, không chỉ mức AA.
  const entry = await page.locator('#ket-qua .entry-button').boundingBox();
  expect(entry.height).toBeGreaterThanOrEqual(44);

  // Hai nút trong sơ đồ giữ nguyên hộp nhìn thấy (21px và ~14px) để không phá
  // layout; vùng chạm được nong bằng ::after nên phải đo bằng elementFromPoint.
  for (const sel of ['.bracket-del', '.bracket-del-match']){
    await page.locator(sel).first().scrollIntoViewIfNeeded();
    const area = await hitArea(page, sel);
    expect(area, `${sel} không tìm thấy`).not.toBeNull();
    expect(area.w, `${sel} rộng`).toBeGreaterThanOrEqual(AA_MIN);
    expect(area.h, `${sel} cao`).toBeGreaterThanOrEqual(AA_MIN);
  }

  await page.locator(`#result-tab-${PICKLE}`).click();
  await expect(page.locator('.results-table .row-delete').first()).toBeVisible({ timeout: 15000 });
  const rowDel = await page.locator('.results-table .row-delete').first().boundingBox();
  expect(rowDel.height).toBeGreaterThanOrEqual(AA_MIN);

});

test('không có cuộn ngang cấp trang ở màn hẹp khi đã có dữ liệu', async ({ page }) => {
  test.skip(!credentials(), 'Cần .env.local có ADMIN_USER và ADMIN_PASS');
  await loginAndSeed(page);

  for (const w of WIDTHS){
    await page.setViewportSize({ width: w, height: 860 });
    await page.reload();
    await openPickleballWithAdmin(page);
    // Bảng và sơ đồ được phép cuộn ngang bên trong container của chúng;
    // điều không được phép là cuộn ngang ở cấp trang.
    const overBracket = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overBracket, `${w}px bị cuộn ngang cấp trang ở tab sơ đồ`).toBe(0);

    await page.locator(`#draw-tab-${TUG}`).click();
    await expect(page.locator('#draw-panel .official-row').first()).toBeVisible({ timeout: 15000 });
    const overDraw = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overDraw, `${w}px bị cuộn ngang cấp trang ở tab bảng đấu có dữ liệu`).toBe(0);
  }

});
