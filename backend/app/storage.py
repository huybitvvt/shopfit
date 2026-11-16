import logging
from pathlib import Path
from typing import Optional

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from .config import Settings

logger = logging.getLogger("shopfit.storage")


class StorageManager:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.catalog_dir = settings.data_dir / "catalog"
        self.private_dir = settings.data_dir / "private"
        self.catalog_dir.mkdir(parents=True, exist_ok=True)
        self.private_dir.mkdir(parents=True, exist_ok=True)

        self.enabled = bool(
            settings.cloudfly_endpoint_url
            and settings.cloudfly_access_key
            and settings.cloudfly_secret_key
        )
        self.bucket = settings.cloudfly_bucket or "shopfit"

        self._s3 = None
        if self.enabled:
            endpoint = settings.cloudfly_endpoint_url
            if endpoint and not endpoint.startswith(("http://", "https://")):
                endpoint = f"https://{endpoint}"
            try:
                self._s3 = boto3.client(
                    "s3",
                    endpoint_url=endpoint,
                    aws_access_key_id=settings.cloudfly_access_key,
                    aws_secret_access_key=settings.cloudfly_secret_key,
                    region_name=settings.cloudfly_region or "us-east-1",
                    config=Config(
                        signature_version="s3v4",
                        s3={"payload_signing_enabled": False, "addressing_style": "path"},
                        request_checksum_calculation="when_required",
                        response_checksum_validation="when_required",
                    ),
                )
                logger.info("Cloudfly S3 storage initialized for bucket: %s", self.bucket)
            except Exception as e:
                logger.error("Failed to initialize Cloudfly S3 client: %s", e)
                self.enabled = False

    def put_catalog(self, filename: str, content: bytes, content_type: str = "image/jpeg") -> Path:
        local_path = self.catalog_dir / filename
        local_path.write_bytes(content)
        if self.enabled and self._s3:
            try:
                self._s3.put_object(
                    Bucket=self.bucket,
                    Key=f"catalog/{filename}",
                    Body=content,
                    ContentType=content_type,
                )
            except Exception as e:
                logger.warning("Failed to upload catalog image to S3: %s", e)
        return local_path

    def get_catalog(self, filename: str) -> Optional[bytes]:
        local_path = self.catalog_dir / filename
        if local_path.is_file():
            return local_path.read_bytes()
        if self.enabled and self._s3:
            try:
                response = self._s3.get_object(Bucket=self.bucket, Key=f"catalog/{filename}")
                data = response["Body"].read()
                local_path.write_bytes(data)
                return data
            except ClientError as e:
                if e.response["Error"]["Code"] != "NoSuchKey":
                    logger.warning("Error getting catalog image from S3: %s", e)
        return None

    def put_private(self, filename: str, content: bytes, content_type: str = "image/jpeg") -> Path:
        local_path = self.private_dir / filename
        local_path.write_bytes(content)
        if self.enabled and self._s3:
            try:
                self._s3.put_object(
                    Bucket=self.bucket,
                    Key=f"private/{filename}",
                    Body=content,
                    ContentType=content_type,
                )
            except Exception as e:
                logger.warning("Failed to upload private image to S3: %s", e)
        return local_path

    def get_private(self, filename: str) -> Optional[bytes]:
        local_path = self.private_dir / filename
        if local_path.is_file():
            return local_path.read_bytes()
        if self.enabled and self._s3:
            try:
                response = self._s3.get_object(Bucket=self.bucket, Key=f"private/{filename}")
                data = response["Body"].read()
                local_path.write_bytes(data)
                return data
            except ClientError as e:
                if e.response["Error"]["Code"] != "NoSuchKey":
                    logger.warning("Error getting private image from S3: %s", e)
        return None

    def delete_private(self, filename: str) -> None:
        local_path = self.private_dir / filename
        local_path.unlink(missing_ok=True)
        if self.enabled and self._s3:
            try:
                self._s3.delete_object(Bucket=self.bucket, Key=f"private/{filename}")
            except Exception as e:
                logger.warning("Failed to delete private image from S3: %s", e)
