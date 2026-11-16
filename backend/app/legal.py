"""Legal and compliance HTML pages for App Store and Google Play."""

HTML_SHELL = """<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — ShopFit Studio</title>
  <style>
    :root {{
      --primary: #344E40;
      --bg: #FAF8F5;
      --surface: #FFFFFF;
      --ink: #1C2421;
      --muted: #66706B;
      --line: #E5E0D8;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.65;
      padding: 32px 16px;
    }}
    .container {{
      max-width: 800px;
      margin: 0 auto;
      background: var(--surface);
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
      border: 1px solid var(--line);
    }}
    .brand {{
      display: inline-block;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1.5px;
      color: var(--primary);
      text-transform: uppercase;
      margin-bottom: 12px;
    }}
    h1 {{
      font-size: 28px;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 8px;
    }}
    .date {{
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
    }}
    h2 {{
      font-size: 19px;
      font-weight: 600;
      color: var(--ink);
      margin-top: 28px;
      margin-bottom: 12px;
    }}
    p, li {{
      font-size: 15px;
      color: #333D38;
      margin-bottom: 14px;
    }}
    ul {{
      padding-left: 24px;
      margin-bottom: 16px;
    }}
    li {{ margin-bottom: 6px; }}
    .callout {{
      background: #F0F4F1;
      border-left: 4px solid var(--primary);
      padding: 16px;
      border-radius: 6px;
      margin: 20px 0;
      font-size: 14px;
    }}
    .footer {{
      margin-top: 36px;
      padding-top: 20px;
      border-top: 1px solid var(--line);
      font-size: 13px;
      color: var(--muted);
      text-align: center;
    }}
    a {{ color: var(--primary); text-decoration: underline; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">ShopFit Studio</div>
    <h1>{title}</h1>
    <div class="date">Cập nhật lần cuối: Tháng 11/2026 · Phiên bản 1.0</div>
    {content}
    <div class="footer">
      ShopFit Studio &copy; 2026 · Hỗ trợ: <a href="mailto:support@shopfit.vn">support@shopfit.vn</a>
    </div>
  </div>
</body>
</html>
"""

PRIVACY_CONTENT = """
<div class="callout">
  <strong>Tóm tắt cam kết bảo mật:</strong> ShopFit tôn trọng quyền riêng tư của bạn. Chúng tôi chỉ sử dụng ảnh chụp và số đo cơ thể để tạo hình ảnh mô phỏng trang phục bằng Trí tuệ nhân tạo (AI). Ảnh của bạn được lưu trong bộ nhớ riêng tư được bảo vệ và bạn có quyền xóa tài khoản cùng toàn bộ ảnh bất kỳ lúc nào.
</div>

<h2>1. Dữ liệu chúng tôi thu thập</h2>
<p>Để cung cấp trải nghiệm thử trang phục ảo và tư vấn chọn size chính xác, ShopFit thu thập các thông tin sau khi bạn đồng ý cung cấp:</p>
<ul>
  <li><strong>Thông tin tài khoản:</strong> Họ tên, địa chỉ email, mật khẩu (được mã hóa một chiều an toàn).</li>
  <li><strong>Hồ sơ số đo cơ thể:</strong> Chiều cao, cân nặng, số đo vòng ngực, vòng eo, vòng mông để gợi ý size áo quần vừa vặn.</li>
  <li><strong>Hình ảnh thử đồ:</strong> Ảnh chụp toàn thân do bạn tải lên từ thư viện hoặc máy ảnh để ghép với trang phục mẫu.</li>
  <li><strong>Thông tin giao hàng:</strong> Họ tên người nhận, số điện thoại, địa chỉ nhận hàng khi bạn đặt mua trang phục qua hình thức COD.</li>
</ul>

<h2>2. Xử lý Trí tuệ nhân tạo (AI & Sinh trắc học)</h2>
<p>ShopFit sử dụng mô hình trí tuệ nhân tạo (Google Gemini và OpenVTO) để thực hiện thử trang phục ảo:</p>
<ul>
  <li>Ảnh của bạn được gửi đến Google Gemini API thông qua kết nối bảo mật HTTPS chỉ nhằm mục đích thay thế trang phục trên ảnh.</li>
  <li>ShopFit <strong>không sử dụng ảnh của bạn để nhận diện khuôn mặt thương mại</strong>, không bán dữ liệu cho bên thứ ba và không dùng ảnh cá nhân để huấn luyện các mô hình AI công cộng.</li>
  <li>Hình ảnh thử đồ do AI tạo ra là ảnh mô phỏng kỹ thuật số hỗ trợ khách hàng hình dung kiểu dáng, phom áo và màu sắc.</li>
</ul>

<h2>3. Lưu trữ và Bảo vệ Dữ liệu</h2>
<ul>
  <li>Toàn bộ ảnh chụp cá nhân và kết quả thử đồ được lưu trữ tại cụm Object Storage bảo mật riêng biệt (Cloudfly S3 Encrypted).</li>
  <li>Đường dẫn truy cập ảnh được bảo vệ bằng chữ ký số HMAC và tự động hết hạn sau 60 phút để ngăn chặn việc truy cập trái phép.</li>
  <li>Dữ liệu tài khoản và số đo được lưu trữ trên hệ thống PostgreSQL đám mây (Supabase) đạt tiêu chuẩn bảo mật quốc tế.</li>
</ul>

<h2>4. Quyền của Người dùng & Quyền được Xóa (Right to be Forgotten)</h2>
<p>Bạn có toàn quyền kiểm soát dữ liệu của mình bất cứ lúc nào:</p>
<ul>
  <li><strong>Xóa tài khoản trực tiếp trong ứng dụng:</strong> Mở ứng dụng ShopFit &rarr; vào mục <em>Cá nhân</em> &rarr; chọn <em>Xóa tài khoản</em>. Toàn bộ hồ sơ số đo, nhật ký thử đồ và các file ảnh trên hệ thống lưu trữ sẽ bị xóa vĩnh viễn ngay lập tức.</li>
  <li><strong>Yêu cầu xóa qua Web:</strong> Bạn cũng có thể gửi yêu cầu xóa tại <a href="/delete-account">Trang yêu cầu xóa dữ liệu ShopFit</a>. Chúng tôi sẽ xử lý yêu cầu trong vòng 24–48 giờ.</li>
</ul>

<h2>5. Liên hệ chúng tôi</h2>
<p>Nếu bạn có bất kỳ câu hỏi nào về chính sách quyền riêng tư hoặc muốn thực hiện quyền bảo vệ dữ liệu cá nhân, vui lòng liên hệ:</p>
<p>Email: <a href="mailto:support@shopfit.vn">support@shopfit.vn</a><br>Địa chỉ: ShopFit Studio, Việt Nam.</p>
"""

