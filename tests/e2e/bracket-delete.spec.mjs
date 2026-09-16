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

const SCORE_CODES = [];
for (let r = 1; r <= 5; r++) for (let c = 1; c <= 4; c++) SCORE_CODES.push(`R${r}C${c}`);
const FINAL_CODES = ['SF1', 'SF2', 'GOLD', 'BRONZE'];
const NHAT_A = 'Hoàng Nam + Huyền Trang';
const NHI_A = 'Đức Anh + Thanh Ngà';
const NHAT_B = 'Tuấn Lộc + Thị Lương';
const NHI_B = 'Văn Tùng + Thu Hường';

function pickleData(over = {}){
  return {
    pairs: { A: [0,1,2,3,4].map(() => ['','','']), B: [0,1,2,3,4].map(() => ['','','']) },
    scores: Object.fromEntries(SCORE_CODES.map(c => [c, ''])),
    groups: { A: { first: null, second: null }, B: { first: null, second: null } },
    finals: Object.fromEntries(FINAL_CODES.map(c => [c, { score: '', winner: null }])),
    ...over,
  };
}

async function servePickleWithoutWritingSharedDb(page, data){
  await page.route('**/api/scoreboard', async route => {
    const res = await route.fetch();
    const body = await res.json();
    body.brackets = [{ sport_id: 3, data }];
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });
}

test('tab Pickleball hiện vòng bảng và nhánh chung kết, không còn bảng 4 cột', async ({ page }) => {
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  await expect(page.locator('#draw-panel .bracket-sheet')).toBeVisible();
  await expect(page.locator('#draw-panel .draw-sheet'), 'Pickleball dùng vòng bảng nên không được kèm bảng 4 cột').toHaveCount(0);
  await expect(page.locator('.pickle-group'), 'phải có đúng hai bảng').toHaveCount(2);
  await expect(page.locator('.pickle-seat'), 'mỗi bảng 5 đôi, tổng 10 đôi').toHaveCount(10);
  await expect(page.locator('.pickle-round'), 'lịch có đúng 5 lượt').toHaveCount(5);
  await expect(page.locator('.pickle-match'), '5 lượt × 4 sân = 20 trận vòng tròn một lượt').toHaveCount(20);
  await expect(page.locator('.pickle-final'), 'vòng chung kết có 2 bán kết, 1 trận tranh Vàng–Bạc, 1 trận tranh Đồng').toHaveCount(4);
  await expect(page.locator('.pickle-final .bracket-slot')).toHaveCount(8);
});

test('lịch lượt 1 khớp đúng bốn cặp đấu trên bốn sân của ảnh tham chiếu', async ({ page }) => {
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  const round = page.locator('.pickle-round').first();
  await expect(round).toContainText('Lượt 1');
  const matches = round.locator('.pickle-match');
  await expect(matches).toHaveCount(4);
  await expect(matches.nth(0)).toContainText(NHAT_A);
  await expect(matches.nth(0)).toContainText(NHI_A);
  await expect(matches.nth(2)).toContainText('Minh Hiếu + Huy Tuân');
  await expect(matches.nth(2)).toContainText(NHI_B);
  await expect(matches.nth(3)).toContainText(NHAT_B);
});

test('4 môn còn lại chỉ hiện bảng đấu và chỉ hiện nút Nhập bảng đấu', async ({ page }) => {
  await page.goto('/');
  for (const i of [0, 1, 3, 4]) {
    await page.locator(`#draw-tab-${i}`).click();
    await expect(page.locator('#draw-panel .draw-sheet')).toBeVisible();
    await expect(page.locator('#draw-panel .bracket-sheet'), `tab ${i} không dùng vòng bảng`).toHaveCount(0);
    await expect(page.locator('#bang-dau [data-entry="draw"]'), `tab ${i} phải hiện nút Nhập bảng đấu`).toBeVisible();
    await expect(page.locator('#bang-dau [data-entry="bracket"]'), `tab ${i} không được hiện nút Nhập vòng bảng`).toBeHidden();
  }
});

