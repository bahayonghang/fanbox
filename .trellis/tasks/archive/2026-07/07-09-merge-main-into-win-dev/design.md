# Design

## Branch Strategy

Use the repository's actual mainline branch, `master`, as the source of truth. First refresh remote refs, fast-forward local `master` to `origin/master`, then switch back to `win-dev` and merge `origin/master`.

This avoids relying on a non-existent `main` branch and keeps the local source branch easy to verify.

## Conflict Resolution Constraints

Resolve conflicts against these priorities:

1. Preserve Windows packaging and CI behavior.
2. Preserve platform-specific update flow separation between upstream source updates and Windows release assets.
3. Preserve dynamic agent launcher contracts and related smoke-test expectations.
4. Prefer regenerated lockfiles over manual lockfile metadata edits when dependency files conflict.

## Safety Boundaries

- Do not include unrelated untracked files in the merge commit.
- Do not run publish-capable release commands.
- Do not delete runtime state or generated output.
- If validation reveals a real product or release risk, stop and report the blocker rather than masking the failure.

## Rollback

Before committing a merge result, `git merge --abort` is available if conflicts or validation show the merge path is wrong. After a completed merge commit, rollback would require an explicit user-approved revert or reset.
