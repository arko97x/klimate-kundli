"""Cloudflare R2 client (S3-compatible) for archive + Parquet uploads.

R2 speaks the S3 API, so we use boto3 with a custom endpoint. R2 does not
use regions; pass `region_name='auto'`. Pricing has no egress fees, which
makes it the right home for our raw NetCDF + derived Parquet objects.

Key layout:
    raw/{source}/{variable}/{year}/{source}_{variable}_{year}-{month}.nc
    daily/{source}/{variable}/{year}/{source}_{variable}_{year}-{month}.parquet

We return `s3://{bucket}/{key}` URIs so other tools (DuckDB, athena-like
readers) can address the objects without knowing the R2 endpoint.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from ..config import R2Config
from ..logging import get_logger

log = get_logger(__name__)


@dataclass
class R2Client:
    cfg: R2Config
    _s3: Any = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._s3 = boto3.client(
            "s3",
            endpoint_url=self.cfg.endpoint,
            aws_access_key_id=self.cfg.access_key_id,
            aws_secret_access_key=self.cfg.secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
        )

    @classmethod
    def from_env(cls) -> "R2Client":
        return cls(cfg=R2Config.from_env())

    @property
    def bucket(self) -> str:
        return self.cfg.bucket

    # -- bucket ------------------------------------------------------------

    def bucket_exists(self) -> bool:
        try:
            self._s3.head_bucket(Bucket=self.bucket)
            return True
        except ClientError as e:
            code = _error_code(e)
            if code in {"404", "NoSuchBucket", "NotFound"}:
                return False
            raise

    def ensure_bucket(self) -> bool:
        """Create the bucket if missing. Returns True if created."""
        if self.bucket_exists():
            return False
        log.info("r2.bucket.create", bucket=self.bucket)
        self._s3.create_bucket(Bucket=self.bucket)
        return True

    # -- objects -----------------------------------------------------------

    def object_uri(self, key: str) -> str:
        return f"s3://{self.bucket}/{key}"

    def head(self, key: str) -> dict | None:
        try:
            return self._s3.head_object(Bucket=self.bucket, Key=key)
        except ClientError as e:
            if _error_code(e) in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise

    def upload_file(
        self,
        local_path: Path,
        key: str,
        *,
        content_type: str | None = None,
        overwrite: bool = True,
    ) -> str:
        """Upload `local_path` to `key`. Returns s3:// URI."""
        local_path = Path(local_path)
        size = local_path.stat().st_size
        if not overwrite and self.head(key) is not None:
            log.info("r2.upload.skip", key=key, reason="exists")
            return self.object_uri(key)
        extra: dict[str, str] = {}
        if content_type:
            extra["ContentType"] = content_type
        log.info("r2.upload.start", key=key, bytes=size)
        self._s3.upload_file(str(local_path), self.bucket, key, ExtraArgs=extra or None)
        uri = self.object_uri(key)
        log.info("r2.upload.done", uri=uri, bytes=size)
        return uri


def _error_code(e: ClientError) -> str:
    return str(e.response.get("Error", {}).get("Code", ""))
