output "instance_id" {
  value = one(aws_instance.app[*].id)
}

output "elastic_ip" {
  description = "Point every A record at the DNS provider here."
  value       = one(aws_eip.app[*].public_ip)
}

output "data_volume_id" {
  value = one(aws_ebs_volume.data[*].id)
}

output "rds_endpoint" {
  description = "Host name for DATABASE_URL and for ansible group_vars rds_endpoint."
  value       = one(aws_db_instance.main[*].address)
}

output "rds_master_secret_arn" {
  description = "Secrets Manager secret holding the stepwhere_admin password."
  value       = try(aws_db_instance.main[0].master_user_secret[0].secret_arn, null)
}

output "storage_bucket" {
  value = aws_s3_bucket.storage.bucket
}

output "backups_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "ecr_repository_urls" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "github_deploy_role_arn" {
  description = "Set as the GitHub Actions variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_deploy.arn
}
