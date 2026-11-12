# Agent guidelines

## Subagent model selection

When delegating work to subagents, pick the model by the kind of thinking the task needs:

| Model | Use for | Examples |
| --- | --- | --- |
| **Haiku** | Low-intelligence, mechanical work | File/code search, grep sweeps, listing usages, renames, formatting, boilerplate, running commands and summarizing output |
| **Sonnet** | Well-defined implementation with a clear spec | Implementing a planned endpoint or screen, writing tests for specified behavior, migrations from an agreed schema, focused bug fixes, code review against a checklist |
| **Opus** | Planning, UI/UX, and product decisions | Architecture and implementation plans, schema/API design, billing and pricing logic, UX flows and visual design, trade-off calls, anything ambiguous or user-facing |

Rules of thumb:

- Default down, not up: if the task is fully specified and mechanical, use Haiku.
- If a Haiku or Sonnet task turns out to need judgment (unclear requirements, product trade-offs, design choices), stop and escalate to Opus instead of guessing.
- Planning, UI/UX, and product decisions are always Opus — never delegate them to a smaller model.

## Infrastructure changes are human-only

Agents write and review infrastructure code (`infra/`, `ansible/`, OpenTofu, Ansible, Makefiles, deploy scripts) but **never run anything that reads state from or changes real infrastructure**. A human runs every plan and apply by hand.

Never run:

- `tofu` / `terraform`: `init` against a real backend, `plan`, `apply`, `destroy`, `import`, `refresh`, `taint`, `untaint`, `state …`, `force-unlock`, `output` against real state.
- `ansible-playbook` / `ansible` against any real host, including `--check` runs.
- `make` targets that wrap any of those (`make plan`, `make apply`, `make host-check`, `make host-apply`, `make db-tunnel`, `make shell`, …).
- Mutating AWS calls by any route (CLI, SDK, console automation): anything that creates, updates, deletes, puts, attaches, starts, stops, reboots or sends commands (e.g. `ssm send-command`).
- Deploys, or anything else that changes a running environment.

Allowed:

- Editing `.tf` files, docs and scripts.
- Offline checks: `tofu fmt`, `tofu init -backend=false`, `tofu validate`, `tofu providers lock`, `ansible-lint`, `ansible-playbook --syntax-check`.
- Read-only AWS calls (`sts get-caller-identity`, `describe-*`, `list-*`, `get-*`) only when the user explicitly asks for them.

When a change is ready, give the exact commands for the human to run (usually the `make` targets in `infra/`) and ask them to share the plan output if they want it reviewed.
