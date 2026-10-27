# ShopFit: phạm vi bản demo hoàn chỉnh

Định vị: **xem mình mặc, hiểu vì sao vừa, đối chiếu với thực tế** cho một shop nhỏ.

## Ba phần khác biệt được tự xây

1. **Bản đồ độ vừa có giải thích.** Đối chiếu vòng cơ thể với vòng thành phẩm, hiển thị thiếu độ dư / đạt mục tiêu / dư nhiều hơn; chạm từng vùng để đọc con số. Dư nhiều hơn nghĩa là vượt mục tiêu hơn 4 cm, là ngưỡng quy tắc hiện tại của app. Sơ đồ không mô phỏng vải hay áp lực cơ thể.
2. **So với đồ đang mặc vừa.** Khách tự lưu số đo quần áo yêu thích theo cách đo thống nhất, chọn món cùng loại để so từng vòng, dài/vai/chân. Không cần suy số đo từ chiều cao/cân nặng. Đồ tham chiếu riêng theo tài khoản, có thể sửa/xóa.
3. **Phản hồi sau đơn đã giao.** Khách chủ động chia sẻ chật/vừa/rộng và ghi chú từ sản phẩm trong đơn hoàn tất. Một dòng đơn chỉ tính một mẫu; sửa thay thế kết quả cũ, có thể gỡ phản hồi. Shop thấy số lượng theo sản phẩm/size, không thấy ảnh thử hoặc số đo khách trong dashboard này.

Dashboard đánh dấu cần kiểm tra nếu có ít nhất 3 phản hồi cho một size và ít nhất 50% báo chật/rộng. Đây là ngưỡng sàng lọc nhỏ cho demo, không chứng minh ý nghĩa thống kê, không tự thay đổi bảng đo. Nhãn “đã mua” xác nhận quan hệ đơn hàng, không xác nhận tính đúng đắn của cảm nhận.

## Vận hành AI

- Client lưu mã yêu cầu ngẫu nhiên theo dấu vân tay của nội dung; gửi lại sau mất phản hồi dùng cùng mã. Server ràng buộc mã vào nội dung và tài khoản, không tạo thêm job hoặc trừ kho hai lần. Mã đã dùng với nội dung khác trả lỗi; job đã xóa không bị tự tạo lại.
- Hàng đợi và trạng thái từng góc được lưu SQLite. Sau restart, tiếp tục việc chưa gọi tạo ảnh và kiểm tra ảnh ứng viên đã lưu. Góc gián đoạn trong lúc gọi tạo ảnh cần người dùng tự chọn retry, vì chưa biết provider đã tính phí hay chưa. Không hứa exactly-once ở provider khi mạng lỗi.
- Ảnh ứng viên được lưu riêng trước kiểm tra; lỗi kiểm tra tạm thời chỉ kiểm tra lại ảnh đó, không tạo lại ảnh tính phí. Ảnh sai trang phục bị loại và không cấp URL kết quả.
- Mỗi lời gọi được ghi dự trù trước khi gọi. Lời gọi lỗi/không rõ kết quả vẫn giữ dự trù; có trần số request và dự trù USD theo UTC. SDK được cấu hình một network attempt. Giá cấu hình không phải token usage/hóa đơn thực; cần đối chiếu billing Google.
- Chỉ hỗ trợ một tiến trình Uvicorn cho worker hiện tại; đây chưa phải hệ thống queue phân tán.

## Dữ liệu anh bổ sung sau

Chủ dự án đã xác nhận sẽ nhập dữ liệu sản phẩm thật sau. Dữ liệu seed tiếp tục gắn nhãn minh họa, không tự đánh dấu đã đo. Với mỗi sản phẩm cần ảnh đúng màu chính diện, ảnh mặt sau nếu có, số đo thực từng size, chất liệu/phom và tồn kho. Vào Quản trị → thêm sản phẩm → Bảng số đo & ảnh sau → xác nhận sau khi đo.

Chưa thu thập ảnh đối chứng từ người thật. Quy trình đánh giá có trong `FITTING.md`; app không tự tạo ảnh AI để giả dữ liệu mặc thật. Không công bố phần trăm chính xác hoặc tỷ lệ giảm hoàn hàng khi chưa có nghiên cứu.

## Kịch bản bảo vệ 5–7 phút

1. Khách lưu hồ sơ và một áo đang mặc vừa.
2. Mở áo shop: đổi M/L, xem vùng ngực đổi trạng thái, đọc lời giải thích và so dài áo.
3. Chọn size → kiểm tra ảnh toàn thân → tạo bốn góc, hoặc mở lượt mẫu đã có nếu demo bị giới hạn mạng.
4. Chuyển góc bằng mũi tên và so mặt trước với ảnh gốc; mở phần đối chiếu mặc thật (nếu chưa có dữ liệu thì giữ trạng thái trống).
5. Đơn đã giao → chia sẻ cảm nhận size; chủ shop mở dashboard, kiểm tra số mẫu và bảng size.
6. Trình bày kết quả test và giới hạn: API ảnh là phần tích hợp; quy tắc size, so tham chiếu, phản hồi theo đơn và phục hồi tác vụ là logic tự xây.
