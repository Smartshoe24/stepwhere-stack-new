# The only way humans run OpenTofu, Ansible and host commands for Stepwhere.
# Every target that talks to AWS first checks that the credentials belong to
# stepwhere-prod. Agents never run these targets (see AGENTS.md); they may run
# `make fmt-check` and `make validate`, which are offline.

SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help

ACCOUNT     := 045837342042
REGION      := ap-south-1
SSO_SESSION ?= Stepwhere
STACKS      := bootstrap account prod
ANSIBLE_DIR := ../ansible
DB_LOCAL_PORT ?= 15432

export AWS_PROFILE ?= stepwhere-prod
export AWS_REGION  := $(REGION)

STACK ?=
ANSIBLE_ARGS ?=

.PHONY: help login whoami check-stack fmt fmt-check validate init plan apply \
        bootstrap-first host-check host-apply db-tunnel shell run

help: ## List targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

login: ## Sign in to the Stepwhere SSO session
	aws sso login --sso-session $(SSO_SESSION)

whoami: ## Fail unless the credentials are for stepwhere-prod
	@account="$$(aws sts get-caller-identity --query Account --output text)"; \
	if [ "$$account" != "$(ACCOUNT)" ]; then \
	  echo "Refusing: AWS_PROFILE=$$AWS_PROFILE is account $$account, expected $(ACCOUNT)." >&2; exit 1; \
	fi; \
	echo "OK: $$AWS_PROFILE → $$account ($(REGION))"

check-stack:
	@case " $(STACKS) " in *" $(STACK) "*) ;; *) echo "Set STACK to one of: $(STACKS)" >&2; exit 1 ;; esac

fmt: ## Format all .tf files
	tofu fmt -recursive

fmt-check: ## Check formatting (offline)
	tofu fmt -check -recursive

validate: ## Validate every stack without touching AWS (offline)
	@for s in $(STACKS); do \
	  echo "== $$s"; \
	  tofu -chdir=$$s init -backend=false -input=false >/dev/null; \
	  tofu -chdir=$$s validate; \
	done

init: whoami check-stack ## tofu init against the S3 backend (STACK=…)
	tofu -chdir=$(STACK) init -input=false

plan: whoami check-stack ## Write a saved plan to <stack>/<stack>.tfplan (STACK=…)
	tofu -chdir=$(STACK) plan -input=false -out=$(STACK).tfplan

apply: whoami check-stack ## Apply the saved plan from `make plan` and delete it (STACK=…)
	@test -f $(STACK)/$(STACK).tfplan || { echo "No saved plan. Run: make plan STACK=$(STACK)" >&2; exit 1; }
	tofu -chdir=$(STACK) apply -input=false $(STACK).tfplan
	rm -f $(STACK)/$(STACK).tfplan

bootstrap-first: whoami ## One time only: create the state bucket, then move bootstrap state into it
	@if aws s3api head-bucket --bucket stepwhere-tofu-state-$(ACCOUNT)-$(REGION) 2>/dev/null; then \
	  echo "State bucket already exists; use make plan/apply STACK=bootstrap." >&2; exit 1; \
	fi
	cd bootstrap && mv backend.tf backend.tf.off && trap 'mv -f backend.tf.off backend.tf' EXIT && \
	  tofu init -input=false -reconfigure && \
	  tofu plan -input=false -out=bootstrap.tfplan && \
	  read -r -p "Apply this plan? Type yes: " answer && [ "$$answer" = "yes" ] && \
	  tofu apply -input=false bootstrap.tfplan && rm -f bootstrap.tfplan
	cd bootstrap && tofu init -input=false -migrate-state -force-copy && \
	  rm -f terraform.tfstate terraform.tfstate.backup && \
	  tofu plan -input=false -detailed-exitcode && echo "Bootstrap state now lives in S3; no changes pending."

host-check: whoami ## Ansible dry run with diff (extra flags: ANSIBLE_ARGS="-e stack_start=false")
	cd $(ANSIBLE_DIR) && ansible-playbook site.yml --check --diff $(ANSIBLE_ARGS)

host-apply: whoami ## Apply Ansible to the prod host (extra flags: ANSIBLE_ARGS=…)
	cd $(ANSIBLE_DIR) && ansible-playbook site.yml $(ANSIBLE_ARGS)

db-tunnel: whoami ## Forward localhost:15432 (DB_LOCAL_PORT) to RDS through the host
	@instance="$$(tofu -chdir=prod output -raw instance_id)"; \
	endpoint="$$(tofu -chdir=prod output -raw rds_endpoint)"; \
	echo "Postgres on 127.0.0.1:$(DB_LOCAL_PORT) → $$endpoint:5432 (Ctrl-C to stop)"; \
	aws ssm start-session --target "$$instance" \
	  --document-name AWS-StartPortForwardingSessionToRemoteHost \
	  --parameters "host=$$endpoint,portNumber=5432,localPortNumber=$(DB_LOCAL_PORT)"

shell: whoami ## Interactive shell on the host through SSM
	aws ssm start-session --target "$$(tofu -chdir=prod output -raw instance_id)"

# One-off command in a fresh server container, wrapped in `infisical run` like
# the image's CMD. CMD must not contain single quotes. Examples:
#   make run CMD="node dist/scripts/migrate.js"
#   make run CMD="node dist/scripts/provision-play-review.js" ENV="ALLOW_PLAY_REVIEW_PROVISION=true"
run: whoami ## Run CMD="…" (optional ENV="K=V …") in a one-off server container on the host
	@test -n "$(CMD)" || { echo 'Set CMD="…"' >&2; exit 1; }
	scripts/ssm-run.sh "cd /srv/stepwhere && docker compose run --rm $(foreach e,$(ENV),-e $(e)) server sh -c 'infisical run --env=\"\$$INFISICAL_ENV\" --projectId=\"\$$INFISICAL_PROJECT_ID\" --path=\"\$${INFISICAL_PATH:-/}\" -- $(CMD)'"
