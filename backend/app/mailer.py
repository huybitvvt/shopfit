import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from .config import Settings

logger = logging.getLogger("shopfit.mailer")


def send_otp_email(to_email: str, otp: str, settings: Settings) -> bool:
    """Send a real 6-digit OTP email using Resend API, Brevo API, or standard SMTP."""
    sender_email = settings.smtp_user or "support@shopfit.vn"
    sender_name = "ShopFit Studio"
    sender = settings.smtp_from or f"{sender_name} <{sender_email}>"

    subject = f"Mã xác thực đặt lại mật khẩu: {otp} — ShopFit Studio"
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

    # Priority 1: Resend HTTP REST API (port 443 - works seamlessly on Render Free)
    if settings.resend_api_key:
        try:
            from_addr = sender if "@" in sender and "gmail.com" not in sender else f"{sender_name} <onboarding@resend.dev>"
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_addr,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content,
                    "text": text_content,
                },
                timeout=15,
            )
            if resp.status_code in (200, 201):
                logger.info("Sent real OTP email successfully via Resend API to %s", to_email)
                return True
            else:
                logger.error("Resend API failed (%s): %s", resp.status_code, resp.text)
        except Exception as e:
            logger.error("Resend API error: %s", e)

    # Priority 2: Brevo HTTP REST API (port 443 - works with any sender email including @gmail.com)
    if settings.brevo_api_key:
        try:
            resp = httpx.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key": settings.brevo_api_key,
                    "Content-Type": "application/json",
                    "accept": "application/json",
                },
                json={
                    "sender": {"name": sender_name, "email": sender_email},
                    "to": [{"email": to_email}],
                    "subject": subject,
                    "htmlContent": html_content,
                    "textContent": text_content,
                },
                timeout=15,
            )
            if resp.status_code in (200, 201):
                logger.info("Sent real OTP email successfully via Brevo API to %s", to_email)
                return True
            else:
                logger.error("Brevo API failed (%s): %s", resp.status_code, resp.text)
        except Exception as e:
            logger.error("Brevo API error: %s", e)

    # Priority 3: Standard SMTP (for environments where outbound ports 587/465 are unblocked)
    if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
        logger.warning("No email provider configured (SMTP/Resend/Brevo) for recipient %s", to_email)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender if "<" in sender else f"{sender_name} <{sender}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        clean_password = settings.smtp_password.replace(" ", "") if "gmail.com" in settings.smtp_host else settings.smtp_password
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                server.login(settings.smtp_user, clean_password)
                server.sendmail(sender, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                server.login(settings.smtp_user, clean_password)
                server.sendmail(sender, [to_email], msg.as_string())
        logger.info("Sent real OTP email successfully via SMTP to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send OTP email via SMTP to %s: %s", to_email, e)
        return False
