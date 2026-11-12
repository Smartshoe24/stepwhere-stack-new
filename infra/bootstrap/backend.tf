# The state bucket stores this stack's own state too. On the very first run the
# bucket doesn't exist yet, so `make bootstrap-first` applies with local state
# and then migrates it here. See infra/README.md.
terraform {
  backend "s3" {
    bucket       = "stepwhere-tofu-state-045837342042-ap-south-1"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}
