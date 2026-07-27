---
name: keychain-validated-commit-push
description: Use after completing validated IFBA/IFBAPS key control repository updates when changes should be finalized with git status review, validation checks, secret hygiene checks, commit creation, and push to the configured remote branch. Also use when the user asks to commit, push, save validated updates, or keep the remote up to date after work.
---

# Keychain Validated Commit Push

Use this skill to close completed repository work with validation, commit, and
push.

Always obey `AGENTS.md` first.
Use `keychain-secrets-runtime` as well when the diff touches env handling,
Firebase Admin, PM2, deploy scripts, `.gitignore`, or anything that could expose
credentials.

## Default Rule

After a validated update in this repository, commit and push the change unless
the user explicitly says not to commit, not to push, or to leave the work local.

## Workflow

1. Run `git status --short --branch` and inspect the complete changed-file set.
2. Review the staged or unstaged diff enough to describe what will be committed.
3. Run validation appropriate to the changed files.
4. Always run `git diff --check` before commit.
5. Run the secret hygiene check before commit:

```bash
git ls-files | rg '(^|/)(\.env|\.env\..*|.*firebase-adminsdk.*\.json|service-account.*\.json|.*\.pem|.*\.key|.*\.log)$'
```

6. If the secret check prints tracked files, stop and inspect before committing.
7. Stage only intended repository files with `git add`.
8. Commit with a concise imperative message.
9. Push to the configured upstream with `git push`.
10. Confirm final state with `git status --short --branch`.

## Validation Selection

- Documentation or skill-only changes: run `git diff --check`; run the skill
  validator when skills changed and the validator is available.
- Backend changes: run backend typecheck/tests/lint/build commands once they
  exist.
- Frontend changes: run frontend typecheck/tests/lint/build commands once they
  exist.
- Runtime, deploy, or secret-adjacent changes: include the checks from
  `keychain-secrets-runtime`.

When no project-specific validation command exists yet, state that clearly and
use the available structural checks.

## Safety

Do not commit external secret files from `/etc/keychain-ifbaps`.
Do not print real env values or service-account JSON while validating.
Do not amend, squash, rebase, or force-push unless the user explicitly asks.
