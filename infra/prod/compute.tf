locals {
  instance_enabled = var.enable_instance ? 1 : 0
}

resource "aws_key_pair" "ops" {
  count = local.instance_enabled

  key_name   = "${local.name}-ops"
  public_key = var.ssh_public_key

  lifecycle {
    precondition {
      condition     = length(trimspace(var.ssh_public_key)) > 0
      error_message = "Set ssh_public_key in terraform.tfvars before enable_instance = true."
    }
  }
}

resource "aws_instance" "app" {
  count = local.instance_enabled

  ami                     = data.aws_ssm_parameter.ubuntu_arm64_ami.value
  instance_type           = var.instance_type
  subnet_id               = aws_subnet.public_a.id
  vpc_security_group_ids  = [aws_security_group.app.id]
  iam_instance_profile    = aws_iam_instance_profile.app.name
  key_name                = aws_key_pair.ops[0].key_name
  ebs_optimized           = true
  disable_api_termination = true

  user_data = templatefile("${path.module}/user-data.yaml.tftpl", {
    hostname = "${local.name}-app"
  })

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2 # containers use the instance role
    instance_metadata_tags      = "enabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gib
    encrypted             = true
    delete_on_termination = true
    tags                  = { Name = "${local.name}-app-root" }
  }

  tags = {
    Name = "${local.name}-app"
    Role = "app"
  }

  lifecycle {
    # A new Ubuntu AMI or a user-data edit must never replace the running host.
    ignore_changes = [ami, user_data]
  }
}

# Holds everything stateful on the host (/srv). Survives instance replacement.
resource "aws_ebs_volume" "data" {
  count = local.instance_enabled

  availability_zone = var.availability_zone
  type              = "gp3"
  size              = var.data_volume_gib
  encrypted         = true

  tags = {
    Name   = "${local.name}-app-data"
    Backup = "daily"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "data" {
  count = local.instance_enabled

  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data[0].id
  instance_id = aws_instance.app[0].id
}

# Ansible finds the data disk through this tag (implementation contract).
resource "aws_ec2_tag" "data_volume_id" {
  count = local.instance_enabled

  resource_id = aws_instance.app[0].id
  key         = "DataVolumeId"
  value       = aws_ebs_volume.data[0].id
}

resource "aws_eip" "app" {
  count = local.instance_enabled

  domain = "vpc"

  tags = { Name = "${local.name}-app" }
}

resource "aws_eip_association" "app" {
  count = local.instance_enabled

  allocation_id = aws_eip.app[0].id
  instance_id   = aws_instance.app[0].id
}