TERMS_CONTENT = """
<div class="callout">
  <strong>Lưu ý quan trọng:</strong> Bằng việc tải về, cài đặt hoặc sử dụng ứng dụng ShopFit, bạn đồng ý tuân thủ các Điều khoản dịch vụ này.
</div>

<h2>1. Mục đích sử dụng ứng dụng</h2>
<p>ShopFit là ứng dụng thương mại điện tử thời trang kết hợp công nghệ phòng thử đồ ảo (Virtual Fitting Room) giúp người dùng xem trước trang phục trên ảnh bản thân và nhận tư vấn size phù hợp.</p>

<h2>2. Khuyến cáo về hình ảnh do Trí tuệ nhân tạo (AI) tạo ra</h2>
<ul>
  <li>Hình ảnh thử đồ 4 góc (trước, trái, sau, phải) là kết quả mô phỏng kỹ thuật số do công nghệ AI tạo sinh (Generative AI) thực hiện.</li>
  <li>Mặc dù thuật toán cố gắng tái hiện chân thực nhất phom dáng và chất liệu vải, ảnh mô phỏng có thể có sự sai khác nhỏ về màu sắc thực tế do ánh sáng hoặc màn hình thiết bị.</li>
  <li>Khách hàng vui lòng đối chiếu với <strong>Bảng số đo thành phẩm chi tiết</strong> của từng sản phẩm trước khi đưa ra quyết định chọn size.</li>
</ul>

<h2>3. Quy tắc ứng xử và Tải ảnh</h2>
<ul>
  <li>Bạn chỉ được tải lên ảnh của chính mình hoặc ảnh bạn có quyền sử dụng hợp pháp.</li>
  <li>Nghiêm cấm tải lên hình ảnh khỏa thân, nội dung khiêu dâm, bạo lực, vi phạm thuần phong mỹ tục hoặc xâm phạm quyền riêng tư của người khác.</li>
  <li>Hệ thống sử dụng bộ lọc kiểm duyệt tự động để từ chối các hình ảnh không phù hợp tiêu chuẩn an toàn cộng đồng.</li>
</ul>

<h2>4. Đặt hàng và Thanh toán</h2>
<ul>
  <li>ShopFit hỗ trợ hình thức thanh toán khi nhận hàng (COD).</li>
  <li>Khi đặt hàng, bạn có trách nhiệm cung cấp thông tin liên lạc và địa chỉ nhận hàng chính xác. Đơn hàng có thể hủy trước khi shop xác nhận giao hàng.</li>
</ul>

<h2>5. Chấm dứt dịch vụ & Thay đổi điều khoản</h2>
<p>Chúng tôi có quyền tạm ngừng hoặc khóa tài khoản của các cá nhân cố tình lạm dụng, tấn công hệ thống hoặc vi phạm các điều khoản trên. Điều khoản có thể được cập nhật định kỳ và thông báo trên ứng dụng.</p>
"""

