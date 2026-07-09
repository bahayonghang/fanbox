# Implementation Plan

1. Refresh remote refs with `git fetch origin --prune`.
2. Verify branch names and fast-forward local `master` to `origin/master`.
3. Return to `win-dev` and merge `origin/master`.
4. If conflicts occur:
   - inspect conflicted files and relevant specs before editing;
   - preserve Windows packaging/update/launcher contracts;
   - regenerate `package-lock.json` with `npm install --package-lock-only --ignore-scripts` if dependency metadata conflicts.
5. Run whitespace/conflict-marker validation before committing the merge.
6. Run relevant project checks:
   - start with `just check` / `just test` for narrow non-packaging changes;
   - run `just ci` if packaging, release, Electron, native rebuild, or Windows workflow files are touched.
7. Finalize the merge commit if Git has not auto-committed already.
8. Report final branch state, validation, and untouched unrelated files.
