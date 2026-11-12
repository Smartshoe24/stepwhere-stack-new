#!/usr/bin/env bash
# Run a shell snippet as root on the Stepwhere prod host through SSM Run Command.
#
#   infra/scripts/ssm-run.sh 'cd /srv/stepwhere && docker compose ps'
#
# Finds the instance by its tags, waits for the command to finish, prints its
# output and exits with the command's exit status. Used by `make run` and CI.
# The script runs under bash as root with HOME=/root: SSM sets no HOME, and the
# ECR credential helper is configured in /root/.docker/config.json.
# This changes a running environment: humans and CI run it, agents never do.
set -euo pipefail

: "${AWS_REGION:=ap-south-1}"
export AWS_REGION
EXPECTED_ACCOUNT="045837342042"
TIMEOUT_SECONDS="${SSM_RUN_TIMEOUT:-900}"

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "usage: $0 '<shell commands>'" >&2
  exit 2
fi
script="$1"

account="$(aws sts get-caller-identity --query Account --output text)"
if [ "$account" != "$EXPECTED_ACCOUNT" ]; then
  echo "refusing to run: credentials are for account $account, expected $EXPECTED_ACCOUNT" >&2
  exit 1
fi

instance_id="${SSM_INSTANCE_ID:-$(aws ec2 describe-instances \
  --filters Name=tag:Project,Values=stepwhere Name=tag:Env,Values=prod Name=tag:Role,Values=app \
            Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].InstanceId' --output text)}"

if [ -z "$instance_id" ] || [ "$(wc -w <<<"$instance_id")" -ne 1 ]; then
  echo "expected exactly one running prod app instance, found: '${instance_id}'" >&2
  exit 1
fi

# AWS-RunShellScript runs its commands with /bin/sh (dash on Ubuntu), which has
# no pipefail. Ship the script base64-encoded and run it under bash instead;
# that also avoids any quoting of the script itself.
encoded="$(printf '%s\n' "$script" | base64 | tr -d '\n')"
remote="echo $encoded | base64 -d | HOME=/root bash -euo pipefail"
parameters="$(jq -n --arg c "$remote" --arg t "$TIMEOUT_SECONDS" \
  '{commands: [$c], executionTimeout: [$t]}')"

command_id="$(aws ssm send-command \
  --instance-ids "$instance_id" \
  --document-name AWS-RunShellScript \
  --comment "ssm-run.sh by $(aws sts get-caller-identity --query Arn --output text | awk -F/ '{print $NF}')" \
  --parameters "$parameters" \
  --query Command.CommandId --output text)"

echo "ssm-run: command $command_id on $instance_id" >&2

deadline=$(( $(date +%s) + TIMEOUT_SECONDS + 60 ))
status="Pending"
while :; do
  status="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" \
    --query Status --output text 2>/dev/null || echo Pending)"
  case "$status" in
    Pending|InProgress|Delayed) ;;
    *) break ;;
  esac
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "ssm-run: timed out waiting for $command_id" >&2
    exit 1
  fi
  sleep 3
done

aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" \
  --query StandardOutputContent --output text
stderr="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" \
  --query StandardErrorContent --output text)"
[ -n "$stderr" ] && [ "$stderr" != "None" ] && printf '%s\n' "$stderr" >&2

code="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" \
  --query ResponseCode --output text)"
echo "ssm-run: $status (exit $code)" >&2
if [ "$status" != "Success" ]; then
  case "$code" in ''|0|-1|None) exit 1 ;; *) exit "$code" ;; esac
fi
