# Quản lý thu chi

Web app quản lý tài chính cá nhân, viết bằng **React + TypeScript + Vite + Tailwind**, backend **Supabase**.

## Demo

Sau khi backend đã có dữ liệu, chạy:

```powershell
.\scripts\serve-web.ps1
```

Mở `http://localhost:8080/` và đăng nhập bằng:

```
Email:    demo@quanlythuchi.local
Password: Demo@2026!
```

## Cấu trúc

```
web/                          # React frontend (Vite + TS + Tailwind)
  src/
    pages/                    # LoginPage, DashboardPage, AccountsPage, ...
    components/               # AppLayout, Modal, Toast, RequireAuth
    lib/                      # supabase.ts, api.ts, auth.tsx, types.ts, ...
supabase/
  migrations/                 # SQL migrations (đã deploy lên remote)
  functions/                  # Edge Functions (Deno)
scripts/
  serve-web.ps1               # Chạy web dev server trên :8080
docs/                         # Tài liệu bổ sung
```

## Yêu cầu

- Node.js 18+ (cho Vite + React)
- Supabase CLI (tùy chọn, cho `supabase db reset`)
- Tài khoản Supabase remote đã setup migrations + demo data

## Chạy lần đầu

Từ thư mục gốc của repo:

```powershell
# 1. Cài dependencies (chỉ cần làm 1 lần)
cd web
npm install

# 2. Chạy dev server
cd ..
.\scripts\serve-web.ps1
```

Hoặc thủ công:

```powershell
cd web
npm install
npm run dev
```

Mở `http://localhost:8080/`.

## Build production

```powershell
cd web
npm run build
npm run preview
```

Output nằm trong `web/dist/`.

## Stack

- **Vite 5** + **React 18** + **TypeScript**
- **Tailwind CSS 3**
- **Supabase JS 2** (auth + Postgres + RPC)
- **recharts** cho biểu đồ
- **react-router-dom 6**

## RPCs sử dụng

App gọi 8 RPC đã deploy trên Supabase:

| RPC | Mục đích |
| --- | --- |
| `create_manual_transaction` | Tạo giao dịch thu/chi |
| `create_transfer` | Chuyển khoản giữa 2 tài khoản |
| `void_transaction` | Hủy giao dịch (không hỗ trợ giao dịch nguồn `bank`) |
| `get_account_balance` | Tính số dư 1 tài khoản |
| `get_net_worth` | Tổng tài sản |
| `get_transactions_summary` | Tổng thu/chi theo khoảng ngày |
| `add_goal_contribution` | Cộng/trừ số tiền vào mục tiêu tiết kiệm |
| `get_budget_progress` | Tiến độ ngân sách trong kỳ |
| `materialize_recurring_rules` | Sinh giao dịch từ các quy tắc định kỳ đến hạn |

## Deploy / Reset DB

```bash
supabase db reset   # chạy tất cả migrations trong supabase/migrations/
```

## Deploy lên production

### Bước 1: Setup Supabase project

1. Tạo project tại [Supabase Dashboard](https://supabase.com/dashboard).
2. Trong SQL Editor chạy `supabase db reset` từ local (hoặc copy nội dung từng file
   trong `supabase/migrations/` và chạy theo thứ tự thời gian).
3. Lấy **Project URL** + **anon public key** từ Settings → API.

### Bước 2: Configure Auth

Trong Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: URL production (ví dụ `https://quan-ly-thu-chi.example.com`).
- **Additional Redirect URLs**: thêm localhost + production URL.
- **Email confirm**: bật nếu muốn xác nhận email trước khi login.

### Bước 3: Cấu hình env

Tạo `web/.env.production` từ `web/.env.example`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
VITE_APP_ENV=production
VITE_LOCALE=vi-VN
VITE_CURRENCY=VND
```

> **Lưu ý**: nếu build production mà thiếu 2 biến trên, app sẽ throw lỗi khi
> load (fail-fast). Đây là behavior mong muốn — tránh vô tình deploy trỏ vào
> project demo.

### Bước 4: Build + Serve

```bash
cd web
npm ci
npm run build      # output: web/dist/
```

Upload `web/dist/` lên bất kỳ static host nào (Vercel, Netlify, Cloudflare Pages,
GitHub Pages, S3 + CloudFront…). Đảm bảo host **redirect mọi request không trỏ
vào file → `/index.html`** (SPA fallback).

## Screens

- **Tổng quan** — tổng tài sản, thu/chi tháng, tài khoản, giao dịch gần đây
- **Giao dịch** — danh sách, lọc theo loại, tạo thu/chi, chuyển khoản, hủy
- **Tài khoản** — CRUD tài khoản (tiền mặt, ngân hàng, ví, thẻ, tiết kiệm)
- **Danh mục** — CRUD danh mục thu/chi
- **Ngân sách** — đặt giới hạn chi tiêu theo tuần/tháng, xem % đã dùng
- **Mục tiêu** — tiết kiệm có mục đích, đóng góp theo thời gian
- **Định kỳ** — quy tắc tự sinh giao dịch (lương, thuê nhà, Netflix…)
- **Báo cáo** — bar chart 6 tháng, pie chart theo danh mục
- **Cài đặt** — sửa tên hiển thị, đăng xuất

Xem thêm tài liệu trong `docs/`.