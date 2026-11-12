output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "alerts_us_east_1_topic_arn" {
  value = aws_sns_topic.alerts_us_east_1.arn
}

output "github_oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}

output "audit_bucket" {
  value = aws_s3_bucket.audit.bucket
}
