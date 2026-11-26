# Kết quả Kiểm tra & Đánh giá Chất lượng ShopFit Studio

## 1. Bảng Tổng hợp Kiểm tra Tự động (Cập nhật mới nhất)

| Hạng mục kiểm tra | Lệnh thực thi | Kết quả |
| --- | --- | --- |
| **TypeScript Strict (Mobile/Web)** | `npm.cmd --prefix mobile run typecheck` | **Qua (0 lỗi)** |
| **ESLint React 19 & Expo SDK 57** | `npm.cmd --prefix mobile run lint` | **Qua (0 lỗi, 0 cảnh báo)** |
| **Đồng bộ Dependency Expo SDK 57** | `cd mobile; npx.cmd expo install --check` | **Khớp 100% chuẩn SDK 57** |
| **Kiểm thử Backend API & Nghiệp vụ** | `pytest backend/tests -q` | **62 passed, 0 failed** (5 live Gemini tests skipped khi không bật cờ trả phí) |
| **Đóng gói Web SPA Production** | `npx.cmd expo export --platform web` | **Thành công**, triển khai trực tiếp trên Vercel |
| **Đóng gói Android Native APK** | `powershell -File scripts/build-android.ps1` | **Thành công**, xuất `artifacts/ShopFit-preview.apk` (Hermes + SDK 57 + Test AdMob) |
| **CI/CD Tự động** | `.github/workflows/ci.yml` | **Kích hoạt** trên GitHub Actions cho cả Backend (Python 3.12) & Mobile (Node 22) |

---

## 2. Các Luồng Nghiệp vụ & Bảo mật Đã Kiểm chứng Tự động (`62 tests`)

1. **Xác thực, Phân quyền & Quyền riêng tư:**
   - Đăng ký, đăng nhập (`chushop` và khách hàng), thu hồi phiên đăng xuất, đổi mật khẩu bền vững qua các lần khởi động lại server, đặt lại mật khẩu bằng OTP.
   - Xóa tài khoản vĩnh viễn (`DELETE /api/auth/me`) an toàn khóa ngoại: xóa dữ liệu cá nhân/ảnh thử đồ/hồ sơ cơ thể và ẩn danh hóa lịch sử đơn hàng cũ mà không làm hỏng sổ kế toán của shop.
2. **Thương mại Điện tử, VIP Loyalty & Thanh toán VietQR:**
   - Tính giá phía server, kiểm tra tồn kho nguyên tử theo biến thể màu/size, hoàn kho đúng 1 lần khi hủy đơn, chống đặt trùng đơn bằng `X-Idempotency-Key`.
   - Hạng thành viên VIP (`Đồng / Bạc / Vàng / Kim Cương`) chỉ nâng cấp trên đơn `completed` (chống trục lợi tạo đơn COD ảo để lấy giảm giá); hoàn lại mã giảm giá (`Voucher`) khi đơn bị hủy.
   - Bảo mật thanh toán **SePay VietQR** cho cả **Nạp lượt AI (`FITxxxxxx`)** và **Đơn hàng TMĐT (`SFxxxxxx`)**: khách bấm báo đã chuyển khoản chỉ chuyển trạng thái `verifying`; Webhook xác thực `Authorization: Apikey`, lọc `transferType=in`, kiểm tra số tài khoản nhận và đủ số tiền, chống xử lý trùng theo `sepay_id` (`sepay_webhooks`) và trả chuẩn `{"success": true}` để tự động cộng lượt / xác nhận đơn hàng.
3. **Tư vấn Size Deterministic & Tủ đồ Tham chiếu:**
   - Kiểm tra phạm vi số đo hợp lệ, tính độ dư (`ease`) theo phom và chất liệu, sinh `FitMap` 3 vùng (`Ngực · Eo · Mông`), cảnh báo vùng bị chật (`too_tight`), đối chiếu với trang phục tham chiếu trong tủ đồ cá nhân.
   - Bảo toàn ảnh mặt sau (`back_image_url`) và ảnh cận chất vải (`detail_image_url`) khi cập nhật bảng thông số size hoặc chỉnh sửa toàn diện sản phẩm.
4. **Phòng thử đồ ảo AI 4 góc & AI Retail Analytics:**
   - Luồng kiểm tra ảnh đầu vào (`/api/photo-check`), tạo bất đồng bộ 4 góc nhìn (`front, left, back, right`), lưu bản chụp số đo độc lập cho từng lượt thử, thử lại góc lỗi (`retry` giới hạn 2 lần), kiểm soát hạn mức ngân sách UTC.
   - Tính chính xác tỷ lệ chuyển đổi `Try-to-Buy` theo số khách hàng duy nhất (`<= 100%`).
5. **Phản hồi Size Xác thực & Ẩn danh Danh tính:**
   - Chỉ cho phép đánh giá sản phẩm thuộc đơn `completed` của chính tài khoản đó; mặc định giữ kín ghi chú riêng tư cho shop, và khi khách bật `share_public=true` sẽ tự động che tên (`Nguyễn Minh Anh` → `N*** A***`) trên trang chi tiết sản phẩm.

---

## 3. Giới hạn Kỹ thuật Minh bạch

- **Mô phỏng thị giác AI:** Hình ảnh từ Gemini / OpenVTO giúp hình dung phong cách và phối màu trên dáng người, không thay thế phép mô phỏng vật lý độ căng sợi vải 3D; ứng dụng luôn hiển thị thông điệp lưu ý rõ ràng và kết hợp cùng `FitMap` số đo thực tế.
- **Kiến trúc Worker:** Phù hợp quy mô cửa hàng vừa và nhỏ với 1 tiến trình xử lý nền trên Render kết hợp cơ sở dữ liệu đám mây Supabase PostgreSQL và lưu trữ S3; khi mở rộng quy mô lớn cần tách hàng đợi phân tán độc lập (Redis / Celery).
- **Quảng cáo AdMob:** Chỉ bật mã đơn vị quảng cáo thử nghiệm chính thức của Google (`TestIds.ADAPTIVE_BANNER`) trên bản build Android APK phục vụ kiểm tra học phần theo đúng chính sách của Google AdMob.
