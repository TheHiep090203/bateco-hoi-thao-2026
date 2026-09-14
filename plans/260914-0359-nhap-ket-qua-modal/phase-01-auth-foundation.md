---
phase: 1
title: "Nền tảng xác thực"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Nền tảng xác thực

## Goal

Thay xác thực qua header `oai-authenticated-user-id` bằng đăng nhập user/password
kiểm tra ở server, phát cookie ký HMAC, để việc nhập kết quả chạy được ở local và
mật khẩu không nằm trong bundle client.

## Files to Create / Modify

- Create: `.dev.vars` (đã nằm trong `.gitignore`, không commit)
- Modify: `server/domain.mjs` — thêm `signSession`, `verifySession`, `safeEqual`
- Modify: `server/worker.mjs` — viết lại `isAdmin`, thêm login/logout, bỏ nhánh `/admin`
- Modify: `scripts/build.mjs` — thay chuỗi import bằng regex
- Modify: `package.json` — script `test` build trước khi chạy
- Modify: `tests/scoreboard.test.mjs` — bỏ header admin cũ, thêm test xác thực

## Bối cảnh bắt buộc đọc trước

`scripts/build.mjs` nhúng `domain.mjs` vào `worker.mjs` bằng `String.replace` với
**chuỗi khớp chính xác**:

```js
source.replace("import { allianceData, sportData, standings, validateResult } from './domain.mjs';", ...)
```

Thêm bất kỳ export mới nào vào dòng import của `worker.mjs` mà quên sửa chuỗi này
trong `build.mjs` sẽ làm `replace` không khớp và **âm thầm không nhúng gì cả** —
build vẫn báo thành công. Bước 1 dưới đây xử lý dứt điểm chuyện này trước khi
đụng tới bất cứ thứ gì khác.

## Tasks & Steps

### 1. Làm `build.mjs` hết giòn (làm đầu tiên)

Trong `scripts/build.mjs`, đổi phép thay chuỗi chính xác thành regex khớp cả dòng:

```js
source = source.replace(/^import .* from '\.\/domain\.mjs';\r?\n/m, domainSource + '\n');
```

Sau đó thêm một kiểm tra fail-fast ngay sau khi thay: nếu chuỗi
`from './domain.mjs'` vẫn còn trong `source` thì `throw` với thông báo rõ ràng.
Từ giờ thêm export mới không còn cần đụng vào `build.mjs`.

### 2. Bắt `pnpm test` build trước

`tests/scoreboard.test.mjs` dòng 1 import từ bundle đã build. Hiện `test` không
build nên rất dễ chạy test trên bundle cũ. Sửa `package.json`:

```json
"test": "node scripts/build.mjs && node --test tests/*.test.mjs"
```

### 3. Thêm helper phiên đăng nhập vào `server/domain.mjs`

Đặt ở `domain.mjs` để test unit được trực tiếp, không phải dựng cả Worker.

- `safeEqual(a, b)` — so sánh không phụ thuộc thời gian: kiểm tra độ dài trước,
  rồi XOR dồn qua từng ký tự, **không được return sớm** giữa vòng lặp.
- `signSession(secret, exp)` — trả `` `${exp}.${sig}` `` với
  `sig = base64url(HMAC-SHA256(secret, String(exp)))` qua `crypto.subtle`. Hàm
  async. `base64url` = base64 chuẩn rồi thay `+` `/` `=` cho an toàn trong cookie.
- `verifySession(secret, token, nowMs)` — tách `exp` và `sig`, trả `false` khi
  token rỗng/sai định dạng, khi `exp` không phải số nguyên, khi `exp <= nowMs`,
  hoặc khi chữ ký tính lại không khớp (dùng `safeEqual`). Trả `true` khi hợp lệ.

Cập nhật dòng import ở đầu `server/worker.mjs` để lấy thêm ba hàm này.

### 4. Viết lại xác thực trong `server/worker.mjs`

Thay toàn bộ thân hàm `isAdmin` (dòng 6) bằng phiên bản đọc cookie:

- Đọc header `Cookie`, tách giá trị `admin=`.
- Trả về `verifySession(env.SESSION_SECRET, token, Date.now())`.
- Nếu thiếu `env.SESSION_SECRET` thì trả `false` (fail closed, không bao giờ
  mặc định cho qua).
- `isAdmin` không còn chạm vào `env.DB` nữa.

Thêm hai endpoint trong khối `path.startsWith('/api/')`:

- `POST /api/admin/login` — bắt buộc `Origin === url.origin` và
  `Content-Type: application/json`; giới hạn body 1000 byte. Đọc `{user, pass}`,
  so bằng `safeEqual` với `env.ADMIN_USER` / `env.ADMIN_PASS`. Sai thì
  `await new Promise(r => setTimeout(r, 500))` rồi trả 401 với thông báo tiếng
  Việt chung chung (không nói sai user hay sai pass). Đúng thì tính
  `exp = Date.now() + 8*3600*1000`, gọi `signSession`, trả `Set-Cookie`:

  ```
  admin=<token>; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800
  ```

  Chỉ thêm `; Secure` khi `url.protocol === 'https:'` — nếu luôn đặt `Secure` thì
  mở trang qua IP LAN dạng `http://192.168.x.x` sẽ không gửi được cookie và không
  đăng nhập được.
