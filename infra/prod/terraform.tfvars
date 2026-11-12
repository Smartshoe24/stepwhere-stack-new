# Non-secret inputs for prod. Flip the switches one at a time (plan section 3.8).
enable_database      = true
enable_instance      = true
enable_health_checks = true

# Required before enable_instance = true: the public half of your ops key,
# e.g. the contents of ~/.ssh/stepwhere_prod_ops.pub.
ssh_public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJgjLIURQoq41DzPqBkXfCkgLoA3aO4sr+Vpn3iKzfjf stepwhere-prod-ops"
