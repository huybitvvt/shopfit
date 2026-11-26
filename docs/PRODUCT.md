# ShopFit Studio: Phạm vi Sản phẩm & Kịch bản Bảo vệ Đồ án

Định vị: **“Xem mình mặc · Hiểu vì sao vừa · Đối chiếu với thực tế”** dành cho cửa hàng thời trang vừa và nhỏ trên nền tảng di động.

## Ba giá trị cốt lõi tự xây dựng

1. **Bản đồ độ vừa có giải thích (`FitMap` 3 vùng):** Đối chiếu vòng cơ thể người mặc (`Ngực · Eo · Mông`) với thông số thành phẩm từng size và độ dư mục tiêu (`ease`), hiển thị trực quan trên phác họa thời trang (`Atelier Silhouette`) cùng thước đo 5 nấc (`Chật` → `Ôm sát` → `CHUẨN ĐẸP` → `Thoải mái` → `Rộng`). Bất kỳ vùng nào bị âm độ dư đều tự động bật cảnh báo đỏ để tránh chọn nhầm size.
2. **Đối chiếu trực tiếp với đồ đang mặc vừa (`Tủ đồ tham chiếu`):** Khách tự lưu số đo chiếc áo/quần/đầm yêu thích ở nhà theo cách đo phẳng thống nhất để so sánh từng cm chênh lệch mà không bắt buộc phải có thước dây đo cơ thể; hoặc dùng bộ khung vóc dáng chuẩn Nam/Nữ (`S, M, L, XL`) chọn nhanh 1 chạm.
3. **Phản hồi size xác thực từ đơn hàng đã giao (`Verified Fit Feedback`):** Chỉ khách hàng có đơn ở trạng thái `Đã giao` mới được gửi cảm nhận `Chật / Vừa / Rộng`. Mỗi dòng sản phẩm trong đơn tính đúng 1 mẫu thống kê; khách có quyền giữ riêng tư ghi chú cho chủ shop hoặc bật chia sẻ ẩn danh (`N*** A***`) trên trang sản phẩm để hỗ trợ người mua sau.

Dashboard tự động gắn cờ nhắc chủ shop kiểm tra lại phom/bảng đo khi một size có từ `3` phản hồi trở lên và tối thiểu `50%` báo chật hoặc rộng (không tự ý sửa đè số đo gốc của shop).

## Kiến trúc Vận hành AI & Thương mại An toàn

- **Chống tạo trùng (`X-Idempotency-Key`):** Mọi thao tác nhạy cảm (tạo lượt thử AI, thử lại góc lỗi, đặt đơn hàng) đều gắn khóa bất biến theo nội dung và tài khoản, ngăn trừ tồn kho hoặc trừ lượt thử hai lần khi mạng di động chập chờn.
- **Hàng đợi 4 góc nhìn bền vững:** Trạng thái từng góc (`front`, `left`, `back`, `right`) được lưu trên Supabase PostgreSQL (hoặc SQLite khi chạy cục bộ), kết hợp lưu trữ đối tượng S3 giúp không mất ảnh khi máy chủ khởi động lại.
- **Kiểm duyệt hai lớp & Sổ cái ngân sách (`AI Usage Ledger`):** Kiểm tra ảnh đầu vào trước khi sinh ảnh, đối chiếu trang phục ở ảnh đầu ra và ghi nhận ngân sách dự trù theo ngày UTC để tránh vượt trần chi phí API.
- **Thanh toán tự động SePay VietQR & Hạng thành viên minh bạch:** Hỗ trợ song song **COD** và **Chuyển khoản VietQR qua SePay** cho cả đơn hàng TMĐT (`SFxxxxxx`) lẫn nạp lượt thử AI (`FITxxxxxx`). Webhook xác thực `Authorization: Apikey`, chỉ nhận tiền vào (`transferType=in`), chống trùng bằng bảng `sepay_webhooks`, trả chuẩn `{"success": true}` và tự động cập nhật đơn / cộng lượt theo thời gian thực; chủ shop vẫn có nút xác nhận thủ công dự phòng. Chiết khấu hạng VIP (`Đồng · Bạc · Vàng · Kim Cương`) chỉ nâng hạng dựa trên tổng chi tiêu thực tế của các đơn đã hoàn tất.

## Kịch bản Bảo vệ Đồ án (5–7 phút trên Điện thoại / APK + Web)

1. **Trải nghiệm Khách hàng & Tư vấn Size (1.5 phút):**
   - Mở ứng dụng bằng tài khoản `khachhang@shopfit.vn` (`123456`).
   - Chọn sản phẩm **Áo sơ mi Linen** → chạm phóng to toàn màn hình `2x` xem 3 góc ảnh (Trước / Sau / Cận chất vải).
   - Chuyển đổi giữa size `S`, `M`, `L` để hội đồng quan sát **FitMap 3 vùng**, đối chiếu với **Sơ mi công sở đang mặc vừa** và đọc mục **Người đã mua nói gì về size?** (biểu đồ + nhận xét ẩn danh `N*** A***`).
2. **Phòng thử đồ ảo AI & Mua hàng Try-to-Buy thanh toán SePay VietQR (2 phút):**
   - Chuyển sang **Phòng thử AI**, chụp/chọn ảnh toàn thân → hệ thống tự nén ảnh trên máy và kiểm duyệt tư thế.
   - Xem ảnh kết quả thử đồ AI (chế độ 1 góc nhanh trên Production; hỗ trợ mở rộng 4 góc qua cấu hình `TRYON_ANGLES`), bấm so sánh với ảnh gốc, phóng to `2x` và nhấn nút **Thêm ngay Size M vào giỏ** → áp dụng ưu đãi VIP / Voucher, chọn **COD** hoặc **Chuyển khoản VietQR (SePay)** để hiện mã QR động tự động đối soát.
3. **Kiểm chứng Năng lực Di động Ngoại tuyến & AdMob (1 phút):**
   - Trên máy Android cài `ShopFit-preview.apk`: chỉ ra Google Test Adaptive Banner ở cuối trang chủ, sau đó bật **Chế độ máy bay (Airplane Mode)** để chứng minh danh mục, bảng size và giỏ hàng vẫn hoạt động mượt từ bộ nhớ đệm ngoại tuyến kèm thanh thông báo kết nối lại.
4. **Góc nhìn Chủ Shop & Phân tích Chuyển đổi AI (1.5 phút):**
   - Đăng nhập tài khoản `chushop` (`123`) → vào **Quản trị sản phẩm** xem thống kê **AI Retail Analytics (`Try-to-Buy Rate`)**, bộ lọc sắp hết hàng và trình sửa sản phẩm đa màu/size; qua **Đơn hàng** bấm duyệt nhanh 1 chạm `Xác nhận` → `Đang giao` → `Đã giao`.
