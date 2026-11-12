# 首次配置 notify-afu 工作流

- Task ID: 2026-11-12-notify-afu-setup
- 负责 bot: galileo
- 状态: pending
- 执行方: galileo（本机直接执行；Jarvis 明确要求在 alienware 上复制模板并验收后合并）
- 分支: chore/notify-afu（从最新 main 切出）
- 更新时间: 2026-11-12T14:37+08:00
- 引用: 无

## 当前状态
- 等待 vault 正本模板修复：已完成。正本已修好（before 不可用时改为和 origin/默认分支的 merge-base 做 diff），并已整文件替换进仓库。
- **待用户确认 push/merge**。本次只在分支上提交，不 push、不 merge。状态维持 pending。

## 需求原文
> （Jarvis 2026-11-12）【工作流优化 · 首次配置 notify-afu】用户要求给你的仓库**新建** `.github/workflows/notify-afu.yml`（目前没有）。
> 正本模板：`~/Documents/ikate/Projects/_templates/notify-afu.yml`，复制到上述路径即可。
> 要点：仅 done/blocked 或 `.agy.md` 改动才 POST；需要 Secrets `AFU_WEBHOOK_URL` / `AFU_WEBHOOK_TOKEN`——你不要写 Secret 值，在任务单结果里提醒用户从 Jarvis「任务单唤醒路由」面板复制 Webhook URL 和 key 填入。
> 请开任务单（建议 `2026-11-12-notify-afu-setup`），验收后 push 合并。完成后告诉用户任务单 ID、是否已合并、Secrets 是否还待填；不必回复 Jarvis。

## 输入
- 背景：`Projects/galileo/context.md`；工作流正本 `Projects/工作流.md`「唤醒配置 · A」。基于 origin/main `b593663`。
- 涉及文件：
  - `.github/workflows/notify-afu.yml`（新增后替换：以修复后的正本整文件覆盖）
  - `.dev/tasks/2026-11-12-notify-afu-setup.md`（新增：本任务单）

## 约束
- 不做：不写入任何 Secret 值；不改 AGENTS.md 中的 nextjs-agent-rules 块；不改业务代码；不读 `.env` / 密钥。
- 模板若有按仓库替换的占位（分支名、仓库名）才替换，并在结果中说明；没有则原样复制。
- 只在上面的分支工作；提交信息用中文，`chore(ci):` 前缀 + 正文，不加 Co-Authored-By。
- 风险点：无设备行为 / install.sh / 数据迁移；密钥只通过 GitHub Secrets 引用，不入库。

## 分步任务
1. [x] 确认工作区干净、默认分支为 main，从最新 main 切出 `chore/notify-afu`。
2. [x] 将 `~/Documents/ikate/Projects/_templates/notify-afu.yml` 原样复制到 `.github/workflows/notify-afu.yml`（含按修复后正本整文件替换）。
3. [x] 校验 YAML 语法与触发/Secret 语义，结论写入本单「结果」。
4. [ ] 用户确认后 push 并合并；此前状态维持 pending。

## 验收标准
- [x] `.github/workflows/notify-afu.yml` 与正本模板内容一致（sha256 核对，见结果）
- [x] YAML 可被解析；触发路径为 `.dev/tasks/**`；仅任务单状态变为 done/blocked 或 `.agy.md` 改动才 POST
- [x] before 不可用时改为与 origin/默认分支的 merge-base 做 diff，避免新分支首次 push 误发历史回执
- [x] 只引用 Secrets 名 `AFU_WEBHOOK_URL` / `AFU_WEBHOOK_TOKEN`，文件中无 Secret 值
- [x] 未改 AGENTS.md，未改业务代码，未把笔记内容写入仓库（仅工作流与任务单）
- [x] 「不做」的事确实没做
- [ ] 已 push 并合并到默认分支（待用户确认）

## 交付物
工作流与任务单提交到 `chore/notify-afu`；「结果」填好。push 与合并待用户确认。

## 给执行方的指令
```
由负责 bot 在本机按本任务单直接执行：复制修复后的正本模板、校验、填写结果；先提交到分支，不 push、不 merge，状态维持 pending，待用户确认后再 push/merge。
```

## 结果
- 执行方 / 开始–结束时间：galileo（alienware 本机）/ 2026-11-12T14:33+08:00–2026-11-12T14:37+08:00
- base..head：`b593663`..本分支最新提交（本提交为同步修复后正本）
- 提交：

