<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Scope and Navigation

This file governs the whole repository. Nested `AGENTS.md` files may add narrower rules for their subtrees; system, developer, and direct user instructions still take priority.

Before broad grep or repo-wide search, read `./code_map.md` and use its routing notes and search anchors to choose targeted files.

## Build, Test, and Development Commands

- `npm install` - install dependencies after checkout or lockfile changes.
- `npm run app` - start the Electron desktop app directly.
- `just dev` - preferred local desktop launcher; on Windows it sets UTF-8 console encoding before `npm run app`.
- `just check` - run the current lightweight static checks.
- `just test` or `npm run test:platform` - run platform/unit smoke tests under `scripts/`.
- `just build` - run the platform build for the current OS.
- `just ci` - run checks, tests, and the platform build; this is the Windows CI gate in `.github/workflows/windows-build.yml`.
- `npm run rebuild` - rebuild `node-pty`; on Windows this includes the Spectre mitigation fallback.
- `npm run dist:win` - package Windows `.exe` and `.zip` artifacts without publishing.

## Safety Boundaries

- Treat FanBox as a local-file desktop tool. Be careful with code paths that read, write, move, trash, snapshot, or restore user files.
- Runtime user state lives under `~/.fanbox/`; do not delete or rewrite it during repo work unless the task explicitly targets migration or recovery.
- Do not edit generated or dependency outputs such as `dist/`, `build/`, `node_modules/`, or vendored runtime bundles under `public/vendor/` unless the task is explicitly about regenerating those assets.
- Release publishing uses GitHub Releases from the Windows workflow. Do not push tags, upload release assets, or run publish-capable `gh release` commands without explicit user approval.
- Avoid destructive git operations unless the user explicitly asks for them. Preserve unrelated worktree changes.

## Implementation Notes

- The backend is mostly `server.js` plus platform helpers in `server-platform.js` and `electron/platform/`.
- The desktop shell is Electron: `electron/main.js` owns app lifecycle, IPC, embedded terminal, update prompts, and the WeChat bridge.
- The frontend is vanilla JavaScript in `public/app.js`, `public/style.css`, and `public/index.html`; there is no React/Vue/TypeScript build step for app code.
- Before changing backend or frontend behavior, read the relevant `.trellis/spec/backend/` or `.trellis/spec/frontend/` index and any guideline files it references.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `bahayonghang/fanbox`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout: root `CONTEXT.md` plus root `docs/adr/` when those files exist. See `docs/agents/domain.md`.
