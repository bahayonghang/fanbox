# Merge main updates into win-dev

## Goal

Bring the latest upstream mainline changes into the local `win-dev` branch while preserving the Windows-specific development and publishability contracts.

The user referred to `main`, but this repository's actual upstream mainline is `master`: `origin/HEAD -> origin/master`, and neither `main` nor `origin/main` exists. This task therefore treats `origin/master` / local `master` as the source branch.

## Confirmed Facts

- Current working branch: `win-dev`.
- Current tracking branch: `origin/win-dev`.
- Upstream mainline: `master` / `origin/master`.
- Unrelated pre-existing untracked file: `2026-07-08-164955-command-messagelatex-thesis-zhcommand-message.txt`; do not include it in this task.
- The task directory `.trellis/tasks/07-09-merge-main-into-win-dev/` is Trellis workflow state for this merge.
- Release publishing is out of scope unless the user gives explicit approval.

## Requirements

- Fetch current remote refs before merging.
- Ensure local `master` matches `origin/master` before using it as the merge source.
- Merge `origin/master` into `win-dev`.
- If conflicts occur, resolve them in favor of preserving Windows build, packaging, update-channel, and launcher behavior.
- Preserve unrelated worktree changes and do not stage or commit unrelated files.
- Validate the final merge with the smallest meaningful gates, escalating to `just ci` if packaging or release-sensitive files are touched.

## Acceptance Criteria

- [ ] `win-dev` contains the latest `origin/master` changes.
- [ ] Any merge conflicts are resolved without weakening Windows publishability.
- [ ] `git diff --check` or `git diff --cached --check` reports no whitespace/conflict-marker issues before finalizing the merge.
- [ ] Relevant project checks pass; if packaging/release-sensitive files are affected, `just ci` is run or a blocker is reported.
- [ ] The unrelated untracked command-message file remains unmodified and untracked.
- [ ] Final status clearly reports branch state, merge commit/result, validation commands, and any remaining untracked unrelated files.

## Out of Scope

- Pushing `win-dev` unless explicitly requested after the local merge is verified.
- Publishing releases, pushing tags, or uploading release assets.
- Cleaning or deleting runtime state under `~/.fanbox/`.
- Editing generated output directories such as `dist/`, `build/`, or `node_modules/`.