| 步骤 | 提交号 | 文件 | 说明 |
|---|---|---|---|
| 复制工作流并开单 | `de402b8` | `.github/workflows/notify-afu.yml`、`.dev/tasks/2026-11-12-notify-afu-setup.md` | 当时复制的是修复前正本（新分支首次 push 会误发历史回执） |
| 回填提交号 | `c40a111` | `.dev/tasks/2026-11-12-notify-afu-setup.md` | 将 de402b8 写入结果 |
| 同步修复后正本 | （本提交） | `.github/workflows/notify-afu.yml`、`.dev/tasks/2026-11-12-notify-afu-setup.md` | 整文件替换为已修复正本，sha256 见下 |

- 正本核对：
  - 路径：`~/Documents/ikate/Projects/_templates/notify-afu.yml`
  - sha256：`2c3f9ea80688adfb0c14772cb91fed985f31806e564841c5cbebfac060dbd206`（以 `2c3f9ea8` 开头、以 `d206` 结尾）
  - 仓库内 `.github/workflows/notify-afu.yml` 的 sha256 与正本一致；`cmp` 字节级相同；无按仓库替换的占位。
- 测试：

| 命令 | 通过 / 失败 / 未跑 | 摘要 |
|---|---|---|
| `sha256sum` 正本与仓库文件 | 通过 | 均为 `2c3f9ea80688adfb0c14772cb91fed985f31806e564841c5cbebfac060dbd206` |
| `cmp` 模板与目标文件 | 通过 | 字节级完全一致 |
| `python3` + PyYAML `safe_load`（CPython 3.14.9 + PyYAML 6.0.3） | 通过 | 文档可解析。注意：PyYAML 1.1 会把键 `on` 读成布尔 `True`，这是已知限制，不影响 GitHub Actions 自己的解析 |
| 语义核对：`on.push.branches=['**']`，`paths=['.dev/tasks/**']`；脚本按状态 done/blocked 或 `*.agy.md` 才 keep；`if: steps.diff.outputs.paths != '[]'` 才 POST；`secrets.AFU_WEBHOOK_URL` / `secrets.AFU_WEBHOOK_TOKEN`；未配置则跳过且 exit 0 | 通过 | 与工作流.md「唤醒配置 · A」及模板注释一致 |
| 语义核对：before 为空 / 全 0 / 对象不存在时，fetch origin/默认分支并取 merge-base 再 diff；拿不到才退回全量 ls-tree | 通过 | 对应正本修复点 |
| 确认文件中无 Secret 值、无仓库/分支名占位需要替换 | 通过 | 仓库与分支使用 `github.repository` / `github.ref_name`；默认分支名使用 `github.event.repository.default_branch` |
| `actionlint` | 未跑 | 本机未安装 |
| `gh secret list` | 通过（空列表） | 仓库 `bbq191/galileo` 尚无 Secrets，`AFU_WEBHOOK_URL` / `AFU_WEBHOOK_TOKEN` 待填。只列名字，未读值 |

- 遇到的问题：
  - 14:33 首次复制后、提交前，vault 正本于 14:35 被更新；随后按叫停未再覆盖、未推默认分支。`de402b8` / 已推送的 `origin/chore/notify-afu`（`c40a111`）仍是修复前版本，本提交在本地分支上替换。
  - 本地 `main` 上曾有未推送的 merge `3f9b1da`（含修复前工作流）。本次未对其 push，也未再 merge。
- 偏离：执行方字段未使用模板里的 `opencode-local` / `box-agent`，因为用户要求负责 bot 在本机直接配置。
- 未完成：
  - 待用户确认后再 push / merge。
  - 仓库 Secrets `AFU_WEBHOOK_URL` / `AFU_WEBHOOK_TOKEN` 需用户从 Jarvis「任务单唤醒路由」面板复制 Webhook URL 和 key 后填入 GitHub 仓库 `bbq191/galileo` 的 Settings → Secrets and variables → Actions。不要把值写进仓库、任务单或脚本。未填之前工作流会跑，但会打印「未配置 AFU_WEBHOOK_* ，跳过」并成功结束，不会真正唤醒 Jarvis。

## 审查
- 验收：工作流已与修复后正本 sha256 一致，YAML 与语义核对通过。按指示状态维持 pending，不在此次 push / merge。
- 二审：尚未跑。vinci 如需补跑，可用：
```
agy --mode plan -p "按 Projects/_templates/review-checklist.md 的「二审」部分，审 galileo 分支 chore/notify-afu（main..HEAD）。输入：任务单 .dev/tasks/2026-11-12-notify-afu-setup.md（含需求原文和结果）、完整 diff。逐条给结论并附 路径:行号；未核实的标「未核实」；结论按 阻断 / 建议 / 线索 分档。" > .dev/tasks/2026-11-12-notify-afu-setup.agy.md
```
- 合并：未进行。待用户确认 push/merge。