test('lúc mới tải trang và mỗi lần đổi tab, đúng một nút nhập liệu hiện ra', async ({ page }) => {
  await page.goto('/');
  const draw = page.locator('#bang-dau [data-entry="draw"]');
  const bracket = page.locator('#bang-dau [data-entry="bracket"]');
  await expect(page.locator('#bang-dau [data-entry]'),
    'cả hai nút phải luôn tồn tại; toBeHidden cũng xanh khi phần tử biến mất').toHaveCount(2);
  await expect(draw, 'tab mặc định là Kéo co nên phải hiện nút Nhập bảng đấu').toBeVisible();
  await expect(bracket, 'tab mặc định là Kéo co nên phải ẩn nút Nhập vòng bảng').toBeHidden();
  for (const i of [2, 0, 2, 4, 2]) {
    await page.locator(`#draw-tab-${i}`).click();
    const pickle = i === 2;
    await expect(draw, `tab ${i}: nút Nhập bảng đấu phải ${pickle ? 'ẩn' : 'hiện'}`).toBeVisible({ visible: !pickle });
    await expect(bracket, `tab ${i}: nút Nhập vòng bảng phải ${pickle ? 'hiện' : 'ẩn'}`).toBeVisible({ visible: pickle });
  }
});

test('hai bán kết và hai trận tranh huy chương tự suy ra từ Nhất Nhì bảng và đội thắng', async ({ page }) => {
  await servePickleWithoutWritingSharedDb(page, pickleData({
    groups: { A: { first: 0, second: 2 }, B: { first: 3, second: 1 } },
    finals: {
      SF1: { score: '11-9', winner: 1 }, SF2: { score: '11-4', winner: 2 },
      GOLD: { score: '', winner: null }, BRONZE: { score: '', winner: null },
    },
  }));
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  const finals = page.locator('.pickle-final');
  await expect(finals.nth(0), 'Bán kết 1 = Nhất bảng A gặp Nhì bảng B').toContainText(NHAT_A);
  await expect(finals.nth(0)).toContainText(NHI_B);
  await expect(finals.nth(1), 'Bán kết 2 = Nhất bảng B gặp Nhì bảng A').toContainText(NHAT_B);
  await expect(finals.nth(1)).toContainText(NHI_A);
  await expect(finals.nth(2), 'tranh Vàng–Bạc là hai đội THẮNG bán kết').toContainText(NHAT_A);
  await expect(finals.nth(2)).toContainText(NHI_A);
  await expect(finals.nth(3), 'tranh Đồng là hai đội THUA bán kết').toContainText(NHI_B);
  await expect(finals.nth(3)).toContainText(NHAT_B);
});

test('trận chung kết đã có đội thắng nhưng chưa nhập tỉ số vẫn hiện ô tỉ số để còn sửa được', async ({ page }) => {
  await servePickleWithoutWritingSharedDb(page, pickleData({
    groups: { A: { first: 0, second: 2 }, B: { first: 3, second: 1 } },
    finals: {
      SF1: { score: '', winner: 1 }, SF2: { score: '', winner: 2 },
      GOLD: { score: '', winner: null }, BRONZE: { score: '', winner: null },
    },
  }));
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  const sf1 = page.locator('.pickle-final').first();
  await expect(sf1.locator('.pickle-score'),
    'có đội thắng thì phải còn ô tỉ số, nếu không admin mất chỗ bấm để sửa nhầm lẫn').toHaveCount(1);
  await expect(sf1.locator('.pickle-score')).toHaveText('—');
  await expect(sf1.locator('.bracket-slot.is-winner')).toHaveCount(1);
  await expect(page.locator('.pickle-final').nth(2).locator('.pickle-score'),
    'trận chưa có đội thắng lẫn tỉ số thì không hiện ô tỉ số').toHaveCount(0);
});

test('dòng dữ liệu còn giữ hình dạng sơ đồ cũ vẫn hiện vòng bảng rỗng, không ném lỗi', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await servePickleWithoutWritingSharedDb(page, { teams: ['AB','CD','EF','GH','JK','LM','XC','VB'], matches: { QF1: { score: '2-1', winner: 1 } } });
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  expect(await page.evaluate(() => JSON.stringify(pickleData)),
    'dữ liệu hình dạng cũ phải thật sự tới được trang, nếu không phép thử này xanh vô nghĩa').toContain('QF1');
  await expect(page.locator('.pickle-match')).toHaveCount(20);
  await expect(page.locator('.pickle-score'), 'dữ liệu sơ đồ cũ không được hiểu thành tỉ số vòng bảng').toHaveCount(0);
  await expect(page.locator('.pickle-final .bracket-slot.is-empty')).toHaveCount(8);
  expect(errors, 'dữ liệu hình dạng cũ không được làm vỡ app.js').toEqual([]);
});

