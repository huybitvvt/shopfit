# Kết quả kiểm tra ShopFit

## Đã qua

| Kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd run typecheck` | Qua, TypeScript strict |
| `npm.cmd run lint` | Qua, không lỗi/cảnh báo |
| `npm.cmd run test:api` | 40 kiểm thử qua |
| `npm.cmd run test:e2e` | 12 kiểm thử qua trong một lượt chạy, Edge/Chromium headless |
| `npm.cmd --prefix mobile run export:android` | Xuất bundle Hermes Android thành công |
| `npx.cmd expo install --check` trong `mobile` | Dependency native khớp Expo SDK 57 |
| Capture giao diện web | Không có lỗi JavaScript được ghi nhận |
| Capture bốn góc live trên viewport 390×844 | Bốn ảnh từ lịch sử thật, nút mũi tên hoạt động, không có lỗi JavaScript |
| Gemini trực tiếp qua OpenVTO | Một lượt thành công; 12.344 ms, JPEG 896×1200; đã lưu lịch sử |
| Gemini bốn góc + vision đầu ra | Lượt sau khi sửa tham chiếu: 4/4 góc thành công; 49.855 ms, ảnh 900×1200; kiểm tra trực quan áo thun được giữ ở cả bốn góc |
| Pipeline có kiểm tra mặt trước/giày + ledger | Lượt mới nhất 4/4 góc, 58.546 ms; đã xem trực tiếp toàn thân và giày ở cả bốn góc; giữ trong lịch sử khách demo |

## Luồng đã kiểm tra

- Catalog trên màn hình 375×812: tải, tìm kiếm và không tràn ngang.
- Đăng ký tài khoản → chọn size → thêm giỏ → nhập địa chỉ → đặt COD → hủy đơn.
- Phòng thử hiển thị đúng trạng thái chưa cấu hình, không đưa ra ảnh AI giả.
- Chủ shop đăng nhập → mở quản trị → sửa và lưu tồn kho.
- API xác thực, thu hồi phiên, phân quyền chủ shop, cách ly đơn và lịch sử theo khách.
- Tính giá phía server, rollback khi thiếu kho, chuyển trạng thái và hoàn kho đúng một lần.
- Tải ảnh, tạo sản phẩm, sửa tồn kho và ẩn sản phẩm.
- Tác vụ nền thử đồ, URL ảnh có chữ ký, xóa ảnh và giữ hạn mức.
- Lưu/xóa hồ sơ riêng, validate đơn vị/phạm vi; không tư vấn khi chỉ có chiều cao/cân nặng và thiếu vòng đo; lời giải thích độ dư; lọc hết hàng; không đoán size khi không đủ dữ liệu.
- Bảng size chỉ admin sửa; kiểm tra đầy đủ các size/vòng đo bắt buộc trước khi đánh dấu đã đo thực tế.
- Bốn góc có URL riêng; bản chụp size/hồ sơ không bị sửa ngược; lỗi một góc giữ kết quả còn lại, retry đúng góc thiếu, quota và giới hạn hai lần retry.
- Bộ lọc phát hiện sai trang phục không cấp URL như ảnh thành công; ảnh mặc thật và đánh giá cách ly theo tài khoản, xóa cùng lượt thử.
- Migration từ cấu trúc một ảnh sang bốn ảnh giữ dữ liệu/lịch sử cũ.
- Bản đồ độ vừa có ngưỡng/đơn vị và trạng thái chữ; so số đo với đồ mặc vừa riêng theo tài khoản, cả khi chưa có hồ sơ cơ thể.
- Phản hồi theo sản phẩm trong đơn đã giao, chặn khách khác/đơn chưa giao, sửa không tăng số mẫu; cờ kiểm tra không tự sửa bảng size.
- Mã yêu cầu chống tạo trùng lượt thử, tạo lại và checkout, kể cả hai request đồng thời. Xóa job không cho mã cũ tự sinh lại.
- Ngân sách dự trù giữ chỗ nguyên tử; lời gọi lỗi không trả lại dự trù để tránh vượt trần.
- Restart tiếp tục job chưa gọi ảnh và kiểm tra candidate đã có; không lặp lời gọi ảnh gián đoạn chưa rõ kết quả. Lỗi vision chỉ kiểm tra lại, không sinh lại ảnh ứng viên.
- Mặt trước thiếu toàn thân bị loại trước ba lời gọi tạo góc phụ. Kiểm tra cả giày và trang phục không được thay.
- Kết nối backend trên app kiểm tra URL và probe không gửi Authorization sang host mới.
- UI mới: nhập hồ sơ → nhận gợi ý size → áp dụng → chuyển size sang phòng thử; bốn nút/mũi tên quay vòng và trước/sau; tải ảnh, chấm và lưu đối chiếu; upload/kiểm tra ảnh và submit size; shop lưu bảng số đo.
- Pipeline **OpenVTO thật** nhận cả hai ảnh và gọi Google provider đúng model; chỉ phần trả lời mạng Google được thay thế trong test.
- Kiểm tra live riêng: Google chấp nhận khóa, trả metadata model `gemini-3.1-flash-image`; POST một ảnh avatar mẫu OpenVTO và chọn áo thun đen qua API của app. Tác vụ chuyển `processing → completed`, tải được ảnh kết quả và đọc lại bản ghi trong lịch sử. Chỉ yêu cầu một lượt tạo ảnh trả phí.
- Khóa chỉ được lưu trong `backend/.env`, đã xác nhận file bị Git bỏ qua và không có bản sao khóa trong các file có thể đưa vào Git.

Kiểm thử bốn góc live gồm hai lượt có chủ đích, tổng 8 lần tạo ảnh: lượt đầu chạy đủ nhưng kiểm tra trực quan phát hiện hai góc bên quay lại hoodie cũ. Đã sửa để góc bên chỉ tham chiếu người từ ảnh đã thử, bổ sung vision kiểm tra sự nhất quán và chạy lại một bộ đầy đủ. Bộ sau giữ áo thun ở cả bốn góc, tất cả qua vision. Bản thử lỗi đã xóa khỏi lịch sử demo, không sửa ảnh đầu ra để giả kết quả. Dữ liệu/avatar đều là mẫu tổng hợp, không có số đo người thật đối chứng.

Trong lần hoàn thiện sản phẩm, thêm hai lượt live có chủ đích (8 lần tạo ảnh): bộ đầu phát hiện mặt trước cắt chân và giày thay đổi giữa góc dù bộ lọc cũ thông qua. Đã đổi sang prompt riêng giữ toàn thân/giày, kiểm tra cả mặt trước trước khi tạo góc phụ và siết kiểm tra giày. Bộ sau hoàn tất 58,5 giây, giữ áo thun/giày đen/toàn thân qua kiểm tra trực quan. Bộ không đạt đã xóa khỏi lịch sử demo. Không tự retry vô hạn, không sử dụng ảnh AI làm đối chứng mặc thật.

Ảnh chụp trong `artifacts/screenshots/` (không đưa vào Git). Các tài khoản/đơn UI test được tạo trong database phát triển; các đơn tạo trong lượt kiểm tra đã được hủy để hoàn lại tồn kho.

## Chưa kiểm chứng

- Chưa đánh giá chất lượng trên tập ảnh mặc thật, chi phí chính xác hoặc phân phối độ trễ. Một bộ bốn góc đạt sau khi sửa không đại diện cho mọi ảnh/tư thế/trang phục. Bộ lọc vision có thể sai và không chứng minh độ vừa vật lý.
- Chưa build APK/IPA hoặc kiểm tra camera, thư viện, SecureStore và safe area trên thiết bị thật. Bundle Android thành công không chứng minh các quyền native đã hoạt động trên máy thật.
- Theo yêu cầu mới của chủ dự án, hiện chỉ chạy localhost; đã dừng build Android trước bước cài đặt, không cài app lên thiết bị/emulator. Các script/config build được giữ lại để dùng sau; không ghi nhận là APK/native đã kiểm thử.
- Chưa đo Dynamic Type ở mức lớn nhất và chưa chạy trình đọc màn hình trên iOS/Android.
- Chưa kiểm tra tải lớn, triển khai nhiều worker hoặc phục hồi sau mất điện.

## Cảnh báo công cụ

- Cây dependency Expo SDK 57 đang có 8 cảnh báo npm audit (5 high, 3 moderate). Đã chạy `npm audit fix` tương thích; phần còn lại cần bản vá upstream hoặc nâng SDK sau khi kiểm tra tương thích Expo Go. Không dùng `--force` để hạ/nâng SDK ngoài ý muốn.
- Starlette hiện cảnh báo deprecation cho TestClient dùng `httpx`; kiểm thử vẫn qua. Chưa thay thư viện HTTP của bộ test.

Đây là bản phát triển cục bộ có thể demo nghiệp vụ, chưa được chứng nhận sẵn sàng vận hành công khai.
