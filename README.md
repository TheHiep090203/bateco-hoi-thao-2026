# HỘI THAO BATECO 2026

Website thông tin và bảng điểm trực tiếp cho ngày hội thao 18/09/2026.
Triển khai trên **Vercel** với cơ sở dữ liệu **Turso (libSQL)**.

| Thành phần | Vai trò |
|---|---|
| `dist/` | Mã nguồn viết tay của giao diện (HTML, CSS, JS) |
| `public/` | Do `scripts/build.mjs` sinh ra từ `dist/`, Vercel phục vụ qua CDN |
| `api/index.mjs` | Vercel Function, nhận mọi request `/api/*` qua rewrite |
| `server/worker.mjs` | Toàn bộ định tuyến và nghiệp vụ API |
| `server/db-libsql.mjs` | Adapter trình bày libSQL theo hình dạng API của D1 |
| `drizzle/` | Migration SQL, chạy bằng `scripts/migrate.mjs` |

> `dist/` là mã nguồn, **không phải** thư mục kết quả biên dịch. `public/` mới là
> thứ sinh ra tự động và đã nằm trong `.gitignore`.

## Chạy ở máy local

```bash
pnpm install
cp .env.example .env.local           # rồi điền giá trị, xem mục dưới
TURSO_DATABASE_URL=file:local.db pnpm db:local   # tạo bảng trong file SQLite local
pnpm dev                              # http://127.0.0.1:8787
```

`pnpm dev` chạy một máy chủ Node nhỏ (`scripts/dev.mjs`) mô phỏng đúng cách Vercel
phục vụ: file tĩnh lấy từ `public/`, còn `/api/*` giao cho `server/worker.mjs`.
Nhờ vậy không cần đăng nhập Vercel CLI và kiểm thử tự động chạy được ở mọi nơi.
Muốn chạy đúng runtime của Vercel thì dùng `pnpm dev:vercel` (cần `vercel` CLI).

```bash
pnpm test        # 11 kiểm thử nghiệp vụ, không cần trình duyệt
pnpm test:e2e    # 8 kiểm thử giao diện bằng Playwright, tự khởi động dev server
```

## Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `ADMIN_USER` | Tài khoản đăng nhập để nhập kết quả |
| `ADMIN_PASS` | Mật khẩu đăng nhập |
| `SESSION_SECRET` | Khóa ký cookie phiên. Sinh bằng `openssl rand -hex 32` |
| `TURSO_DATABASE_URL` | `file:local.db` khi chạy local, URL `libsql://…` khi lên production |
| `TURSO_AUTH_TOKEN` | Token của Turso, để trống khi dùng file local |

Local đặt trong `.env.local`. **File này không bao giờ được commit** — `.gitignore`
đã chặn toàn bộ `.env.*` trừ `.env.example`.

Thiếu `SESSION_SECRET` thì không cookie nào xác minh được, nên hệ thống từ chối mọi
thao tác ghi thay vì cho qua. Thiếu bất kỳ biến đăng nhập nào thì `/api/admin/login`
trả 503 kèm tên biến vào log, chứ không báo nhầm là sai mật khẩu.

## Nhập liệu

Không có trang quản trị riêng. Trên trang chính, năm mục dưới đây đều có nút nhập liệu ở
bên phải tiêu đề. Bấm nút sẽ mở hộp thoại yêu cầu đăng nhập, sau đó hiện form tương ứng.
Phiên kéo dài 8 giờ.

| Mục | Nút | Nội dung nhập |
|---|---|---|
| Bảng đấu | *Nhập bảng đấu* | Bảng đấu của Kéo co, Điền kinh, AOE, Bóng đá |
| Bảng đấu, tab Pickleball | *Nhập vòng bảng* | Tỉ số 20 trận vòng bảng, Nhất/Nhì mỗi bảng, 4 trận chung kết |
| Lịch trình | *Nhập lịch trình* | Các mốc giờ trong ngày hội thao |
| Luật thi đấu | *Nhập luật thi đấu* | Toàn văn luật từng môn |
| Bảng tổng sắp huy chương | *Nhập huy chương* | Tổng HCV/HCB/HCĐ từng liên minh |
| Kết quả thi đấu | *Nhập kết quả* | Kết quả từng trận, từng phần thi |

