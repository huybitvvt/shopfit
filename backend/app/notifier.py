import logging
import httpx

logger = logging.getLogger("shopfit.notifier")


def send_push_notification(push_token: str, title: str, body: str, data: dict | None = None) -> bool:
    """Send an Expo push notification to Android / iOS device."""
    if not push_token or not (push_token.startswith("ExponentPushToken") or push_token.startswith("ExpoPushToken")):
        return False

    try:
        resp = httpx.post(
            "https://exp.host/--/api/v2/push/send",
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate",
                "Content-Type": "application/json",
            },
            json={
                "to": push_token,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
                "priority": "high",
                "channelId": "default",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            logger.info("Sent push notification successfully to %s", push_token)
            return True
        else:
            logger.warning("Expo push notification returned %s: %s", resp.status_code, resp.text)
    except Exception as e:
        logger.warning("Error dispatching Expo push notification: %s", e)
    return False
