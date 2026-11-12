# Rollout switches (plan section 3.8): apply with both off, then the database,
# then the instance. Each step is an ordinary, reviewable plan.
variable "enable_database" {
  description = "Create the RDS instance and its alarms."
  type        = bool
  default     = false
}

variable "enable_instance" {
  description = "Create the EC2 host, its data volume, Elastic IP and alarms."
  type        = bool
  default     = false
}

variable "enable_health_checks" {
  description = "Create Route 53 health checks for the public hostnames. Turn on after the DNS cutover."
  type        = bool
  default     = false
}

variable "availability_zone" {
  description = "AZ for the host and the RDS primary (same AZ avoids cross-AZ transfer)."
  type        = string
  default     = "ap-south-1a"
}

variable "secondary_availability_zone" {
  description = "Second AZ, only for the RDS subnet group (AWS requires two)."
  type        = string
  default     = "ap-south-1b"
}

variable "instance_type" {
  type    = string
  default = "m7g.large"
}

variable "root_volume_gib" {
  type    = number
  default = 30
}

variable "data_volume_gib" {
  type    = number
  default = 30
}

variable "ssh_public_key" {
  description = "Public key for the ubuntu user. Ansible uses it over SSH tunnelled through SSM; port 22 is never open."
  type        = string
  default     = ""
}

variable "db_instance_class" {
  type    = string
  default = "db.m8g.large"
}

variable "db_engine_version" {
  description = "Major version only; minor versions upgrade automatically in the maintenance window."
  type        = string
  default     = "18"
}

variable "db_allocated_storage_gib" {
  type    = number
  default = 20
}

variable "db_max_allocated_storage_gib" {
  type    = number
  default = 100
}

variable "github_repository" {
  description = "owner/name of the repository whose workflows may deploy."
  type        = string
  default     = "stepwhere/stepwhere-stack"
}

variable "ecr_repositories" {
  type    = list(string)
  default = ["stepwhere-server", "stepwhere-admin", "stepwhere-share-view", "stepwhere-device-ingest-proxy"]
}

variable "health_checks" {
  description = "Public endpoints probed by Route 53 once enable_health_checks is on."
  type = map(object({
    fqdn = string
    type = string
    port = number
    path = string
  }))
  default = {
    api    = { fqdn = "api.stepwhere.in", type = "HTTPS", port = 443, path = "/health" }
    share  = { fqdn = "share.stepwhere.in", type = "HTTPS", port = 443, path = "/health" }
    ingest = { fqdn = "ingest.stepwhere.in", type = "HTTP", port = 80, path = "/health" }
  }
}
