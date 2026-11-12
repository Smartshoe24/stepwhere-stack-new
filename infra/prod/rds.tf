locals {
  database_enabled = var.enable_database ? 1 : 0
  db_identifier    = "${local.name}-db"
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = [aws_subnet.db_a.id, aws_subnet.db_b.id]

  tags = { Name = local.name }
}

resource "aws_db_parameter_group" "pg18" {
  name        = "stepwhere-pg18"
  family      = "postgres18"
  description = "Stepwhere Postgres 18"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "log_min_duration_statement"
    value        = "500"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_lock_waits"
    value        = "1"
    apply_method = "immediate"
  }

  parameter {
    name         = "idle_in_transaction_session_timeout"
    value        = "60000"
    apply_method = "immediate"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Created first so exported logs get a retention instead of "never expire".
resource "aws_cloudwatch_log_group" "rds_postgresql" {
  count = local.database_enabled

  name              = "/aws/rds/instance/${local.db_identifier}/postgresql"
  retention_in_days = 14
}

resource "aws_db_instance" "main" {
  count = local.database_enabled

  identifier     = local.db_identifier
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  db_name                     = "stepwhere"
  username                    = "stepwhere_admin"
  manage_master_user_password = true # generated and held in Secrets Manager, never in state

  allocated_storage     = var.db_allocated_storage_gib
  max_allocated_storage = var.db_max_allocated_storage_gib
  storage_type          = "gp3"
  storage_encrypted     = true

  availability_zone      = var.availability_zone
  multi_az               = false
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  parameter_group_name   = aws_db_parameter_group.pg18.name
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  backup_retention_period  = 14
  backup_window            = "20:30-21:00" # 02:00 IST
  maintenance_window       = "sun:21:30-sun:22:30"
  copy_tags_to_snapshot    = true
  delete_automated_backups = false

  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  apply_immediately           = false

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["postgresql"]

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.db_identifier}-final"

  depends_on = [aws_cloudwatch_log_group.rds_postgresql]

  lifecycle {
    prevent_destroy = true
  }
}
