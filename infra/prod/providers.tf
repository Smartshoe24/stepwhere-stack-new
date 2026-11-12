locals {
  account_id = "045837342042" # stepwhere-prod
  region     = "ap-south-1"
  name       = "stepwhere-prod"

  tags = {
    Project   = "stepwhere"
    Env       = "prod"
    ManagedBy = "opentofu"
    Stack     = "prod"
  }
}

provider "aws" {
  region              = local.region
  allowed_account_ids = [local.account_id]

  default_tags {
    tags = local.tags
  }
}

# Route 53 health-check metrics only exist in us-east-1 (see health.tf).
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [local.account_id]

  default_tags {
    tags = local.tags
  }
}
