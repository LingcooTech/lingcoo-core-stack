---
name: stack-server-onboarding
description: Prepare and enroll a Linux server into Lingcoo Stack's server resource pool, verify telemetry, and configure hosting readiness. Use for adding a platform-owned server, not customer deploy-token installation or application development.
---

Use the reviewed Stack checkout's `scripts/prepare-hosting-node.py` and [server onboarding reference](../../docs/server-onboarding.md). AI and manual operators use the same commands. Read the reference before making changes.

Confirm the target host from the user's authorization and inspect existing workloads. Never treat a cloud IP mentioned in documentation as permission to alter that machine. Existing authorization for onboarding covers routine setup; do not request it again. Install missing Docker/Compose/Python/systemd prerequisites according to the target distribution; preserve existing Docker storage, firewall rules and workloads.

Register the host in Stack's **服务器资源** page. Transfer the downloaded enrollment JSON through a private file (0600), never chat, command arguments, git, or logs. Run the preflight first. Use a fixed reviewed Stack commit, not an unpinned remote pipe-to-shell command.

Enroll initially as monitoring-only. Verify a fresh authenticated report in Stack: physical totals, available memory/disk and containers. Registration is not proof of online status. The script does not grant deployment readiness or enable allocation.

For hosting, configure the platform gateway, certificate receiver and issuer target, private registry access, and offsite backup using the reference. Verify application-specific deployment and recovery before enabling allocation. Do not copy platform-wide DNS credentials onto a worker. Preserve a healthy existing node on any failed setup; never repeatedly overwrite its config or recreate its Docker volumes.

Application resource declarations are owned by each version: aggregate CPU/memory/disk and explicit `serviceLimits` for new integrations. Report observed idle/peak usage separately. Never infer safe capacity from one idle sample or change instance limits to force placement. Disk is currently a scheduling budget, not an enforced per-volume quota.

Report node ID (not token), role, last report, readiness checks, missing prerequisites and whether allocation is enabled. On failure, diagnose the specific step; do not claim a monitored node is ready for customers.
