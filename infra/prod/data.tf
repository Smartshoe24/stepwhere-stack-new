data "terraform_remote_state" "account" {
  backend = "s3"

  config = {
    bucket = "stepwhere-tofu-state-045837342042-ap-south-1"
    key    = "account/terraform.tfstate"
    region = "ap-south-1"
  }
}

locals {
  alerts_topic_arn           = data.terraform_remote_state.account.outputs.alerts_topic_arn
  alerts_us_east_1_topic_arn = data.terraform_remote_state.account.outputs.alerts_us_east_1_topic_arn
  github_oidc_provider_arn   = data.terraform_remote_state.account.outputs.github_oidc_provider_arn
  audit_bucket               = data.terraform_remote_state.account.outputs.audit_bucket
}

data "aws_ssm_parameter" "ubuntu_arm64_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
}
