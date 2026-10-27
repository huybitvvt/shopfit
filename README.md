# ShopFit

Ứng dụng React Native + TypeScript cho một shop thời trang, tích hợp **OpenVTO → Gemini** để thử trang phục trên ảnh khách hàng.

Phạm vi hiện tại: chạy bản web phát triển tại **http://localhost:8081**, API tại **http://localhost:8000**. Chưa cần cài Android; các hướng dẫn APK bên dưới dành cho giai đoạn sau. Dữ liệu sản phẩm thật sẽ do chủ shop bổ sung, dữ liệu mẫu vẫn gắn nhãn minh họa.

## Phần đã triển khai

- Danh mục, tìm kiếm, lọc theo loại, sắp xếp theo giá, chi tiết sản phẩm, màu/size và yêu thích.
- Đăng ký/đăng nhập; hai vai trò khách hàng và chủ shop. Token lưu bằng SecureStore trên Android/iOS, bộ nhớ trình duyệt trên bản web phát triển.
- Giỏ hàng lưu cục bộ; đặt hàng COD; giá do server tính lại; tồn kho theo màu/size cập nhật trong transaction.
- Khách hủy đơn chờ xác nhận; shop xác nhận, giao hàng và hoàn tất. Hủy đơn hoàn kho đúng một lần.
- Shop thêm sản phẩm với ảnh tải lên, sửa giá/tên/tồn kho, ẩn/hiện sản phẩm; thống kê từ dữ liệu thật.
- Hồ sơ chiều cao/cân nặng/các vòng đo; bảng số đo thành phẩm riêng từng sản phẩm, shop xác nhận dữ liệu đã đo; tư vấn size có giải thích độ dư vải và xét tồn kho.
- Bản đồ độ vừa theo ngực/eo/mông; lưu, sửa và xóa số đo món đồ đang mặc vừa để so sánh từng size với sản phẩm shop.
- Phản hồi chật/vừa/rộng gắn sản phẩm trong đơn đã giao; shop xem số mẫu theo size và cờ cần kiểm tra số đo, không tự sửa bảng đo.
- Phòng thử: chọn trang phục/màu/size → kiểm tra ảnh toàn thân → OpenVTO/Gemini tạo **4 ảnh trước–trái–sau–phải** → chuyển ảnh bằng **mũi tên**, so sánh trước/sau và lưu lịch sử.
- Các góc bên/sau lấy ảnh đã thử làm tham chiếu, được AI kiểm tra trang phục/hướng quay; góc lỗi không hiển thị như kết quả thành công. Tạo lại chỉ gọi các góc thiếu, tối đa 2 lần/lượt trong ngày.
- Đối chiếu với ảnh mặc thật, chấm ba tiêu chí và ghi nhận cảm nhận chật/vừa/rộng. Ảnh đối chứng cũng lưu riêng theo tài khoản.
- Khóa Gemini chỉ nằm ở backend. Ảnh người dùng không đặt trong thư mục public; liên kết ảnh được ký và hết hạn sau 1 giờ.
- Chống gửi trùng lượt thử/đặt hàng/tạo lại khi mất phản hồi; hàng đợi SQLite, tiếp tục phần việc an toàn sau restart, giữ ảnh ứng viên để chỉ kiểm tra lại khi lỗi vision. Trần số lời gọi và ngân sách dự trù AI theo ngày UTC.

**Đã kiểm thử bộ bốn ảnh Gemini thực tế** qua OpenVTO: lần kiểm tra sau khi sửa tham chiếu hoàn tất trong 49,9 giây, giữ cùng áo thun ở bốn góc. Dùng avatar tổng hợp của OpenVTO và số đo minh họa, chưa chứng minh độ vừa khi mặc thật. Không tạo video hay mô hình 3D.

## Cấu trúc

