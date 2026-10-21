# 上线检查清单

适用版本：`main` @ `4f52566`（包含 P0–P5、增量同步、分表接入、查询反馈 / 保存查询 / 问题推荐、Next.js 16、Prisma 7）。

按顺序逐项确认。标 **【必须】** 的项不处理会导致无法登录、接口报错或数据问题。
各项的详细说明见 `manual/operations.md`（下文用「运维 §N」指代章节）。

---

## 1. 上线前：环境

- [ ] **【必须】Node.js ≥ 20.19**（Prisma 7 的最低要求；同时满足 Next.js 16 的 20.9）
- [ ] **【必须】MySQL 8.x 或 MariaDB** 可达（元数据库），已备份（见第 3 节）
- [ ] Redis 可达（建议）。不可用时查询仍可用，但多实例不共享缓存，见运维 §4.2「Redis 不可用时的行为」
- [ ] AI 服务可达（Ollama 或 DeepSeek API，`DEEPSEEK_*`）。不可用时自然语言查询失败，编辑 SQL 后执行与保存的查询不受影响
- [ ] **【必须】服务器时区**：设置 `TZ`（如 `TZ=Asia/Shanghai`），保存查询的「每天 / 每周整点」按此时区计算

## 2. 上线前：环境变量

### 必须设置

| 变量 | 要求 | 不设置的后果 |
|---|---|---|
| `DATABASE_URL` | `mysql://用户:密码@主机:端口/库名`，特殊字符需 URL 编码 | 无法启动数据库访问 |
| `DATABASE_ENCRYPTION_KEY` | 32 字符，**上线后不能再改**（改了已保存的数据源密码无法解密） | 生产环境创建 / 读取数据源报错 |
| `JWT_SECRET` | ≥ 32 字符，不能是示例值；可用 `npm run security:generate-keys` 生成 | 所有需要登录的页面与接口返回 500 |
| `JWT_EXPIRES_IN` | `30m`（**旧 `.env` 中的 `7d` 必须改掉**） | 登出 / 禁用账号后旧 Token 长时间有效 |
| `ADMIN_API_KEY` | 随机长字符串 | 定时任务无法调用维护接口 |

### 按部署情况设置

| 变量 | 何时需要 |
|---|---|
| `AUTH_COOKIE_SECURE=false` | 生产环境通过纯 HTTP 访问（如内网无 HTTPS）时，否则无法登录 |
| `ADMIN_INITIAL_PASSWORD` | 首次 `db:seed` 前设置初始管理员密码（≥ 12 字符）；不设置时随机生成并只打印一次 |
| `DB_ALLOW_PUBLIC_KEY_RETRIEVAL=true` | MySQL 8 未启用 SSL 且连接报认证错误时（仅限内网） |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | 使用 Redis 时 |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | 多实例部署且希望请求限流跨实例共享时；不设置时每个实例各自内存限流 |

### 保持默认（灰度开关，上线后再按第 7 节逐步开启）

| 变量 | 上线默认值 |
|---|---|
| `SQL_VALIDATOR_MODE` | `shadow`（只记录，不拦截） |
| `ENABLE_BUSINESS_RULES` | `false` |
| `ENABLE_VERIFIED_QUERIES` | `false` |
| `ENABLE_SQL_PIPELINE` | `false`（开启后业务规则与已验证示例不生效） |

> `.env.example` 中的 `ALLOWED_ORIGINS` 目前没有被代码读取。跨站写请求的判断依据是请求的 `Origin` 与 `X-Forwarded-Host`（见第 4 节），不要依赖该变量。

## 3. 上线前：数据库

- [ ] **【必须】备份元数据库**（`mysqldump` 或快照）
- [ ] **【必须】同步表结构**：`npm run db:push`（项目使用 `db push`，没有 migrations 目录；该命令会同时生成 Prisma Client）
  - 本次新增 6 张表：`users`、`query_feedback`、`verified_queries`、`saved_queries`、`saved_query_runs`、`question_suggestions`；`query_audit_logs` 新增 `run_id`（唯一索引）、`question_hash`、`data_source_ids` 字段。只新增、不删除，已有数据不受影响
  - 如果 `db push` 提示会丢失数据，**停下来检查**，不要加 `--accept-data-loss`
- [ ] **【必须】首次部署创建管理员**：`npm run db:seed`。未设置 `ADMIN_INITIAL_PASSWORD` 时，**初始密码只在输出中出现一次**，立即保存
- [ ] 其他账号：`npm run user:create -- <用户名> --role user`
- [ ] 业务规则：`npm run db:seed:business-rules` 写入的是寿险 / 直播的示例数据，**开启 `ENABLE_BUSINESS_RULES` 前必须替换为实际业务**；不打算开启则不必执行

## 4. 上线前：构建、部署与网络

