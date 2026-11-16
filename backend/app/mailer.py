import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from .config import Settings

logger = logging.getLogger("shopfit.mailer")


def send_otp_email(to_email: str, otp: str, settings: Settings) -> bool:
    """Send a real 6-digit OTP email using SMTP."""
    if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
        logger.warning("SMTP not configured. OTP for %s is %s", to_email, otp)
        return False

    sender = settings.smtp_from or settings.smtp_user
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Mã xác thực đặt lại mật khẩu: {otp} — ShopFit Studio"
    msg["From"] = f"ShopFit Studio <{sender}>" if "<" not in sender else sender
    msg["To"] = to_email

    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; color: #1C2421; margin: 0; padding: 24px; }}
    .card {{ max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 36px 32px; border: 1px solid #E5E0D8; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }}
    .brand {{ color: #344E40; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px; }}
    h1 {{ color: #344E40; font-size: 22px; font-weight: 700; margin: 0 0 16px 0; }}
    .otp-box {{ background: #F0F4F1; border: 2px dashed #344E40; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }}
    .otp-code {{ font-size: 38px; font-weight: 700; letter-spacing: 10px; color: #344E40; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }}
    p {{ line-height: 1.6; font-size: 15px; color: #4A5550; margin: 0 0 14px 0; }}
    .footer {{ font-size: 12px; color: #8A948F; margin-top: 28px; text-align: center; border-top: 1px solid #E5E0D8; padding-top: 18px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">ShopFit Studio</div>
    <h1>Mã xác thực đặt lại mật khẩu</h1>
    <p>Chào bạn,</p>
    <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>{to_email}</strong>. Đây là mã xác thực OTP của bạn:</p>
    <div class="otp-box">
      <div class="otp-code">{otp}</div>
    </div>
    <p>Mã này có hiệu lực trong vòng <strong>15 phút</strong>. Tuyệt đối không chia sẻ mã này với bất kỳ ai để bảo vệ tài khoản.</p>
    <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
    <div class="footer">
      ShopFit Studio &copy; 2026 · Hỗ trợ: support@shopfit.vn
    </div>
  </div>
</body>
</html>"""

    text_content = f"Mã xác thực đặt lại mật khẩu ShopFit của bạn là: {otp}. Mã có hiệu lực trong 15 phút. Tuyệt đối không chia sẻ mã này."

    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(sender, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(sender, [to_email], msg.as_string())
        logger.info("Sent real OTP email successfully to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send OTP email to %s: %s", to_email, e)
        return False