```text
mobile/                  Expo / React Native / TypeScript; giao diện tự xây
  src/app/               Expo Router: catalog, phòng thử, hồ sơ, đối chiếu, giỏ, đơn, quản trị
  src/                   API client, state, kiểu dữ liệu, thành phần giao diện
backend/
  app/                   FastAPI, SQLite, tài khoản, bán hàng, xử lý tác vụ
  vendor/openvto/        SDK OpenVTO upstream, MIT, kèm giấy phép và commit nguồn
  tests/                 Kiểm thử API và hợp đồng tích hợp OpenVTO
  data/                  SQLite và ảnh runtime; không đưa vào Git
design-system/           Hệ thống thiết kế
docs/                    Kiến trúc và nguồn tham khảo
```

## Chạy trên Windows PowerShell

Yêu cầu: Node.js LTS, Python 3.10+.

### 1. Cài thư viện

Từ `E:\ckimobile`:

```powershell
npm.cmd --prefix mobile install
python -m venv backend/.venv
Set-Location backend
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
Set-Location ..
```

Nếu môi trường hiện tại đã được dựng sẵn thì bỏ qua bước cài.

### 2. Cấu hình

Tạo `backend/.env` từ `backend/.env.example`, điền:

```dotenv
GEMINI_API_KEY=your-api-key
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
GEMINI_VISION_MODEL=gemini-2.5-flash
```

Dùng model có khả năng **sinh/chỉnh sửa ảnh**, không dùng model chỉ trả văn bản. Kiểm tra model đang mở cho tài khoản theo tài liệu Google và đổi `GEMINI_IMAGE_MODEL` nếu cần. Khởi động lại API sau khi sửa `.env`.

Không đưa API key vào mã nguồn, chat, `EXPO_PUBLIC_*` hoặc app đã build.

`mobile/.env`:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8000
```

| Chạy app ở đâu | URL backend |
| --- | --- |
| Web trên máy này / iOS simulator | `http://localhost:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| Điện thoại thật, cùng Wi-Fi | `http://<IPv4-LAN-của-máy>:8000` |

Đổi URL xong cần khởi động lại Expo. Bản web dùng CORS theo `CORS_ORIGINS` trong backend `.env`; bổ sung đúng origin nếu đổi port/hostname. Trên điện thoại thật, cho phép Python qua Windows Firewall trong mạng riêng nếu kết nối bị chặn.

### 3. Chạy hai terminal

Terminal 1, tại thư mục gốc:

```powershell
npm.cmd run api
```

Terminal 2:

```powershell
npm.cmd start
```

Quét QR bằng Expo Go tương thích **SDK 57**, hoặc nhấn `a` với Android emulator. Bản xem trước trình duyệt:

```powershell
npm.cmd run web
```

API docs: <http://localhost:8000/docs>. Health check: <http://localhost:8000/api/health>.

Bản Android: xem [docs/ANDROID.md](docs/ANDROID.md) để build/cài APK. Có thể đổi URL backend ngay trong app tại **Cá nhân → Kết nối shop**, không cần build lại. Phạm vi và kịch bản bảo vệ: [docs/PRODUCT.md](docs/PRODUCT.md).

### Tài khoản phát triển

| Vai trò | Email | Mật khẩu mặc định |
| --- | --- | --- |
| Khách hàng | `khach@shopfit.local` | `Shopfit123!` |
| Chủ shop | `shop@shopfit.local` | `ShopfitAdmin123!` |

Các nút đăng nhập nhanh chỉ xuất hiện khi backend bật `SEED_DEMO=true`. Nếu đổi mật khẩu seed trước lần chạy đầu, dùng form đăng nhập với mật khẩu mới. Seed không ghi đè mật khẩu tài khoản đã tồn tại. Không triển khai công khai với tài khoản mẫu: tắt seed và thay/xóa các tài khoản mẫu đã có.

## Kiểm tra

