# 首次配置 notify-afu 工作流

- Task ID: 2026-11-12-notify-afu-setup
- 负责 bot: galileo
- 状态: done
- 执行方: galileo（本机直接执行；Jarvis 明确要求在 alienware 上复制模板并验收后合并）
- 分支: chore/notify-afu（从最新 main 切出）
- 更新时间: 2026-11-12T14:34+08:00
- 引用: 无

## 需求原文
> （Jarvis 2026-11-12）【工作流优化 · 首次配置 notify-afu】用户要求给你的仓库**新建** `.github/workflows/notify-afu.yml`（目前没有）。
> 正本模板：`~/Documents/ikate/Projects/_templates/notify-afu.yml`，复制到上述路径即可。
> 要点：仅 done/blocked 或 `.agy.md` 改动才 POST；需要 Secrets `AFU_WEBHOOK_URL` / `AFU_WEBHOOK_TOKEN`——你不要写 Secret 值，在任务单结果里提醒用户从 Jarvis「任务单唤醒路由」面板复制 Webhook URL 和 key 填入。
> 请开任务单（建议 `2026-11-12-notify-afu-setup`），验收后 push 合并。完成后告诉用户任务单 ID、是否已合并、Secrets 是否还待填；不必回复 Jarvis。

## 输入
- 背景：`Projects/galileo/context.md`；工作流正本 `Projects/工作流.md`「唤醒配置 · A」。基于 origin/main `b593663`。
- 涉及文件：
  - `.github/workflows/notify-afu.yml`（新增：从库内正本模板原样复制）
  - `.dev/tasks/2026-11-12-notify-afu-setup.md`（新增：本任务单）

## 约束
- 不做：不写入任何 Secret 值；不改 AGENTS.md 中的 nextjs-agent-rules 块；不改业务代码；不读 `.env` / 密钥。
- 模板若有按仓库替换的占位（分支名、仓库名）才替换，并在结果中说明；没有则原样复制。
- 只在上面的分支工作；提交信息用中文，`chore(ci):` 前缀 + 正文，不加 Co-Authored-By。
- 风险点：无设备行为 / install.sh / 数据迁移；密钥只通过 GitHub Secrets 引用，不入库。

## 分步任务
1. [x] 确认工作区干净、默认分支为 main，从最新 main 切出 `chore/notify-afu`。
2. [x] 将 `~/Documents/ikate/Projects/_templates/notify-afu.yml` 原样复制到 `.github/workflows/notify-afu.yml`。
3. [x] 校验 YAML 语法与触发/Secret 语义，结论写入本单「结果」。
4. [x] 开本任务单，状态在验收后标为 done，并提醒用户补仓库 Secrets。

## 验收标准
- [x] `.github/workflows/notify-afu.yml` 与正本模板内容一致（或仅有已说明的占位替换）
- [x] YAML 可被解析；触发路径为 `.dev/tasks/**`；仅任务单状态变为 done/blocked 或 `.agy.md` 改动才 POST
- [x] 只引用 Secrets 名 `AFU_WEBHOOK_URL` / `AFU_WEBHOOK_TOKEN`，文件中无 Secret 值
- [x] 未改 AGENTS.md，未改业务代码，未把笔记内容写入仓库（仅工作流与任务单）
- [x] 「不做」的事确实没做

## 交付物
工作流与任务单提交到 `chore/notify-afu` 并推送；「结果」填好；负责 bot 验收后合并到 main。

## 给执行方的指令
```
由负责 bot 在本机按本任务单直接执行：复制模板、校验、填写结果、验收后 push 并合并到 main。
```

## 结果
- 执行方 / 开始–结束时间：galileo（alienware 本机）/ 2026-11-12T14:33+08:00–2026-11-12T14:34+08:00
- base..head：`b593663`..本分支提交（提交后回填 hash）
- 提交：

| 步骤 | 提交号 | 文件 | 说明 |
|---|---|---|---|
| 复制工作流并开单 |  | `.github/workflows/notify-afu.yml`、`.dev/tasks/2026-11-12-notify-afu-setup.md` | 模板原样复制，无占位替换 |

- 测试：

| 命令 | 通过 / 失败 / 未跑 | 摘要 |
|---|---|---|
| `cmp` 模板与目标文件 | 通过 | 字节级完全一致，无改动 |
| `python3 -c 'import yaml; yaml.safe_load(...)'`（CPython 3.14.9 + PyYAML 6.0.3） | 通过 | 文档可解析。注意：PyYAML 1.1 会把键 `on` 读成布尔 `True`，这是已知限制，不影响 GitHub Actions 自己的解析 |
| 语义核对：`on.push.branches=['**']`，`paths=['.dev/tasks/**']`；脚本按状态 done/blocked 或 `*.agy.md` 才 keep；`if: steps.diff.outputs.paths != '[]'` 才 POST；`secrets.AFU_WEBHOOK_URL` / `secrets.AFU_WEBHOOK_TOKEN`；未配置则跳过且 exit 0 | 通过 | 与工作流.md「唤醒配置 · A」及模板注释一致 |
| 确认文件中无 Secret 值、无仓库/分支名占位需要替换 | 通过 | 仓库与分支使用 `github.repository` / `github.ref_name`；默认分支 main，工作流本身监听全部分支 |
| `actionlint` | 未跑 | 本机未安装 |

- 遇到的问题：无
- 偏离：无。执行方字段未使用模板里的 `opencode-local` / `box-agent`，因为用户要求负责 bot 在本机直接配置。
- 未完成：仓库 Secrets `AFU_WEBHOOK_URL` / `AFU_WEBHOOK_TOKEN` 需用户从 Jarvis「任务单唤醒路由」面板复制 Webhook URL 和 key 后填入 GitHub 仓库 `bbq191/galileo` 的 Settings → Secrets and variables → Actions。不要把值写进仓库、任务单或脚本。未填之前工作流会跑，但会打印「未配置 AFU_WEBHOOK_* ，跳过」并成功结束，不会真正唤醒 Jarvis。

## 审查
- 验收：通过。亲自执行 `cmp` 与 PyYAML 解析，并核对触发条件、过滤逻辑和 Secret 引用；diff 仅含本工作流与本任务单，未改 AGENTS.md 与业务代码。
- 二审：尚未跑。此单只是复制已审定的正本模板，用户已要求验收后合并；vinci 如需补跑，可用：
```
agy --mode plan -p "按 Projects/_templates/review-checklist.md 的「二审」部分，审 galileo 分支 chore/notify-afu（main..HEAD）。输入：任务单 .dev/tasks/2026-11-12-notify-afu-setup.md（含需求原文和结果）、完整 diff。逐条给结论并附 路径:行号；未核实的标「未核实」；结论按 阻断 / 建议 / 线索 分档。" > .dev/tasks/2026-11-12-notify-afu-setup.agy.md
```
- 合并：待 push 后本地 `git merge --no-ff` 到 main，再回填合并提交号。不需要真机验收；因二审未跑，合并后状态保持 done，不改为 verified。
