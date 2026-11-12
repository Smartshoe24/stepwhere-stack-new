locals {
  buckets = {
    storage = "stepwhere-storage"
    backups = "stepwhere-backups"
  }
}

# --- stepwhere-storage: app user files (avatars/, later exports/, firmware/) ---

resource "aws_s3_bucket" "storage" {
  bucket = local.buckets.storage

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    id     = "versions-and-uploads"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    expiration {
      expired_object_delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.storage]
}

# --- stepwhere-backups: off-RDS copies, protected by Object Lock ---

resource "aws_s3_bucket" "backups" {
  bucket              = local.buckets.backups
  object_lock_enabled = true # only possible at creation

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = 14
    }
  }

  depends_on = [aws_s3_bucket_versioning.backups]
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "daily"
    status = "Enabled"

    filter {
      prefix = "daily/"
    }

    expiration {
      days = 35
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  rule {
    id     = "monthly"
    status = "Enabled"

    filter {
      prefix = "monthly/"
    }

    transition {
      days          = 30
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = 400
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  rule {
    id     = "uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }

  depends_on = [aws_s3_bucket_versioning.backups]
}

# --- shared settings for both buckets ---

locals {
  bucket_ids = {
    storage = aws_s3_bucket.storage.id
    backups = aws_s3_bucket.backups.id
  }
  bucket_arns = {
    storage = aws_s3_bucket.storage.arn
    backups = aws_s3_bucket.backups.arn
  }
}

resource "aws_s3_bucket_ownership_controls" "app" {
  for_each = local.bucket_ids

  bucket = each.value

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  for_each = local.bucket_ids

  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  for_each = local.bucket_ids

  bucket = each.value

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_logging" "app" {
  for_each = local.bucket_ids

  bucket        = each.value
  target_bucket = local.audit_bucket
  target_prefix = "s3-access/${each.key}/"
}

data "aws_iam_policy_document" "tls_only" {
  for_each = local.bucket_arns

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value, "${each.value}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "app" {
  for_each = local.bucket_ids

  bucket = each.value
  policy = data.aws_iam_policy_document.tls_only[each.key].json

  depends_on = [aws_s3_bucket_public_access_block.app]
}