Từ thư mục gốc:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:api
npm.cmd run test:e2e
```

Kiểm thử UI dùng Chromium/Edge headless, khởi động API và Expo nếu chưa chạy. Nếu máy không có Edge, cài browser cho Playwright bằng `npx.cmd --prefix mobile playwright install chromium` hoặc chạy `npx.cmd playwright install chromium` trong `mobile`.

Kiểm thử API dùng SQLite tạm và ảnh do test tạo. Lời gọi Google được thay thế tại ranh giới dịch vụ; **không tiêu tốn Gemini API**. Kiểm thử UI đăng ký một tài khoản test, tạo rồi hủy một đơn; nếu chạy với API đang mở thì các bản ghi test đó vẫn lưu trong database phát triển.

Kiểm tra bundle Android, không cần Android SDK:

```powershell
npm.cmd --prefix mobile run export:android
```

Đây là kiểm tra bundle JavaScript; chưa thay thế việc build APK và kiểm tra trên thiết bị Android/iOS thật.

## Dữ liệu và giới hạn hiện tại

- SQLite và ảnh nằm trong `backend/data/`. Sao lưu cả thư mục khi cần giữ dữ liệu.
- Ảnh sản phẩm mẫu lấy từ Unsplash, đóng gói cục bộ trong `backend/assets/` để demo không phụ thuộc mạng ảnh bên ngoài; một số biến thể dùng chung ảnh minh họa. Khi demo chất lượng AI, tải ảnh sản phẩm riêng, chính diện, đúng màu và rõ họa tiết qua tài khoản shop.
- Worker chạy trong một tiến trình API, tối đa 2 lượt đồng thời; hàng đợi/trạng thái lưu SQLite. Restart tiếp tục phần chưa gọi và kiểm tra ảnh ứng viên đã lưu. Góc gián đoạn khi gọi tạo ảnh cần người dùng chủ động tạo lại, không tự lặp yêu cầu chưa rõ đã tính phí hay chưa.
- Tối đa 2 lượt đang xử lý cho một tài khoản; mặc định 30 lượt/ngày tính theo UTC. Xóa ảnh không đặt lại hạn mức.
- Một lượt đầy đủ gồm 4 lần tạo ảnh, một lần kiểm tra đầu vào (cache 15 phút theo tài khoản + nội dung ảnh) và 4 lần kiểm tra kết quả, gồm cả mặt trước. Retry tính thêm một lượt trong hạn mức ngày. `AI_IMAGE_DAILY_LIMIT`, `AI_VISION_DAILY_LIMIT` và `AI_DAILY_BUDGET_USD` giới hạn request/dự trù, không thay thế hóa đơn hoặc hạn mức đặt ở Google.
- Xóa lượt thử xóa ảnh gốc, cả bốn ảnh kết quả, ảnh mặc thật và bản lưu số đo của lượt đó; giữ bản ghi tối thiểu phục vụ hạn mức. Xóa hồ sơ cơ thể riêng không xóa các lượt thử cũ.
- Bảng số đo seed là **minh họa/chưa xác nhận**. Nhập số đo thật qua Quản trị → Bảng số đo & ảnh sau trước khi dùng để kết luận size. Tư vấn chỉ so sánh vòng cơ thể với vòng thành phẩm và độ dư do shop cấu hình, không mô phỏng vải hay suy số đo từ chiều cao/cân nặng.
- Ảnh AI là xem trước phong cách. Mặt khuất còn do AI suy diễn; AI kiểm tra kết quả cũng có thể sai. Chưa có tập ảnh mặc thật để công bố độ chính xác.
- Chưa triển khai public. Trước khi phát hành cần HTTPS, bảo vệ đăng nhập trước dò mật khẩu, phục hồi tài khoản, giới hạn request ở reverse proxy, lưu ảnh trên object storage và worker bền vững.
- `npm audit` hiện báo 8 cảnh báo từ cây dependency Expo SDK 57 (5 high, 3 moderate), gồm công cụ CLI và bộ giải mã URL của router. Đã áp dụng bản vá tương thích bằng `npm audit fix`; không dùng `--force` vì đề xuất đổi major SDK. Cần theo dõi các bản vá upstream trước khi phát hành; không công khai máy chủ Metro phát triển.

Nguồn tham khảo và cách dùng OpenVTO: [docs/REFERENCES.md](docs/REFERENCES.md).

Hướng dẫn demo và đánh giá bốn góc: [docs/FITTING.md](docs/FITTING.md).
