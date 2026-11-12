locals {
  account_id = "045837342042" # stepwhere-prod

  tags = {
    Project   = "stepwhere"
    Env       = "prod"
    ManagedBy = "opentofu"
    Stack     = "account"
  }
}

provider "aws" {
  region              = "ap-south-1"
  allowed_account_ids = [local.account_id]

  default_tags {
    tags = local.tags
  }
}

# Route 53 health-check metrics only exist in us-east-1, so their alarms and
# the topic those alarms notify live there. Nothing else uses this provider.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [local.account_id]

  default_tags {
    tags = local.tags
  }
}