DELETE_ACCOUNT_CONTENT = """
<div class="callout">
  <strong>Chính sách minh bạch dữ liệu (Google Play & Apple App Store Compliance):</strong> Bạn có toàn quyền yêu cầu xóa vĩnh viễn tài khoản và mọi dữ liệu cá nhân liên quan khỏi hệ thống ShopFit bất cứ lúc nào.
</div>

<h2>1. Cách xóa tài khoản trực tiếp trong Ứng dụng (Khuyên dùng)</h2>
<p>Cách nhanh nhất để xóa toàn bộ dữ liệu của bạn ngay lập tức:</p>
<ol style="padding-left: 24px; margin-bottom: 20px;">
  <li style="margin-bottom: 8px;">Mở ứng dụng <strong>ShopFit</strong> trên điện thoại của bạn.</li>
  <li style="margin-bottom: 8px;">Chuyển sang tab <strong>Cá nhân</strong> (Profile).</li>
  <li style="margin-bottom: 8px;">Cuộn xuống dưới cùng và nhấn nút <strong>Xóa tài khoản</strong> (màu đỏ).</li>
  <li style="margin-bottom: 8px;">Xác nhận đồng ý tại hộp thoại thông báo.</li>
</ol>
<p>Ngay sau khi xác nhận, tài khoản của bạn sẽ bị xóa ngay lập tức.</p>

<h2>2. Những dữ liệu nào sẽ bị xóa?</h2>
<ul>
  <li><strong>Thông tin tài khoản:</strong> Tên, email, mật khẩu đã mã hóa và phiên đăng nhập.</li>
  <li><strong>Hồ sơ số đo:</strong> Toàn bộ dữ liệu chiều cao, cân nặng, số đo 3 vòng của bạn.</li>
  <li><strong>Dữ liệu ảnh thử đồ:</strong> Toàn bộ ảnh gốc bạn đã tải lên và các ảnh kết quả 4 góc đã tạo trên Cloudfly Object Storage sẽ bị xóa vĩnh viễn khỏi máy chủ.</li>
  <li><strong>Đơn hàng:</strong> Lịch sử đơn hàng sẽ được ẩn danh hoàn toàn (xóa tên, số điện thoại, địa chỉ) để bảo lưu chứng từ giao dịch nhưng không còn gắn với danh tính của bạn.</li>
</ul>

<h2>3. Gửi yêu cầu xóa dữ liệu qua Web / Email</h2>
<p>Nếu bạn đã gỡ cài đặt ứng dụng hoặc không thể đăng nhập, bạn có thể gửi yêu cầu xóa qua email:</p>
<ul>
  <li>Gửi email từ chính hòm thư bạn đã dùng để đăng ký đến: <a href="mailto:support@shopfit.vn">support@shopfit.vn</a></li>
  <li>Tiêu đề: <strong>[Yêu cầu xóa tài khoản ShopFit]</strong></li>
  <li>Nội dung: Cung cấp email tài khoản của bạn.</li>
</ul>
<p>Đội ngũ kỹ thuật của ShopFit sẽ xác minh và hoàn tất xóa toàn bộ dữ liệu của bạn trong vòng 24–48 giờ làm việc, đồng thời gửi email thông báo xác nhận hoàn tất.</p>
"""


def render_privacy_page() -> str:
    return HTML_SHELL.format(title="Chính sách quyền riêng tư", content=PRIVACY_CONTENT)


def render_terms_page() -> str:
    return HTML_SHELL.format(title="Điều khoản dịch vụ", content=TERMS_CONTENT)


def render_delete_page() -> str:
    return HTML_SHELL.format(title="Yêu cầu xóa tài khoản & Dữ liệu cá nhân", content=DELETE_ACCOUNT_CONTENT)
