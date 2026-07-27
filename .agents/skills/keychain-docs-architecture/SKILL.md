---
name: keychain-docs-architecture
description: Use when changing IFBA/IFBAPS key control documentation, AGENTS.md, README, architecture notes, project scope, pending decisions, repo-scoped skills, or durable records about security, authentication, audit, data ownership, Firebase, PM2, frontend, backend, or future SUAP integration.
---

# Keychain Docs Architecture

Use this skill for documentation and durable project-memory changes.
Always obey `AGENTS.md` first.

## Required Reading

- `AGENTS.md`
- `README.md`
- `docs/arquitetura.md`
- relevant `.agents/skills/*/SKILL.md` when changing skills

## Workflow

1. Keep `README.md` as the short project overview and onboarding document.
2. Keep `docs/arquitetura.md` as the source for architecture, structure, rules, roles, states, audit events, SUAP assumptions, and pending decisions.
3. Keep `AGENTS.md` focused on durable operational rules for future agents and contributors.
4. Avoid creating overlapping docs when the architecture file can absorb the decision.
5. Document decisions that affect security, authentication, authorization, audit, institutional data, Firebase, PM2, deploy, or SUAP integration.
6. Remove stale links when deleting or merging docs.
7. Do not include secret values, real service-account JSON, tokens, passwords, private keys, or sensitive personal data.

## Skill Maintenance

Repo-scoped skills live in `.agents/skills/<skill-name>/SKILL.md`.

Keep skills concise and specific. Create or update a skill only when the workflow is likely to recur in future Codex sessions.
