---
phase: 2
title: "Modal và form kết quả"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Modal và form kết quả

## Goal

Dựng modal dùng chung hai bước (đăng nhập rồi nhập liệu), gắn nút **Nhập kết quả**
vào `#ket-qua` và `#huy-chuong`, và xóa trang `/admin` để chỉ còn một đường vào.

## Files to Create / Modify

- Create: `dist/entry.js`
- Modify: `dist/index.html` — thêm thẻ script
- Modify: `dist/app.js` — chèn nút vào `.section-head`
- Modify: `dist/live.css` — vài class cho nút và modal
- Modify: `scripts/build.mjs` — đăng ký `entry.js` vào danh sách asset
- Delete: `dist/admin.html`, `dist/admin.js`

## Bối cảnh bắt buộc đọc trước

**Thứ tự script quyết định mọi thứ.** `dist/index.html` nạp `app.js` rồi `live.js`.
Các khai báo `const`/`function` ở cấp cao nhất của script cổ điển nằm chung phạm vi
toàn cục, nên `live.js` đang dùng trực tiếp `showResult`, `dialog`, `lastButton` do
`app.js` khai báo. `entry.js` khai thác đúng cơ chế đó để lấy `competitionViews`,
`sports`, nên **phải nạp sau `live.js`**.

**Không viết lại form.** `dist/admin.js` đã có đủ: tải danh sách, render danh sách
kèm nút Sửa/Xóa, xử lý submit với `revision`, hộp thoại xác nhận xóa, khóa nút khi
đang gửi, thông báo lỗi tiếng Việt cho từng mã trạng thái. Chuyển nguyên phần đó
sang `entry.js` và đổi phần gắn DOM, không gõ lại từ đầu.

**`#huy-chuong` đang dùng slot `<span>`.** `heading()` sinh ra
`<div class="section-head"><div>…</div><span>…</span></div>`, và `live.js` cập nhật
đúng cái `<span>` đó bằng selector `#huy-chuong .section-head>span`. Nút phải là
**element riêng**, không được chiếm chỗ `<span>` này, nếu không dòng trạng thái
"Chưa có huy chương được cập nhật" sẽ bị nút ghi đè.

## Tasks & Steps

### 1. Chèn nút vào ba section-head

Trong `dist/app.js`, sau khi `#content` đã dựng xong, thêm một vòng lặp chèn nút:

```js
for (const [id, kind] of [['bang-dau','draw'],['huy-chuong','result'],['ket-qua','result']])
  document.querySelector('#' + id + ' .section-head')
    .insertAdjacentHTML('beforeend',
      `<button type="button" class="entry-button" data-entry="${kind}" data-section="${id}">Nhập kết quả</button>`);
```

Nút của `#bang-dau` gắn luôn ở phase này nhưng chỉ hoạt động sau Phase 3; ở phase
này cho nó hiện thông báo "Đang cập nhật" để không có nút chết.

### 2. CSS cho nút và modal

Trong `dist/live.css`:

**Đã kiểm tra sẵn `dist/style.css`, không cần dò lại:**

- Desktop đã có `.section-head{display:flex;align-items:end;justify-content:space-between;gap:20px}`.
  Nút chèn thêm vào cuối sẽ **tự nằm bên phải**, không phải thêm gì.
- **Nhưng ở `@media(max-width:650px)` có `.section-head{align-items:start;flex-direction:column;gap:10px}`.**
  Nghĩa là trên điện thoại nút sẽ **rớt xuống dưới tiêu đề** chứ không nằm bên phải.
  Đây là lỗi hiển thị chắc chắn xảy ra nếu bỏ qua. Thêm vào `dist/live.css`:

  ```css
  @media(max-width:650px){
    .section-head{flex-direction:row;flex-wrap:wrap;align-items:center}
    .section-head>div{flex:1 1 100%}
    .entry-button{margin-left:auto}
  }
  ```

  Cho tiêu đề chiếm trọn một dòng, còn dòng trạng thái và nút xuống dòng dưới với
  nút đẩy sang phải. Kiểm tra lại ở bề ngang 375px.
- `#huy-chuong` sau khi thêm nút sẽ có ba phần tử con (`div`, `span`, `button`).
  Với `space-between` thì thành tiêu đề trái, dòng trạng thái giữa, nút phải — chấp
  nhận được. `#bang-dau` và `#ket-qua` chỉ có hai phần tử nên nút nằm sát phải.
- `.entry-button` — dùng lại tông của `.button` sẵn có, cỡ nhỏ, `margin-left:auto`.
- `#entry-dialog` — dùng lại style `dialog` sẵn có; chỉ thêm `max-width` và
  `width:min(760px, 92vw)` cùng `max-height:88vh; overflow:auto` để form dài cuộn được.

### 3. Dựng `dist/entry.js`

Cấu trúc file:

- Chèn một `<dialog id="entry-dialog">` vào `document.body`, gồm header có tiêu đề
  và nút đóng, một vùng `#entry-step-login` và một vùng `#entry-step-form`.
- `api(path, options)` — copy nguyên từ `admin.js`, giữ `AbortSignal.timeout(15000)`
  và việc ném lỗi theo `value.error`.
- `esc()` — copy từ `admin.js`.
- **Bước đăng nhập:** form user + password. Submit thì `POST /api/admin/login`.
  Sai thì hiện thông báo lỗi trả về từ server và giữ nguyên nội dung đã gõ. Đúng thì
  chuyển sang bước form.
- **Bỏ qua đăng nhập khi còn phiên:** khi mở modal, gọi `GET /api/admin/session`
  trước. Trả 200 thì nhảy thẳng vào bước form; khác 200 thì hiện bước đăng nhập.
- **Bước form** chọn theo `data-entry` của nút vừa bấm:
  - `result` — form kết quả chuyển từ `admin.js` sang, kèm danh sách kết quả đã nhập
    có Sửa/Xóa.
  - `draw` — ở phase này hiện tạm "Đang cập nhật", Phase 3 thay bằng editor thật.
- **Prefill môn thi đấu:** khi mở từ `#ket-qua`, đọc tab đang chọn bằng
  `document.querySelector('#ket-qua [data-result][aria-selected="true"]').dataset.result`
  rồi `+1` ra `sport_id`. Mở từ `#huy-chuong` thì không có tab nên để mặc định môn đầu.
- **Ghi chú ở `#huy-chuong`:** hiện dòng "Huy chương được cộng tự động từ kết quả thi
  đấu. Chọn liên minh nhận HCV/HCB/HCĐ ngay trong từng kết quả." để người dùng hiểu
  vì sao không có ô nhập số huy chương.
- **Sau khi lưu thành công:** đóng modal và gọi `sync()` của `live.js` ngay để bảng
  cập nhật tức thì thay vì đợi hết chu kỳ 5 giây. `sync` là `function` cấp cao nhất
  trong `live.js` nên gọi trực tiếp được.
- **Bàn phím và focus:** dùng `showModal()` để có sẵn focus trap và phím Esc; khi
  `close` thì trả focus về nút đã mở modal (`admin.js` đã có mẫu này ở
  `deleteDialog`); đặt `document.body.style.overflow` giống cách `app.js` làm với
  `#sport-dialog`.

### 4. Nối vào bundle

- `dist/index.html`: thêm `<script src="entry.js"></script>` **sau** `live.js`.
- `scripts/build.mjs`: thêm `'entry.js'` vào mảng danh sách file, đồng thời **bỏ**
  `'admin.html'` và `'admin.js'`.

### 5. Xóa trang admin

- Xóa `dist/admin.html` và `dist/admin.js`.
- Xác nhận nhánh `/admin` trong `worker.mjs` đã bị xóa ở Phase 1.
- `grep -rn "admin.html\|admin.js" .` (bỏ qua `node_modules`, `dist/server`) phải
  không còn kết quả nào.

## Verification

```bash
node scripts/build.mjs
grep -c "admin.html" dist/server/index.js    # phải ra 0
pnpm test                                     # vẫn xanh
```

Kiểm tra tay trên `wrangler dev` cổng 8787:

1. Trang chính hiện nút **Nhập kết quả** ở bên phải cả ba section-head.
2. Ở `#huy-chuong`, dòng trạng thái "Chưa có huy chương được cập nhật" **vẫn còn**
   bên cạnh nút, không bị nút ghi đè.
3. Bấm nút ở `#ket-qua` mở modal ở bước đăng nhập.
4. Nhập sai mật khẩu thì báo lỗi, không vào được form.
5. Nhập `bateco`/`123` thì vào form, môn thi đấu khớp với tab đang chọn.
6. Lưu một kết quả thì modal đóng, bảng kết quả và bảng tổng sắp huy chương đổi
   ngay lập tức, không phải đợi 5 giây.
7. Đóng rồi mở lại modal thì vào thẳng form, **không** hỏi lại mật khẩu.
8. Phím Esc đóng được modal và focus quay lại nút đã bấm.
9. Mở `http://127.0.0.1:8787/admin` trả 404.

## Success Criteria

- [ ] Ba nút hiện đúng vị trí, không phá dòng trạng thái của `#huy-chuong`
- [ ] Modal đăng nhập từ chối mật khẩu sai và chấp nhận `bateco`/`123`
- [ ] Form kết quả thêm, sửa, xóa được và bảng huy chương đổi theo
- [ ] Còn phiên thì mở modal không bị hỏi lại mật khẩu
- [ ] `/admin` trả 404 và không còn tham chiếu tới `admin.html` / `admin.js`
- [ ] Esc đóng modal, focus trả về đúng nút