- [ ] 安装与构建：`npm ci`（不要加 `--production`，构建和 prisma CLI 需要开发依赖）→ `npm run db:push` → `npm run build`
- [ ] 启动：`npm start`（建议 PM2，见运维 §1.3）
- [ ] **【必须】反向代理透传 `X-Forwarded-Host`**，否则所有写请求被当作跨站请求返回 403（`拒绝跨站请求`）
- [ ] 使用 HTTPS；只能 HTTP 时设置 `AUTH_COOKIE_SECURE=false`
- [ ] 调用 API 的脚本 / 外部系统：改为在请求头带 `X-API-Key: $ADMIN_API_KEY`（鉴权上线后，无凭证的请求返回 401）

## 5. 上线前：定时任务

外部调度（crontab / k8s CronJob）调用，每个请求带 `X-API-Key`。命令示例见运维 §7。

| 接口 | 频率 |
|---|---|
| `POST /api/admin/maintenance/cleanup-history` | 每天一次 |
| `POST /api/admin/maintenance/sync-datasources` | 每天一次（按表结构变更频率） |
| `POST /api/admin/maintenance/run-saved-queries` | 每 10 分钟 |
| `POST /api/admin/maintenance/rebuild-suggestions` | 每天一次 |

- [ ] 同步任务配置失败告警（返回 207 时 `data.failed > 0`）

## 6. 上线后：冒烟测试（上线当天）

### 访问与鉴权

- [ ] `GET /api/health` 显示数据库、Redis、AI 服务状态正常
- [ ] 管理员登录成功；错误密码提示失败；未登录访问页面跳转登录页
- [ ] 普通用户访问 `/admin` 被跳转；看不到其他用户的查询历史
- [ ] 刷新页面、闲置 30 分钟后操作，不会被意外登出（Token 自动续期）

### 数据与查询

- [ ] 「数据源管理」：新建数据源 → 测试连接 → 同步元数据成功
- [ ] **已有的空密码数据源需要重新保存一次密码**（修复前保存的空密码是加密密文，仍会解密失败）
- [ ] 自然语言查询返回结果；预览 SQL 正常；编辑 SQL 后执行正常
- [ ] 结果下方点 👍 / 👎 成功；`/admin/feedback` 能看到反馈
- [ ] 保存查询 → 「我的查询」中立即执行成功；设置每天刷新后，下次执行时间符合 `TZ`
- [ ] 关系图谱、API 文档页（`/docs/api`）正常显示

### 定时任务

- [ ] 手工调用一次四个维护接口，均返回 `success: true`

## 7. 上线后：观察期（第 1–4 周）

| 时间 | 事项 | 判断依据 |
|---|---|---|
| 第 1 次同步 | 每张已有表会全量同步一次，并各记一条「表修改」，属预期 | — |
| 第 2 次同步起 | 同步结果中「结构未变化」应占绝大多数 | 若仍大量判定为变化，说明结构哈希有误报，需排查 |
| 上线首日 | 缓存 key 格式已变化，缓存全部失效，AI 调用量短期上升 | `/admin/ai-cost` |
| 1–2 周 | 统计 SQL 校验影子日志 `[SQLValidator]` 中 `wouldBlock=true` 的记录，确认误拦截可接受后，将 `SQL_VALIDATOR_MODE` 改为 `enforce` | 误拦截的应是确实不安全或不正确的 SQL |
| 持续 | `/admin/feedback` 审核反馈，优先处理「已纠正」类型 | — |
| 积累一批已验证查询后 | 开启 `ENABLE_VERIFIED_QUERIES`，观察日志 `[VerifiedQuery]`，对比开启前后的点踩比例 | — |
| 替换示例业务规则后 | 开启 `ENABLE_BUSINESS_RULES`，观察日志 `[BusinessRules]` 与 SQL 质量 | — |
| 分表组相关查询 | 抽查 AI 生成的 `UNION ALL` 是否覆盖全部分表、结果是否正确 | — |
| 2–4 周 | 推荐问题需要积累带用户 ID 的审计记录，初期为空属正常；在 `/admin/feedback`「推荐问题」中隐藏不宜公开的问题 | — |

## 8. 回滚预案

- 代码回滚：重新部署上一个可用版本的提交（需要同时使用该提交的 `package-lock.json` 重新 `npm ci` 与构建；Prisma 6 与 7 的配置不兼容，不能只回滚代码不回滚依赖）
- 表结构：本次只新增表和字段，旧版本代码可以在新表结构上运行，**不需要回滚表结构**；如需完全恢复，使用第 3 节的备份
- 灰度开关：`SQL_VALIDATOR_MODE`、`ENABLE_*` 出现问题时改回默认值并重启即可，无需回滚代码

## 9. 已知限制（上线时知悉即可）

- 不支持跨数据库实例的 JOIN（返回 `cross_source_unsupported`）
- 分表展开不按分表键裁剪；分表数超过 `SHARD_EXPAND_LIMIT`（默认 32）时只查询检索到的分表
- 没有用户管理界面，账号通过 `npm run user:create` 管理
- 鉴权上线前的审计记录没有用户 ID；历史上误报的元数据变更记录未清理
- 定时查询的超时只停止等待结果，数据库端的慢查询会继续执行
- Redis 不可用期间跳过的缓存失效不会补做，Redis 恢复后可调用 `POST /api/cache/clear` 清理