- `POST /api/admin/logout` — trả `Set-Cookie: admin=; Max-Age=0; Path=/` kèm
  cùng bộ thuộc tính.

### 5. Dọn phần xác thực cũ

- Xóa toàn bộ khối `if(path==='/admin'||...)` (dòng 10-13) trong `worker.mjs`.
- Xóa mọi tham chiếu `oai-authenticated-user-id` và
  `oai-authenticated-user-email`, gồm cả các chốt 401 trong nhánh POST/DELETE
  `/api/admin/results` (thay bằng kiểm tra `isAdmin`), và
  `env.ADMIN_BOOTSTRAP_EMAIL`.
- `updated_by` hiện lưu user id của OpenAI. Đổi thành hằng `'admin'`.
- `GET /api/admin/session` giữ nguyên hành vi: 403 khi chưa đăng nhập, `{admin:true}`
  khi đã đăng nhập. `entry.js` ở Phase 2 dùng endpoint này để bỏ qua bước login.
- Bảng `admins` không còn được dùng. **Chưa xóa bảng ở phase này** — việc bỏ export
  trong `db/schema.ts` và `DROP TABLE` gộp vào migration `0001` ở Phase 3 để chỉ có
  một migration duy nhất.

### 6. Tạo `.dev.vars`

```
ADMIN_USER=bateco
ADMIN_PASS=dat-mat-khau-o-day
SESSION_SECRET=<chuỗi ngẫu nhiên, sinh bằng: openssl rand -hex 32>
```

Kiểm tra lại `.dev.vars` đã có trong `.gitignore` (đã có sẵn ở dòng 4) và
`git status` không thấy file này.

### 7. Cập nhật test

`tests/scoreboard.test.mjs` hiện dùng hằng `admin` là hai header OpenAI (dòng 3) —
những header đó không còn tác dụng, các test sẽ đỏ nếu không sửa.

- Đổi `admin` thành header `Cookie` chứa token hợp lệ, sinh bằng `signSession`
  với secret test. Thêm `SESSION_SECRET` vào object `env` trong các test.
- Bỏ `ADMIN_BOOTSTRAP_EMAIL` khỏi `env`, bỏ test `/admin` (dòng 8) vì route đã xóa.
- Test mới cho xác thực:
  - đăng nhập đúng `bateco`/`123` trả 200 kèm header `Set-Cookie` có `HttpOnly`
  - đăng nhập sai mật khẩu trả 401 và **không** có `Set-Cookie`
  - đăng nhập sai `Origin` trả 403
  - cookie có `exp` trong quá khứ bị từ chối
  - cookie đúng `exp` nhưng chữ ký bị sửa một ký tự thì bị từ chối
  - `safeEqual` trả đúng với chuỗi khác độ dài và chuỗi lệch một ký tự

## Verification

```bash
node scripts/build.mjs                 # phải in dòng thành công, không throw
grep -c "oai-authenticated" server/worker.mjs    # phải ra 0
grep -c "from './domain.mjs'" dist/server/index.js   # phải ra 0 (đã nhúng)
pnpm test                              # toàn bộ xanh
git status --short                     # KHÔNG được thấy .dev.vars
```

Kiểm tra tay trên `wrangler dev` cổng 8787:

```bash
# sai mật khẩu -> 401, không có Set-Cookie
curl -s -i -X POST -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:8787" \
  -d '{"user":"bateco","pass":"sai"}' http://127.0.0.1:8787/api/admin/login | head -12

# đúng mật khẩu -> 200 kèm Set-Cookie
curl -s -i -c /tmp/ck.txt -X POST -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:8787" \
  -d '{"user":"bateco","pass":"123"}' http://127.0.0.1:8787/api/admin/login | head -12

# dùng cookie vừa nhận -> lưu kết quả thành công
curl -s -b /tmp/ck.txt -X POST -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:8787" \
  -d '{"id":"00000000-0000-4000-8000-000000000001","sport_id":1,"event":"Thu","participants":"A vs B","score":"2-1","gold":1,"silver":2,"bronze":3,"revision":0}' \
  http://127.0.0.1:8787/api/admin/results

# không cookie -> vẫn phải 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" \
  -H "Origin: http://127.0.0.1:8787" -d '{}' http://127.0.0.1:8787/api/admin/results
```

## Success Criteria

- [ ] `node scripts/build.mjs` nhúng được `domain.mjs` và throw rõ ràng nếu không nhúng được
- [ ] `pnpm test` tự build trước rồi chạy, toàn bộ xanh
- [ ] Đăng nhập đúng trả cookie `HttpOnly`; sai trả 401 chậm ~500ms và không có cookie
- [ ] Cookie hết hạn hoặc sai chữ ký đều bị từ chối
- [ ] `POST /api/admin/results` không cookie vẫn trả 401
- [ ] Không còn tham chiếu `oai-authenticated-user-id` trong mã nguồn
- [ ] `.dev.vars` tồn tại ở local và không bị git theo dõi
