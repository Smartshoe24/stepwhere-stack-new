resource "aws_ebs_encryption_by_default" "this" {
  enabled = true
}

resource "aws_s3_account_public_access_block" "this" {
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_accessanalyzer_analyzer" "account" {
  analyzer_name = "stepwhere-prod-account"
  type          = "ACCOUNT"
}