test('tên thành viên do admin sửa hiện ra khắp trang, kể cả trong lịch thi đấu', async ({ page }) => {
  const pairs = { A: [0,1,2,3,4].map(() => ['','','']), B: [0,1,2,3,4].map(() => ['','','']) };
  pairs.A[0] = ['Hoàng Nam', 'Dự Bị Thu Hà', 'BP'];
  await servePickleWithoutWritingSharedDb(page, pickleData({
    pairs,
    groups: { A: { first: 0, second: 2 }, B: { first: 3, second: 1 } },
    finals: { ...pickleData().finals, SF1: { score: '11-9', winner: 1 } },
  }));
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  const seat = page.locator('.pickle-group').first().locator('.pickle-seat').first();
  await expect(seat, 'thành phần bảng phải hiện tên đã sửa').toContainText('Hoàng Nam + Dự Bị Thu Hà');
  await expect(seat, 'nhãn liên minh sửa được cùng lúc').toContainText('BP');
  await expect(page.locator('.pickle-round').first().locator('.pickle-match').first(),
    'lịch thi đấu phải dùng tên mới chứ không giữ tên nướng sẵn').toContainText('Dự Bị Thu Hà');
  await expect(page.locator('.pickle-final').first(),
    'nhánh chung kết suy từ hạt giống nên cũng phải hiện tên mới').toContainText('Dự Bị Thu Hà');
  await expect(page.locator('#draw-panel'), 'tên cũ không được còn sót lại ở đâu').not.toContainText('Huyền Trang');
});

test('đổi tên một đôi không làm mất tỉ số đã nhập vì tỉ số lưu theo hạt giống', async ({ page }) => {
  const pairs = { A: [0,1,2,3,4].map(() => ['','','']), B: [0,1,2,3,4].map(() => ['','','']) };
  pairs.A[0] = ['Hoàng Nam', 'Dự Bị Thu Hà', 'TP'];
  await servePickleWithoutWritingSharedDb(page, pickleData({
    pairs,
    scores: { ...pickleData().scores, R1C1: '11-7' },
  }));
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  const first = page.locator('.pickle-round').first().locator('.pickle-match').first();
  await expect(first, 'tỉ số phải còn nguyên sau khi đổi tên').toContainText('11-7');
  await expect(first).toContainText('Dự Bị Thu Hà');
});

test('tên để trống thì quay về tên mặc định nướng sẵn', async ({ page }) => {
  const pairs = { A: [0,1,2,3,4].map(() => ['','','']), B: [0,1,2,3,4].map(() => ['','','']) };
  pairs.A[0] = ['', 'Dự Bị Thu Hà', ''];
  await servePickleWithoutWritingSharedDb(page, pickleData({ pairs }));
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  const seat = page.locator('.pickle-group').first().locator('.pickle-seat').first();
  await expect(seat, 'ô trống nghĩa là dùng tên mặc định, chỉ ô có chữ mới đè lên').toContainText('Hoàng Nam + Dự Bị Thu Hà');
  await expect(seat, 'nhãn liên minh để trống cũng quay về mặc định').toContainText('TP');
});

test('tên do admin nhập không bao giờ trở thành HTML trên trang công khai', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const pairs = { A: [0,1,2,3,4].map(() => ['','','']), B: [0,1,2,3,4].map(() => ['','','']) };
  pairs.A[0] = ['a" onmouseover="x', '<img src=x onerror=y>', 'TP'];
  await servePickleWithoutWritingSharedDb(page, pickleData({ pairs }));
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  const seat = page.locator('.pickle-seat').first();
  await expect(seat, 'tên phải hiện nguyên văn dạng chữ').toContainText('a" onmouseover="x + <img src=x onerror=y>');
  await expect(page.locator('#draw-panel img'), 'không một thẻ img nào được sinh ra từ tên').toHaveCount(0);
  await expect(page.locator('#draw-panel [onmouseover]'), 'không thuộc tính sự kiện nào bị chèn vào').toHaveCount(0);
  expect(errors, 'tên độc hại không được làm vỡ trang').toEqual([]);
});

