---
phase: 3
title: "Bảng đấu"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Bảng đấu

## Goal

Cho Bảng đấu một nơi lưu trữ thật trong D1, API ghi theo kiểu thay cả set, và
editor 4 cột trong modal với nhãn cột đổi theo môn đang chọn.

## Files to Create / Modify

- Create: `drizzle/0001_draws.sql`
- Modify: `db/schema.ts` — thêm `draws`, bỏ `admins`
- Modify: `server/domain.mjs` — thêm `validateDraws`
- Modify: `server/worker.mjs` — `POST /api/admin/draws`, `snapshot()` trả thêm `draws`
- Modify: `dist/live.js` — nạp `draws` vào renderer sẵn có
- Modify: `dist/entry.js` — nhánh form `draw`
- Modify: `tests/scoreboard.test.mjs` — test cho `draws`

## Bối cảnh bắt buộc đọc trước

**Không sửa renderer.** `renderSportPanel('draw', i)` trong `dist/app.js` đã render
đúng thứ cần: nó lặp `officialCompetitionData[i].rows` và map `row[k]` với
`competitionViews[i].columns[k]`, escape qua `officialText()`. Việc duy nhất cần làm
là **đổ dữ liệu vào `rows`** rồi gọi lại hàm đó.

**Không cần override hàm.** `officialCompetitionData` là `const` nên không gán lại
được, nhưng **mutate được**: `officialCompetitionData[i].rows = [...]`. Đây là cách
đơn giản hơn hẳn so với override kiểu `showResult`, và không phải đụng vào `app.js`.

**Backup trước khi migrate.** D1 local nằm trong `.wrangler/state`. Sao lưu thư mục
này trước khi chạy migration.

## Tasks & Steps

### 1. Backup D1 local

```bash
cp -r .wrangler/state .wrangler/state.bak-$(date +%y%m%d-%H%M)
```

### 2. Migration `drizzle/0001_draws.sql`

```sql
CREATE TABLE `draws` (
  `id` text PRIMARY KEY NOT NULL,
  `sport_id` integer NOT NULL REFERENCES `sports`(`id`),
  `ord` integer NOT NULL,
  `c1` text DEFAULT '' NOT NULL,
  `c2` text DEFAULT '' NOT NULL,
  `c3` text DEFAULT '' NOT NULL,
  `c4` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `draws_sport_ord` ON `draws` (`sport_id`,`ord`);
--> statement-breakpoint
DROP TABLE IF EXISTS `admins`;
```

Cập nhật `db/schema.ts`: thêm export `draws` khớp đúng schema trên, bỏ export
`admins` (Phase 1 đã gỡ hết chỗ dùng nó trong code).

Kiểm tra `drizzle/meta/_journal.json` có ghi nhận migration mới. Nếu sinh file bằng
tay thay vì `pnpm db:generate` thì phải thêm entry vào journal đúng định dạng của
entry `0000` đang có, nếu không `wrangler d1 migrations apply` sẽ bỏ qua.

### 3. `validateDraws` trong `server/domain.mjs`

Nhận body, ném `Error` với thông báo tiếng Việt khi sai, trả object đã làm sạch:

- `sport_id` phải là số nguyên trong khoảng 1..5, ngược lại: "Vui lòng chọn môn thi đấu."
- `rows` phải là mảng, tối đa 60 phần tử, ngược lại: "Số dòng bảng đấu vượt quá giới hạn."
- Mỗi phần tử phải là mảng đúng 4 chuỗi, mỗi chuỗi `.trim()` và tối đa 200 ký tự.
- Mảng rỗng là hợp lệ và có nghĩa là **xóa hết** bảng đấu của môn đó.
- Bỏ các dòng mà cả 4 ô đều rỗng sau khi trim, tránh lưu dòng trống.

Thêm `validateDraws` vào dòng import ở đầu `server/worker.mjs`. Nhờ Phase 1 đã đổi
`build.mjs` sang regex nên **không phải sửa `build.mjs`**.

### 4. Endpoint `POST /api/admin/draws`

Đặt cạnh nhánh `/api/admin/results`, giữ nguyên bộ chốt an toàn:

- `Origin === url.origin` và `Content-Type: application/json`, ngược lại 403.
- Giới hạn body 24000 byte, vượt thì 413.
- `if (!await isAdmin(request, env)) return json({error:'Bạn không có quyền cập nhật bảng đấu.'}, 403)`.
- Parse và `validateDraws`, lỗi thì 400 kèm `e.message`.
- **Gọi `await seed(env)` trước khi ghi.** `draws.sport_id` tham chiếu `sports(id)`,
  mà bảng `sports` chỉ được nạp bởi `seed()`. Trên database mới tinh, ghi bảng đấu
  trước khi seed sẽ vi phạm khóa ngoại. Nhánh `/api/admin/results` đã làm đúng thứ
  tự này, làm theo y hệt.
- Ghi bằng **một** `env.DB.batch()` để chạy trong một transaction:

```js
await env.DB.batch([
  env.DB.prepare('DELETE FROM draws WHERE sport_id = ?').bind(d.sport_id),
  ...d.rows.map((row, i) => env.DB.prepare(
    'INSERT INTO draws (id,sport_id,ord,c1,c2,c3,c4) VALUES (?,?,?,?,?,?,?)'
  ).bind(crypto.randomUUID(), d.sport_id, i, row[0], row[1], row[2], row[3]))
]);
```

