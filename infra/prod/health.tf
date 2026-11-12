# Route 53 health checks probe the public hostnames from outside AWS's view of
# the box. They don't need a Route 53 zone (DNS stays at the third-party
# provider), but their metrics only exist in us-east-1, so the alarms go there.
resource "aws_route53_health_check" "public" {
  for_each = var.enable_health_checks ? var.health_checks : {}

  fqdn              = each.value.fqdn
  type              = each.value.type
  port              = each.value.port
  resource_path     = each.value.path
  request_interval  = 30
  failure_threshold = 3

  tags = { Name = "${local.name}-${each.key}" }
}

resource "aws_cloudwatch_metric_alarm" "public_health" {
  for_each = aws_route53_health_check.public
  provider = aws.us_east_1

  alarm_name          = "${local.name}-${each.key}-down"
  alarm_description   = "${var.health_checks[each.key].fqdn} failed Route 53 health checks."
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  dimensions          = { HealthCheckId = each.value.id }
  alarm_actions       = [local.alerts_us_east_1_topic_arn]
  ok_actions          = [local.alerts_us_east_1_topic_arn]
}