test('lưu form chỉ ghi phần admin thật sự sửa, nút khôi phục xoá hẳn phần đã sửa', async ({ page }) => {
  const creds = credentials();
  test.skip(!creds, 'Cần .env.local có ADMIN_USER và ADMIN_PASS');

  await servePickleWithoutWritingSharedDb(page, pickleData());
  const sent = [];
  await page.route('**/api/admin/bracket', async route => {
    sent.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sport_id":3}' });
  });

  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers: { Origin: origin }, data: creds })).status()).toBe(200);
  await page.reload();
  await page.locator('#draw-tab-2').click();
  await page.locator('#bang-dau [data-entry="bracket"]').click();
  await page.locator('#bracket-form').waitFor();

  await page.locator('#bracket-form [data-pair="A.0.0"]').fill('Hoàng Nam');
  await page.locator('#bracket-form [data-pair="A.0.1"]').fill('Dự Bị Thu Hà');
  await page.locator('#bracket-save').click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].pairs.A[0],
    'gõ đúng tên mặc định phải lưu thành rỗng, chỉ tên khác mặc định mới được ghi đè')
    .toEqual(['', 'Dự Bị Thu Hà', '']);
  expect(sent[0].pairs.B[4], 'đôi không đụng tới phải hoàn toàn rỗng').toEqual(['', '', '']);

  await page.locator('#bracket-form [data-pair="A.0.1"]').fill('Người Khác Hẳn');
  await page.locator('#pickle-names-reset').click();
  await expect(page.locator('#bracket-form [data-pair="A.0.1"]'),
    'khôi phục phải xoá phần vừa sửa và trả ô về tên mặc định nướng sẵn').toHaveValue('Huyền Trang');
  await page.locator('#bracket-save').click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].pairs.A[0], 'sau khi khôi phục, tài liệu không được giữ lại tên đã sửa')
    .toEqual(['', '', '']);
});

test('sửa xong một ô tên rồi bấm Tab thì con trỏ sang đúng ô kế tiếp', async ({ page }) => {
  const creds = credentials();
  test.skip(!creds, 'Cần .env.local có ADMIN_USER và ADMIN_PASS');

  await servePickleWithoutWritingSharedDb(page, pickleData());
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers: { Origin: origin }, data: creds })).status()).toBe(200);
  await page.reload();
  await page.locator('#draw-tab-2').click();
  await page.locator('#bang-dau [data-entry="bracket"]').click();
  await page.locator('#bracket-form').waitFor();

  await page.locator('#bracket-form [data-pair="A.0.1"]').fill('Dự Bị Thu Hà');
  await expect(page.locator('[data-vs="R1C1"]'),
    'nhãn trận phải đổi theo ngay, không chờ rời khỏi ô').toContainText('Dự Bị Thu Hà');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.dataset?.pair ?? 'MAT-FOCUS'),
    'vẽ lại cả form lúc rời ô sẽ nuốt mất cú Tab và đẩy con trỏ về body').toBe('A.0.2');
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
  await servePickleWithoutWritingSharedDb(page, pickleData({
    scores: { ...pickleData().scores, R1C1: '11-7' },
    finals: { ...pickleData().finals, SF1: { score: '11-9', winner: 1 } },
  }));
  await page.goto('/');
  await page.locator('#draw-tab-2').click();
  await expect(page.locator('.pickle-groups')).toBeVisible();
  await expect(page.locator('.pickle-score'),
    'phải có tỉ số hiển thị, nếu không thì phép thử vắng nút Xóa là xanh vô nghĩa').toHaveCount(2);
  await expect(page.locator('.row-delete')).toHaveCount(0);
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
  const cleaned = await page.request.delete('/api/admin/results', { headers: { Origin: origin }, data: { id, revision: 1 } });
  expect(cleaned.status(), 'lệnh dọn phải thành công, nếu không lần chạy sau sẽ lệch dữ liệu').toBe(200);
});
