import base64
import hashlib
import hmac
import secrets


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000)
    return base64.b64encode(salt + digest).decode()


def verify_password(password: str, encoded: str) -> bool:
    try:
        raw = base64.b64decode(encoded)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), raw[:16], 260_000)
        return hmac.compare_digest(digest, raw[16:])
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def otp_digest(email: str, otp: str, secret: str) -> str:
    msg = f"{email.strip().lower()}:{otp.strip()}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
