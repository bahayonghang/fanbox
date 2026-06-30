# 长期演进(签名-release channel-ConPTY-上游PR)

> 父任务：`06-29-windows-port` ｜ 阶段三 ｜ 路线追踪型任务（非 MVP 阻塞）

## Goal

承载 Windows 移植的长期演进项：代码签名/SmartScreen、独立 Windows release channel 版本号策略、ConPTY 专项稳定性、把平台抽象层 PR 回上游。本任务为路线追踪，不阻塞父任务"MVP 可用"里程碑，且暂不作为 `task.py start` 的实施入口；各项成熟后可拆为独立可执行子任务。

## Background

- 来源 `ref/windows_port.md` §5 阶段三 + §8 待验证事项。
- 依赖阶段一/二落地后才有意义（有产物才谈签名/channel；有 adapter 才谈上游 PR）。

## Requirements（路线项，逐项成熟后细化）

- **L1 ConPTY 专项**：PowerShell、cmd、Git Bash、Claude、Codex 在 node-pty/ConPTY 下基本交互稳定（父 design.md §8 列为变量）。
- **L2 Windows 签名 + SmartScreen**：安装包签名可验证，降低安装阻力（证书成本/信誉积累）。
- **L3 独立 Windows release channel**：版本号策略如 `v2.3.3-win.1`，清楚对应上游 tag。
- **L4 上游 PR**：把"不破坏 macOS"的平台抽象层 PR 回 `alchaincyf/fanbox`，降低 fork 长期维护成本。
- **L5 待验证项跟踪**：Codex Windows 稳定性、Claude 凭据路径、社区 ports 质量、快捷键 `⌘→Ctrl`（`public/app.js`）。

## 启动门（路线追踪任务）

- 本任务保持 `planning` 状态，直到阶段一/二和父任务 MVP 集成评审完成。
- 不直接在本任务内实现签名、release channel、ConPTY 或上游 PR。
- 任一路线项准备实施时，先从本任务拆出新的独立可执行子任务，并为该子任务补 `prd.md` / `design.md` / `implement.md`。

## Acceptance Criteria（里程碑级，非本轮）

- [ ] L1：四类 shell + 两类 agent 在 Windows 终端基本交互稳定（手动验证清单）。
- [ ] L2：发布的安装包签名可验证。
- [ ] L3：Windows release 版本号能明确对应上游 tag。
- [ ] L4：上游至少接受"不破坏 macOS"的抽象层（或明确不接受，归档结论）。

## Out of Scope

- 本轮不实现；仅登记路线。各项启动前单独拆任务并补 design/implement。

## Notes

阶段一/二完成后再逐项激活。ConPTY 冒烟（L1 基础部分）可在 C2 顺带覆盖。

## 路线拆分记录（2026-06-30）

- L1 基础部分已拆为 `06-30-win-conpty-smoke` 并归档：Windows ConPTY 自动冒烟覆盖 PowerShell、cmd、可选 Git Bash 与 agent launch 静态契约。
- L3 已拆为 `06-30-06-30-win-release-versioning` 并归档：Windows release tag / wizard / update 通道版本策略已落地。
- L2 签名/SmartScreen、L4 上游 PR 与 L5 中未成熟项不阻塞父任务 MVP 集成评审；后续实施时按启动门拆独立任务。