Mục Bảng đấu mang hai nút nhưng chỉ hiện một nút mỗi lúc, theo tab đang chọn: bốn môn
dùng bảng thì hiện *Nhập bảng đấu*, riêng Pickleball dùng vòng bảng nên hiện *Nhập vòng bảng*.

Lịch trình và Luật thi đấu giữ sẵn nội dung mặc định ngay trong `dist/app.js`; nội dung
admin nhập chỉ phủ lên trên. Mỗi form có nút *Khôi phục mặc định* để gỡ hẳn phần đã nhập.
Định dạng lịch trình: mỗi dòng một mục dạng `giờ | hoạt động`, thêm `| nhãn` ở cuối nếu
muốn gắn nhãn cho mục đó.

Bảng tổng sắp huy chương nhập **tổng** HCV/HCB/HCĐ của từng liên minh, không suy ra từ
kết quả thi đấu. Xếp hạng theo tổng số huy chương; bằng tổng thì xét HCV, rồi HCB, rồi HCĐ.

## Đưa lên production

### 1. Tạo database trên Turso

```bash
curl -sSfL https://get.tur.so/install.sh | bash    # cài Turso CLI
turso auth signup
turso db create bateco-hoi-thao --location aws-ap-northeast-1
turso db show bateco-hoi-thao --url                # -> TURSO_DATABASE_URL
turso db tokens create bateco-hoi-thao             # -> TURSO_AUTH_TOKEN
```

Hoặc dùng tích hợp **Turso Cloud** trong Vercel Marketplace, khi đó hai biến trên
được Vercel tự đặt vào project.

### 2. Tạo bảng trên database production

```bash
TURSO_DATABASE_URL='libsql://...' TURSO_AUTH_TOKEN='...' pnpm db:local
```

Script chạy lần lượt các file trong `drizzle/` và ghi lại vào bảng `_migrations`,
nên chạy lại nhiều lần vẫn an toàn.

### 3. Đặt biến môi trường trên Vercel

```bash
vercel link
vercel env add ADMIN_USER production
vercel env add ADMIN_PASS production
vercel env add SESSION_SECRET production     # openssl rand -hex 32
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
```

Không đưa giá trị thật vào mã nguồn hay tài liệu. Đổi mật khẩu sau này chỉ cần đặt
lại `ADMIN_PASS` rồi deploy lại, không phải sửa code.

### 4. Deploy

```bash
vercel --prod
```

`vercel.json` đã khai báo sẵn `buildCommand`, `outputDirectory`, header bảo mật cho file
tĩnh (CSP, `X-Content-Type-Options`, `Referrer-Policy`), và `regions: ["hnd1"]` để function
chạy ở Tokyo cùng vùng với database. Function dùng runtime Node.js — runtime Edge của
Vercel đã ngừng hỗ trợ.

### Vì sao cần rewrite trong `vercel.json`

Catch-all `api/[...path].mjs` của Vercel chỉ khớp **một** segment, nên `/api/admin/login`
không bao giờ tới được function (platform trả 404 trước). Vì vậy `vercel.json` rewrite mọi
`/api/*` về `api/index.mjs` kèm `?__path=` chứa đường dẫn gốc, và `api/index.mjs` dựng lại
URL từ đó trước khi giao cho worker. Đừng bỏ rewrite này.

### Triển khai hiện tại

- URL: https://bateco-hoi-thao-2026.vercel.app
- Database Turso: `bateco-hoi-thao` (Tokyo)
- Function region: `hnd1` (Tokyo)
