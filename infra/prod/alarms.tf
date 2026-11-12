# --- EC2 host ---

resource "aws_cloudwatch_metric_alarm" "app_system_check" {
  count = local.instance_enabled

  alarm_name          = "${local.name}-app-system-check"
  alarm_description   = "Underlying AWS hardware failed; EC2 recovers the instance onto healthy hardware."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  dimensions          = { InstanceId = aws_instance.app[0].id }
  alarm_actions       = ["arn:aws:automate:${local.region}:ec2:recover", local.alerts_topic_arn]
  ok_actions          = [local.alerts_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "app_instance_check" {
  count = local.instance_enabled

  alarm_name          = "${local.name}-app-instance-check"
  alarm_description   = "The OS stopped responding; EC2 reboots the instance."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  dimensions          = { InstanceId = aws_instance.app[0].id }
  alarm_actions       = ["arn:aws:automate:${local.region}:ec2:reboot", local.alerts_topic_arn]
  ok_actions          = [local.alerts_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "app_cpu" {
  count = local.instance_enabled

  alarm_name          = "${local.name}-app-cpu-high"
  alarm_description   = "Host CPU above 80% for 15 minutes."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { InstanceId = aws_instance.app[0].id }
  alarm_actions       = [local.alerts_topic_arn]
  ok_actions          = [local.alerts_topic_arn]
}

# --- RDS ---

locals {
  db_alarms = {
    cpu = {
      description = "Database CPU above 80% for 15 minutes."
      metric      = "CPUUtilization"
      statistic   = "Average"
      operator    = "GreaterThanThreshold"
      threshold   = 80
      periods     = 3
    }
    storage = {
      description = "Less than 4 GiB of database storage free (autoscaling should have kicked in)."
      metric      = "FreeStorageSpace"
      statistic   = "Minimum"
      operator    = "LessThanThreshold"
      threshold   = 4 * 1024 * 1024 * 1024
      periods     = 1
    }
    memory = {
      description = "Less than 512 MiB of database memory free for 15 minutes."
      metric      = "FreeableMemory"
      statistic   = "Average"
      operator    = "LessThanThreshold"
      threshold   = 512 * 1024 * 1024
      periods     = 3
    }
    connections = {
      description = "More than 150 database connections (the app pool is 60)."
      metric      = "DatabaseConnections"
      statistic   = "Maximum"
      operator    = "GreaterThanThreshold"
      threshold   = 150
      periods     = 2
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "db" {
  for_each = var.enable_database ? local.db_alarms : {}

  alarm_name          = "${local.name}-db-${each.key}"
  alarm_description   = each.value.description
  namespace           = "AWS/RDS"
  metric_name         = each.value.metric
  statistic           = each.value.statistic
  period              = 300
  evaluation_periods  = each.value.periods
  threshold           = each.value.threshold
  comparison_operator = each.value.operator
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main[0].identifier }
  alarm_actions       = [local.alerts_topic_arn]
  ok_actions          = [local.alerts_topic_arn]
}
