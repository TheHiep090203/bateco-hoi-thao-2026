# HỘI THAO BATECO 2026

Website thông tin và bảng điểm trực tiếp cho ngày hội thao 18/09/2026.

Toàn bộ dự án đóng gói thành **một Cloudflare Worker duy nhất**: `scripts/build.mjs`
nhúng mọi file trong `dist/` cùng `server/domain.mjs` vào `dist/server/index.js`, file
này vừa phục vụ trang web vừa phục vụ API. Dữ liệu lưu ở Cloudflare D1.

> `dist/` là mã nguồn viết tay, **không phải** thư mục kết quả biên dịch. Chỉ
> `dist/server/` và `dist/.openai/` mới là thứ được sinh ra tự động.

## Chạy ở máy local

```bash
pnpm install
cp .dev.vars.example .dev.vars   # rồi điền giá trị, xem mục dưới
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev                          # http://127.0.0.1:8787
```

Thêm `--ip 0.0.0.0` vào `wrangler dev` nếu muốn mở từ điện thoại trong cùng mạng LAN.

```bash
pnpm test    # tự dựng lại bundle trước rồi chạy toàn bộ kiểm thử
```

## Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `ADMIN_USER` | Tài khoản đăng nhập để nhập kết quả |
| `ADMIN_PASS` | Mật khẩu đăng nhập |
| `SESSION_SECRET` | Khóa ký cookie phiên. Sinh bằng `openssl rand -hex 32` |

Ở local, ba biến này đặt trong `.dev.vars`. **File này không bao giờ được commit** —
nó đã nằm trong `.gitignore`.

Thiếu `SESSION_SECRET` thì không cookie nào xác minh được, nên hệ thống từ chối mọi
thao tác ghi thay vì cho qua.

## Nhập kết quả

Không có trang quản trị riêng. Trên trang chính, mỗi mục **Bảng đấu**, **Bảng tổng sắp
huy chương** và **Kết quả thi đấu** đều có nút *Nhập kết quả* ở bên phải tiêu đề. Bấm
nút sẽ mở hộp thoại yêu cầu đăng nhập, sau đó hiện form tương ứng với mục đó. Phiên
đăng nhập kéo dài 8 giờ.

Bảng tổng sắp huy chương **không nhập trực tiếp**: số HCV/HCB/HCĐ được cộng tự động từ
liên minh đã chọn trong từng kết quả thi đấu.

## Đưa lên production

```bash
node scripts/build.mjs
pnpm exec wrangler secret put ADMIN_USER
pnpm exec wrangler secret put ADMIN_PASS
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler d1 migrations apply DB --remote
pnpm exec wrangler deploy
```

Đặt secret trên production bằng `wrangler secret put`, không đưa giá trị thật vào mã
nguồn hay tài liệu. Đổi mật khẩu sau này chỉ cần chạy lại `wrangler secret put
ADMIN_PASS`, không phải sửa code hay triển khai lại.