Mở rộng `snapshot()` để trả thêm `draws`, thêm câu truy vấn vào `env.DB.batch()`
đang có:

```sql
SELECT id,sport_id,ord,c1,c2,c3,c4 FROM draws ORDER BY sport_id, ord
```

### 5. Nạp dữ liệu ở `dist/live.js`

Trong `renderLive()`, thêm:

```js
const drawRows = liveData.draws || [];
for (let i = 0; i < officialCompetitionData.length; i++)
  officialCompetitionData[i].rows = drawRows
    .filter(d => d.sport_id === i + 1)
    .map(d => [d.c1, d.c2, d.c3, d.c4]);
const activeDraw = document.querySelector('#bang-dau [data-draw][aria-selected="true"]');
if (activeDraw) renderSportPanel('draw', Number(activeDraw.dataset.draw));
```

`snapshot()` đã `ORDER BY sport_id, ord` nên không cần sort lại ở client.

Lưu ý `sync()` chỉ gọi `renderLive()` khi dữ liệu đổi (`changed`), nên lần poll đầu
tiên luôn chạy và bảng đấu sẽ được nạp ngay khi trang mở.

### 6. Editor 4 cột trong `dist/entry.js`

Thay chỗ tạm "Đang cập nhật" ở Phase 2 bằng editor thật:

- Đọc môn đang chọn từ
  `document.querySelector('#bang-dau [data-draw][aria-selected="true"]').dataset.draw`,
  mặc định `0` nếu không có.
- Thêm select cho phép đổi môn ngay trong modal, options lấy từ
  `competitionViews.map(v => v.label)`.
- Hiện danh sách dòng, mỗi dòng 4 ô input với **nhãn lấy từ
  `competitionViews[i].columns[k]`** để nhãn đổi đúng theo môn (ví dụ Điền kinh hiện
  "Nội dung / VĐV / Lượt chạy / Lịch thi đấu" chứ không phải "Bảng / Vòng").
- Nút **Thêm dòng** và nút xóa trên từng dòng. `maxlength="200"` cho mỗi ô.
- Nạp sẵn dòng hiện có từ `liveData.draws` lọc theo môn.
- Đổi môn trong select thì nạp lại dòng của môn mới. Nếu đang có thay đổi chưa lưu
  thì hỏi xác nhận trước khi bỏ.
- Nút **Lưu bảng đấu** gửi `{sport_id, rows}` tới `POST /api/admin/draws`, sau đó
  đóng modal và gọi `sync()`.
- Cảnh báo rõ ràng ngay trên form: "Lưu sẽ thay thế toàn bộ bảng đấu của môn này."

## Verification

```bash
cp -r .wrangler/state .wrangler/state.bak-$(date +%y%m%d-%H%M)
pnpm exec wrangler d1 migrations apply DB --local
node scripts/build.mjs
pnpm test
pnpm exec wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table'"
# phải thấy draws, KHÔNG còn admins
```

Kiểm tra tay trên `wrangler dev` cổng 8787:

1. Bấm **Nhập kết quả** ở `#bang-dau`, đăng nhập, thấy editor với nhãn cột đúng môn.
2. Đổi select sang **Điền kinh**, nhãn đổi thành "Nội dung / VĐV / Lượt chạy / Lịch thi đấu".
3. Thêm 2 dòng, lưu, modal đóng và tab môn đó hiện đúng 2 dòng vừa nhập.
4. F5 tải lại trang, 2 dòng vẫn còn.
5. Lưu lại với 1 dòng, tab chỉ còn 1 dòng (thay cả set hoạt động đúng).
6. Lưu với 0 dòng, tab quay về "Chưa có bảng đấu và cặp đấu chính thức."
7. Nhập `<script>alert(1)</script>` vào một ô, lưu, trang hiển thị nguyên văn chuỗi
   đó chứ không chạy script.

Test tự động cần thêm:

- `POST /api/admin/draws` không cookie trả 403
- sai `Origin` trả 403
- `sport_id = 6` trả 400
- dòng có 3 phần tử thay vì 4 trả 400
- lưu 3 dòng rồi lưu lại 1 dòng thì `snapshot().draws` chỉ còn đúng 1 dòng của môn đó
- lưu môn 1 không làm mất dòng của môn 2
- ghi bảng đấu trên database mới tinh (chưa từng gọi `/api/scoreboard`) vẫn thành
  công, chứng minh `seed()` được gọi đúng lúc

## Success Criteria

- [ ] Migration chạy được, có bảng `draws`, không còn bảng `admins`
- [ ] Nhãn cột trong editor đổi đúng theo từng môn
- [ ] Lưu thay toàn bộ set của đúng một môn, không đụng môn khác
- [ ] Dòng đã lưu còn nguyên sau khi tải lại trang
- [ ] Nội dung có HTML bị escape, không chạy được script
- [ ] `POST /api/admin/draws` không đăng nhập trả 403
- [ ] `pnpm test` xanh với test mới cho `draws`
