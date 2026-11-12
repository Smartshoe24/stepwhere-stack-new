resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = local.name }
}

resource "aws_subnet" "public_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.0.0/24"
  availability_zone = var.availability_zone

  tags = { Name = "${local.name}-public-a" }
}

# Reserved for later (e.g. a second host). Nothing runs here today.
resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.1.0/24"
  availability_zone = var.secondary_availability_zone

  tags = { Name = "${local.name}-public-b" }
}

resource "aws_subnet" "db_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.10.0/24"
  availability_zone = var.availability_zone

  tags = { Name = "${local.name}-db-a" }
}

resource "aws_subnet" "db_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.11.0/24"
  availability_zone = var.secondary_availability_zone

  tags = { Name = "${local.name}-db-b" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  for_each = {
    a = aws_subnet.public_a.id
    b = aws_subnet.public_b.id
  }

  subnet_id      = each.value
  route_table_id = aws_route_table.public.id
}

# Local routes only: the database never reaches the internet.
resource "aws_route_table" "db" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name}-db" }
}

resource "aws_route_table_association" "db" {
  for_each = {
    a = aws_subnet.db_a.id
    b = aws_subnet.db_b.id
  }

  subnet_id      = each.value
  route_table_id = aws_route_table.db.id
}

# Free; keeps host <-> S3 traffic on the AWS network.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${local.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id]

  tags = { Name = "${local.name}-s3" }
}
