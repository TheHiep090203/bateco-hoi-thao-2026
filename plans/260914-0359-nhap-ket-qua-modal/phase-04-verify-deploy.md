---
phase: 4
title: "Kiểm thử và chuẩn bị deploy"
status: pending
priority: P1
effort: "45m"
dependencies: [1, 2, 3]
---

# Phase 4: Kiểm thử và chuẩn bị deploy

## Goal

Chạy đủ bộ kiểm thử end-to-end trên `wrangler dev`, xác nhận mọi tiêu chí nghiệm
thu, và chuẩn bị secret cho production.

## Files to Create / Modify

- Modify: `tests/scoreboard.test.mjs` — bổ sung chỗ còn thiếu nếu có
- Modify: `README.md` — tạo mới nếu chưa có, ghi cách chạy local và cách đặt secret

## Tasks & Steps

### 1. Cổng chất lượng

```bash
node scripts/build.mjs
pnpm test
```

Cả hai phải xanh. Không được làm test dễ đi để cho qua; nếu test đỏ thì sửa code.

### 2. Kiểm thử end-to-end thủ công

Dùng server đang chạy ở cổng 8787 (hoặc khởi động lại). Chạy qua **toàn bộ** danh
sách dưới đây và ghi lại kết quả từng mục:

**Xác thực**

1. Mở trang ở cửa sổ ẩn danh, bấm **Nhập kết quả** ở bất kỳ section nào, modal hiện
   bước đăng nhập.
2. Nhập sai mật khẩu ba lần liên tiếp, mỗi lần đều bị từ chối và phản hồi chậm rõ rệt.
3. Nhập `bateco`/`123`, vào được form.
4. Đóng modal, mở lại từ section khác, vào thẳng form không hỏi lại mật khẩu.

**Kết quả thi đấu**

5. Từ `#ket-qua`, thêm một kết quả có HCV cho Tiên Phong, HCB cho Bứt Phá.
6. Bảng kết quả hiện dòng mới ngay; bảng tổng sắp huy chương đổi tương ứng.
7. Sửa kết quả đó đổi HCV sang Chinh Phục, bảng tổng sắp cập nhật lại đúng.
8. Xóa kết quả, bảng tổng sắp về 0 huy chương.

**Bảng đấu**

9. Từ `#bang-dau` tab Kéo co, thêm 2 dòng và lưu, tab hiện đúng 2 dòng.
10. Đổi sang tab Điền kinh, nhãn cột khác đúng như thiết kế; thêm 1 dòng và lưu.
11. Tải lại trang, cả hai môn giữ nguyên dữ liệu.

**Bảng tổng sắp huy chương**

12. Nút ở `#huy-chuong` mở đúng form kết quả kèm dòng giải thích huy chương được
    cộng tự động.
13. Dòng trạng thái bên cạnh nút vẫn hiển thị bình thường.

**Bảo mật**

14. `POST /api/admin/results` không cookie trả 401.
15. `POST /api/admin/draws` không cookie trả 403.
16. `GET /admin` trả 404.
17. Xem source `app.js` và `entry.js` trong devtools, **không** tìm thấy chuỗi `123`.

**Đa thiết bị**

18. Mở trang trên điện thoại cùng mạng LAN qua `http://<IP-máy>:8787`, xác nhận đăng
    nhập được. Đây là bài kiểm tra cho quyết định chỉ đặt `Secure` khi chạy HTTPS.
    Cần khởi động `wrangler dev` với `--ip 0.0.0.0` để truy cập được từ máy khác.

### 3. Ghi tài liệu

Tạo hoặc cập nhật `README.md` với đúng ba mục, ngắn gọn:

- **Chạy local:** `pnpm install`, tạo `.dev.vars`, `pnpm exec wrangler d1 migrations
  apply DB --local`, `pnpm dev`.
- **Biến môi trường:** `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET` — nói rõ
  `.dev.vars` chỉ dành cho local và không bao giờ commit.
- **Deploy:** `node scripts/build.mjs` rồi đặt secret production.

Không chép giá trị mật khẩu vào README.

### 4. Đặt secret cho production

```bash
pnpm exec wrangler secret put ADMIN_USER
pnpm exec wrangler secret put ADMIN_PASS
pnpm exec wrangler secret put SESSION_SECRET   # dùng: openssl rand -hex 32
```

**Cần người dùng quyết định:** `ADMIN_PASS` trên production giữ `123` hay đặt giá trị
mạnh hơn.

Khuyến nghị đặt mạnh hơn. Lý do: `123` chỉ mất vài phút để dò kể cả khi đã có delay
500ms mỗi lần sai, mà trang này sẽ được chia sẻ trong toàn công ty. Vì đây là secret
nên đổi bất cứ lúc nào cũng được, **không cần sửa code, không cần đổi kế hoạch, chỉ
cần chạy lại một lệnh**. Local vẫn giữ `bateco`/`123` đúng như yêu cầu ban đầu, nên
trải nghiệm phát triển không đổi.

Nếu người dùng chọn giữ `123` thì vẫn chạy đủ ba lệnh trên để `SESSION_SECRET` là
giá trị ngẫu nhiên thật chứ không phải giá trị trong `.dev.vars`.

### 5. Commit

Chia thành các commit theo Conventional Commits, mỗi commit một thay đổi logic:

```
feat(auth): thay xac thuc header OpenAI bang dang nhap user/password co cookie ky HMAC
feat(ui): gop nhap ket qua vao modal tren trang chinh va xoa trang admin rieng
feat(draws): them bang draws va form nhap bang dau theo tung mon
test: bo sung kiem thu dang nhap va bang dau
docs: huong dan chay local va dat secret production
```

Kiểm tra `git log -1 --format='%an <%ae>'` trả về `caothehiep2003@gmail.com`.
Xác nhận `.dev.vars` không nằm trong bất kỳ commit nào.

## Verification

```bash
node scripts/build.mjs && pnpm test
git status --short                 # sach, khong co .dev.vars
git log --oneline
grep -rn "123" dist/app.js dist/entry.js || echo "OK: khong co mat khau trong bundle client"
```

## Success Criteria

- [ ] `node scripts/build.mjs` và `pnpm test` đều xanh
- [ ] Cả 18 mục kiểm thử tay ở bước 2 đều đạt
- [ ] Không có mật khẩu trong bất kỳ file nào thuộc `dist/`
- [ ] `.dev.vars` không bị commit
- [ ] `README.md` mô tả đủ cách chạy local, biến môi trường và cách deploy
- [ ] Secret production đã đặt, và quyết định về `ADMIN_PASS` đã được người dùng chốt
- [ ] Commit dùng Conventional Commits với đúng email `caothehiep2003@gmail.com`
