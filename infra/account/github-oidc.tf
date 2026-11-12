# Lets GitHub Actions assume roles in this account without stored keys. The
# roles themselves (and what they may do) are defined in the prod stack.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
