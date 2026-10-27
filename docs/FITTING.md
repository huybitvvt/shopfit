# Thử đồ bốn góc và tư vấn size

## Chạy thử

1. Đăng nhập khách → Cá nhân → Hồ sơ cơ thể. Nhập chiều cao, cân nặng và vòng ngực cho áo; eo/mông cho quần; cả ba cho váy. Chọn thích mặc gọn/vừa/rộng.
2. Chủ shop vào Quản trị → **Bảng số đo & ảnh sau** của sản phẩm. Nhập số đo thành phẩm bằng cm. Ngực/eo/mông là cả vòng, không phải ngang trải phẳng. Đánh dấu đã đo chỉ sau khi đo đồ thật. Có thể tải ảnh mặt sau đúng mẫu/màu catalog.
3. Mở sản phẩm, chọn màu. Tư vấn đưa ra size còn hàng đáp ứng độ dư và giải thích cơ thể / thành phẩm / chênh lệch / mục tiêu. Nút áp dụng gợi ý đổi size; khách vẫn tự chọn size khác. Size đó được chuyển sang phòng thử.
4. Chọn/chụp một ảnh dọc, chỉ một người, trọn đầu đến bàn chân, đứng nhìn thẳng, tay cách nhẹ thân, nền gọn và đủ sáng. Tối thiểu 512×768 px sau chuẩn hóa, tối đa 10 MB khi tải lên. Kiểm tra ảnh có thể yêu cầu chụp lại trước khi tạo ảnh trả phí.
5. Bấm **Tạo 4 ảnh thử đồ của tôi**. Mặt trước tạo trước, rồi các góc trái/sau/phải dùng ảnh mặt trước đã thay đồ làm nguồn người. Mỗi góc được lưu ngay. Dùng mũi tên hoặc bốn nút góc; chuyển ảnh vòng từ phải về trước và ngược lại.
6. Ở mặt trước, dùng **So sánh với ảnh gốc**. Nếu có lỗi provider hoặc kiểm tra góc không đạt, ảnh tốt vẫn còn; **Tạo lại góc còn thiếu** chỉ tạo những góc chưa có. Tối đa hai lần tạo lại trong cùng ngày UTC.
7. Chọn **Đối chiếu với ảnh mặc thật**, mặc đúng sản phẩm/màu/size, chụp cùng tư thế và ánh sáng, tải ảnh và tự chấm 1–5 cho vóc dáng, chi tiết đồ, độ vừa. Ghi nhận chật/vừa/rộng và nhận xét.

## Quy tắc tư vấn

`độ dư = vòng thành phẩm − vòng cơ thể`.

Với mỗi vòng bắt buộc, ứng viên phải đạt mức dư mục tiêu do shop cấu hình. Ưu tiên ứng viên có tổng chênh lệch tới mục tiêu nhỏ nhất. Chỉ xét biến thể đúng màu còn hàng. Mặc gọn giảm mục tiêu 2 cm (không xuống dưới 0); mặc rộng tăng 4 cm. Chưa tính độ co giãn hoặc vải bó sát có độ dư âm. Khi không đủ vòng đo/bảng số đo/hàng tồn hoặc không có size đạt mục tiêu, app thông báo thiếu dữ liệu/không có size phù hợp thay vì đoán từ cân nặng.

Chiều cao, cân nặng, các vòng đo, chất liệu và size đã chọn được đưa vào prompt. Server lưu bản chụp hồ sơ và số đo sản phẩm tại thời điểm tạo. Sửa hồ sơ/bảng size về sau không sửa ngược lịch sử. Những con số này hướng dẫn tạo ảnh, chưa phải điều khiển mô phỏng cơ học vải.

## Kiểm tra chất lượng và chi phí

- Không tạo video, mesh, ảnh sheet ghép nhiều góc hoặc crop sheet. Bốn góc là bốn ảnh riêng.
- Một bộ hoàn tất gọi tạo ảnh tối đa 4 lần, kèm 1 kiểm tra đầu vào và 4 kiểm tra đầu ra bằng model vision. Kiểm tra đầu vào được cache 15 phút theo hash ảnh chuẩn hóa và chủ tài khoản. Ảnh khác không dùng lại kết quả kiểm tra.
- Các góc bên/sau chỉ tham chiếu người từ ảnh đã thay đồ. Đưa lại ảnh toàn thân mặc đồ cũ vào bước này từng làm model quay về áo cũ; đã loại bỏ nguồn gây nhiễu đó.
- Vision kiểm tra mặt trước phải đủ đầu–chân, đúng trang phục và giữ đồ/giày không được thay. Mặt trước chưa đạt thì chưa tạo ba góc phụ. Các góc phụ được kiểm tra loại/màu/tay áo, đặc điểm cơ thể nhìn thấy, hướng quay, toàn thân và giày. Không đạt thì giữ trạng thái lỗi, không công bố ảnh đó như góc hoàn tất. Đây là bộ lọc AI, không thay thế đối chứng người thật.
- Chưa ghi được token billing chính xác do SDK OpenVTO không trả usage của Google; xem usage/billing tài khoản Google để tính phí thực. Không coi số request hay thời gian một mẫu là cam kết chi phí/độ trễ.

## Bộ đánh giá cho báo cáo cuối kỳ

Thu ít nhất 20–30 trường hợp có sự đồng ý của người tham gia, đúng sản phẩm và số đo đã đo. Phân nhóm áo/quần/váy, trơn/họa tiết, dáng người; giữ cùng tư thế/ánh sáng giữa ảnh trước và ảnh mặc thật. Không dùng ảnh AI khác làm ảnh đối chứng.

Ghi nhận thời gian, số góc thành công, số lần tạo lại, điểm con người 1–5 cho ba tiêu chí, và size thực tế chật/vừa/rộng. Tách chỉ số hoạt động API khỏi chỉ số giống ảnh thật. Nhờ hai người đánh giá độc lập nếu có thể. Báo rõ số mẫu, sai lệch và những kiểu đồ thường thất bại; không tự chuyển điểm cảm nhận thành phần trăm độ chính xác vật lý.

## Kiểm tra trên điện thoại thật

Đặt `EXPO_PUBLIC_API_URL=http://<IPv4 LAN máy>:8000` trong `mobile/.env`, chạy lại Expo trên mạng LAN và dùng thiết bị cùng Wi-Fi. Kiểm tra camera/thư viện, từ chối rồi cấp quyền, ảnh EXIF xoay dọc, ảnh bị cắt chân/nhiều người, ảnh lớn, bàn phím nhập số thập phân, nút bốn góc, so sánh, rời/quay lại màn hình trong lúc tạo, lịch sử sau đăng nhập lại và xóa ảnh.

Môi trường hiện có SDK và emulator Android; kết quả kiểm tra APK ghi riêng trong `VALIDATION.md`. Chưa có điện thoại vật lý để xác nhận camera thực tế, hiệu năng và khác biệt giữa hãng máy.

## Kiểm thử live có chủ đích

Tại `backend`, khi API đang chạy:

```powershell
.\.venv\Scripts\python.exe scripts/verify_four_views.py --live
```

Script gọi API trả phí có chủ đích, không nằm trong pytest/e2e và không tự retry. Dùng avatar tổng hợp có sẵn của OpenVTO và số đo minh họa, khôi phục hồ sơ khách mẫu sau khi thử. Ảnh và metadata nằm trong `artifacts/four-view-*`; không đưa lên Git. Kết quả mẫu giữ trong lịch sử của khách demo.
