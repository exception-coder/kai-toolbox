## Context

Existing PowerShell and Bash supervisors own HTTP control, reload handoffs and auxiliary services. The PowerShell supervisor also has unrelated in-flight startup-performance changes. Preserve these implementations. Maven already embeds built frontend resources; Java owns Agent Sidecar lifecycle.

## Goals / Non-Goals

Goals: one declarative command catalog for Windows/macOS/Linux, foreground developer control, opt-in container dependencies and explicit compatibility paths.

Non-goals: no new Node supervisor, no automatic OS service installation, no destructive port cleanup, no transparent conversion of run-tools configuration, no claim of CentOS 7 support or all-platform runtime acceptance. Full legacy supervisor retirement requires separate restart/update parity testing.

## Decisions

Use Task v3 commands with platform-specific executable names only. Preparation builds the Sidecar and installs Maven modules without frontend work; normal packaging keeps Maven's embedded frontend pipeline. Separate foreground backend/frontend commands avoid hidden daemon ownership; combined dev uses Task parallel dependencies. The native development path disables automatic Git updates so a plain task runner does not masquerade as the legacy supervisor. Existing supervised commands remain available by explicit name on their supported platforms.

Phoenix is opt-in through Compose, bound to loopback and a separate persistent volume and host port, avoiding accidental adoption/deletion of the existing supervisor container. Image is pinned by a required operator-selected version/digest, not latest. Compose down does not remove data. Existing Langfuse Compose remains independently usable.

Sources: [Task guide](https://taskfile.dev/docs/guide), [Task schema](https://taskfile.dev/docs/reference/schema), [Docker Compose](https://docs.docker.com/compose/), [Spring Boot deployment](https://docs.spring.io/spring-boot/how-to/deployment/installing.html). Task orchestrates commands; it is not a Windows Service/systemd replacement. Long-lived native deployments should use platform service managers after Forge self-restart ownership is explicitly integrated.

## Risks / Trade-offs

Native development requires Java/Maven/Node/Git on PATH and explicit environment settings; old local config files are not silently sourced. Python voice services remain optional and are not automatically started. Test with Task dry runs, fixture commands, Compose validation and negative configuration cases; do not launch a second real Forge instance in this workspace. Verify Ctrl+C/process cleanup and actual backend starts on each target OS before retiring legacy paths.

Rollback: remove the new Taskfile and Compose entry; legacy launchers and running services are unchanged.
