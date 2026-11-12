variable "alert_email" {
  description = "Receives SNS alarms and budget alerts."
  type        = string
  default     = "ceo@stepwhere.in"
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget for the account."
  type        = number
  default     = 300
}

variable "prod_log_source_buckets" {
  description = "Buckets in the prod stack that send S3 server access logs to the audit bucket."
  type        = list(string)
  default     = ["stepwhere-storage", "stepwhere-backups"]
}
