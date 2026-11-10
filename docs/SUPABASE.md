# Database Supabase

Project: **shopfit**, Singapore (`ap-southeast-1`), ref `lbmvnirtvjjpmsdrapff`.

[Dashboard](https://supabase.com/dashboard/project/lbmvnirtvjjpmsdrapff) · [Table Editor](https://supabase.com/dashboard/project/lbmvnirtvjjpmsdrapff/editor).

FastAPI kết nối PostgreSQL qua Supabase Session pooler với SSL. Tài khoản, phiên đăng nhập, sản phẩm, đơn hàng, số đo và hàng đợi AI nằm trong database này. Backend tiếp tục quản lý đăng nhập và phân quyền; mobile chỉ gọi FastAPI.

## Cấu hình máy khác

Trong dashboard chọn **Connect → Session pooler**, sao chép URI và thay mật khẩu database. Điền vào `backend/.env`:

```dotenv
DATABASE_URL=postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
```

Sao chép đúng hostname từ dashboard, không suy ra từ region. Mật khẩu có ký tự đặc biệt phải URL-encode. Không đưa URI có mật khẩu vào Git, chat hoặc biến `EXPO_PUBLIC_*`. Không cần Supabase service-role key trong app.

Khi `DATABASE_URL` để trống, backend dùng SQLite cục bộ. Nếu đã đặt URL mà kết nối lỗi, backend báo lỗi, không tự chuyển về SQLite. Kiểm tra backend đang dùng database nào:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

Kết quả phải có `database: postgresql`.

## Migration schema

Từ thư mục gốc, sau khi đăng nhập Supabase CLI:

```powershell
npx.cmd --yes supabase link --project-ref lbmvnirtvjjpmsdrapff
npx.cmd --yes supabase db push --remote --dry-run
npx.cmd --yes supabase db push --remote
```

CLI có thể hỏi mật khẩu database. Bản CLI dùng khi thiết lập này mặc định nhắm database local, vì vậy phải chỉ định `--remote` khi push Supabase. Schema được quản lý trong `supabase/migrations/`; backend cũng có thể khởi tạo schema mới từ migration đầu tiên.

Các bảng bật RLS và thu hồi quyền trực tiếp của `anon`/`authenticated`. Chưa có policy cho mobile truy vấn trực tiếp. Backend dùng kết nối PostgreSQL có quyền quản lý dữ liệu và kiểm tra người dùng tại API.

## Chuyển database SQLite cũ

Chỉ chạy vào database đích rỗng, trước khi khởi động backend với Supabase:

1. Dừng backend để không có ghi mới hoặc tác vụ AI đang chạy.
2. Đặt `DATABASE_URL` trong `backend/.env`.
3. Từ thư mục gốc:

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m app.migrate --source data/shopfit.sqlite3
Set-Location ..
npm.cmd run api
```

Công cụ tạo snapshot SQLite trong `backend/data/backups/`, giữ file nguồn, rồi sao chép 14 bảng trong một transaction. Từng giá trị được đối chiếu sau copy, giữ nguyên ID, mật khẩu đã băm và hash phiên đăng nhập; sequence của `order_items` được cập nhật. Có lỗi thì rollback. Đích đã có dữ liệu sẽ bị từ chối, không ghi đè hay nhân đôi bản ghi.

Ảnh sản phẩm và ảnh người dùng vẫn ở `backend/data/catalog/` và `backend/data/private/`. Sao lưu thư mục này riêng; chuyển database không đồng nghĩa chuyển ảnh sang Supabase Storage hoặc triển khai FastAPI lên cloud. Chỉ chạy một backend cho cùng database và bộ ảnh hiện tại vì worker chưa có cơ chế lease phân tán.

## Kiểm thử

```powershell
npm.cmd run test:api
```

Các test thường ép dùng SQLite tạm, kể cả khi `.env` trỏ Supabase. Để kiểm tra PostgreSQL thật, đặt `TEST_DATABASE_URL` trong môi trường shell rồi chạy từ `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_database.py -q
```

Các test PostgreSQL tạo schema `shopfit_test_<random>` riêng rồi xóa schema do chính test tạo; không sửa bảng `public`. Test kiểm tra rollback, quyền truy cập, đặt hàng đồng thời có cùng mã yêu cầu, hoàn kho, upsert, ngân sách AI đồng thời và migration SQLite. Không gọi Gemini.

Tham khảo: [kết nối PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [region Singapore](https://supabase.com/docs/guides/platform/regions).
