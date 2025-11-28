# Galileo 安全配置指南

> **作者**: xusy
> **更新时间**: 2025-11-25

本文档详细说明 Galileo 项目的安全配置和最佳实践。

---

## 目录

1. [安全概览](#安全概览)
2. [环境变量配置](#环境变量配置)
3. [JWT 认证配置](#jwt-认证配置)
4. [速率限制](#速率限制)
5. [代码混淆与压缩](#代码混淆与压缩)
6. [安全响应头](#安全响应头)
7. [数据加密](#数据加密)
8. [日志与监控](#日志与监控)
9. [部署安全检查清单](#部署安全检查清单)

---

## 安全概览

Galileo 实施了多层安全防护：

### 🔒 已实施的安全措施

- ✅ **代码混淆和压缩** - 防止源码泄露和逆向工程
- ✅ **JWT 认证** - 基于令牌的用户身份验证
- ✅ **速率限制** - 防止 API 滥用和 DoS 攻击
- ✅ **数据加密** - 敏感数据加密存储
- ✅ **安全响应头** - XSS、点击劫持等防护
- ✅ **日志审计** - 完整的操作日志记录
- ✅ **环境变量隔离** - 敏感配置与代码分离

### 🎯 适用场景

- ✅ 内网部署（企业内部系统）
- ✅ 公网部署（需配置 HTTPS + 防火墙）
- ✅ 混合部署（内外网隔离）

---

## 环境变量配置

### 1. 初始化环境变量

```bash
# 复制模板文件
cp .env.example .env

# 生成安全密钥
npm run security:generate-keys
```

### 2. 必须修改的配置项

⚠️ **生产环境部署前，必须修改以下配置：**

| 配置项 | 说明 | 生成方式 |
|--------|------|----------|
| `JWT_SECRET` | JWT 签名密钥 | `npm run security:generate-keys` |
| `DATABASE_ENCRYPTION_KEY` | 数据库加密密钥 | `npm run security:generate-keys` |
| `DATABASE_URL` | 数据库连接字符串 | 手动配置 |
| `REDIS_HOST` / `REDIS_PASSWORD` | Redis 配置 | 手动配置 |

### 3. 可选配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `ALLOWED_ORIGINS` | CORS 允许的域名 | `http://localhost:3000` |
| `API_KEY` | 外部系统访问密钥 | 无（可选） |
| `LOG_LEVEL` | 日志级别 | `info` |
| `MAX_REQUEST_SIZE` | 请求体大小限制 | 10MB |

---

## JWT 认证配置

### 1. 生成 JWT 密钥

```bash
# 方式 1: 使用项目脚本（推荐）
npm run security:generate-keys

# 方式 2: 手动生成
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. 配置 JWT 参数

在 `.env` 文件中配置：

```bash
# JWT 密钥（128 字符，512 位强度）
JWT_SECRET="your-generated-secret-key-here"

# Token 有效期
JWT_EXPIRES_IN="7d"          # Access Token: 7 天
JWT_REFRESH_EXPIRES_IN="30d" # Refresh Token: 30 天
```

### 3. JWT 使用示例

```typescript
import { generateToken, verifyToken } from '@/lib/auth/jwt-verifier';

// 生成 Token
const token = generateToken({
  userId: '123',
  role: UserRole.USER,
  username: 'alice',
});

// 验证 Token
const result = verifyToken(token);
if (result.success) {
  console.log('用户 ID:', result.payload?.userId);
}
```

### 4. Token 刷新机制

```typescript
import { refreshTokens } from '@/lib/auth/jwt-verifier';

// 刷新 Token
const newTokens = await refreshTokens(refreshToken);
if (newTokens) {
  // 返回新的 Access Token 和 Refresh Token
}
```

---

## 速率限制

### 1. 架构设计

Galileo 采用**双层速率限制**架构：

```
客户端请求
    ↓
[Middleware 层] ← 内存速率限制（快速第一道防线）
    ↓
[API Routes 层] ← Redis 速率限制（分布式，持久化）
    ↓
业务逻辑
```

### 2. 速率限制策略

| 端点类型 | 限制策略 | 说明 |
|----------|----------|------|
| `/api/query/execute` | 10 req/min | 查询执行（最昂贵） |
| `/api/metadata/sync` | 5 req/hour | 元数据同步 |
| `/api/ai/*` | 20 req/min | AI 相关接口 |
| 其他 API | 30 req/min | 通用 API |

### 3. Redis 配置

```bash
# 内部 Redis（推荐，适合生产环境）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0

# 或使用 Redis URL
REDIS_URL="redis://:password@localhost:6379"
```

### 4. 速率限制响应

当触发速率限制时，API 返回：

```json
{
  "error": "请求过于频繁，请稍后再试",
  "message": "您已超过 query 端点的速率限制。请在 60 秒后重试。",
  "retryAfter": 60
}
```

响应头：

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2025-11-25T10:30:00.000Z
Retry-After: 60
```

---

## 代码混淆与压缩

### 1. 构建配置

`next.config.mjs` 已配置：

```javascript
{
  // 禁用源码映射
  productionBrowserSourceMaps: false,

  // 移除 console
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // 启用压缩
  compress: true,

  // Webpack 优化
  webpack: (config) => {
    config.optimization.minimize = true;
    // ...
  }
}
```

### 2. 构建和验证

```bash
# 生产环境构建
NODE_ENV=production npm run build

# 验证混淆效果
ls -lh .next/static/chunks/
cat .next/static/chunks/main-*.js  # 应该看到压缩后的代码
```

### 3. 混淆效果

构建后的代码特征：
- ✅ 单行压缩（无换行）
- ✅ 变量名混淆（`a`, `b`, `c`）
- ✅ 移除注释和空格
- ✅ 无源码映射文件（`.map`）

---

## 安全响应头

### 1. 已配置的响应头

| 响应头 | 值 | 作用 |
|--------|-----|------|
| `X-Frame-Options` | `DENY` | 防止点击劫持 |
| `X-Content-Type-Options` | `nosniff` | 防止 MIME 类型嗅探 |
| `X-XSS-Protection` | `1; mode=block` | 启用 XSS 过滤 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 控制 Referrer 信息 |

### 2. 验证响应头

```bash
# 使用 curl 验证
curl -I http://localhost:3000/api/health

# 应该看到
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

### 3. 扩展配置（可选）

如需启用 CSP（内容安全策略），在 `.env` 中配置：

```bash
CSP_POLICY="default-src 'self'; script-src 'self' 'unsafe-eval'"
```

---

## 数据加密

### 1. 数据库密码加密

Galileo 使用 AES-256-CBC 加密存储外部数据源密码。

配置加密密钥：

```bash
# 生成加密密钥
npm run security:generate-keys

# 配置到 .env
DATABASE_ENCRYPTION_KEY="your-64-char-encryption-key"
```

### 2. 加密实现

```typescript
import crypto from 'crypto-js';

// 加密
const encrypted = crypto.AES.encrypt(
  plaintext,
  process.env.DATABASE_ENCRYPTION_KEY!
).toString();

// 解密
const decrypted = crypto.AES.decrypt(
  encrypted,
  process.env.DATABASE_ENCRYPTION_KEY!
).toString(crypto.enc.Utf8);
```

### 3. 安全建议

- ✅ 定期更换加密密钥（每 6-12 个月）
- ✅ 不同环境使用不同密钥
- ✅ 密钥妥善保管，不要提交到版本控制

---

## 日志与监控

### 1. 日志配置

```bash
# 日志级别
LOG_LEVEL="info"  # debug | info | warn | error

# 日志文件配置
ENABLE_FILE_LOGGING=true
LOG_FILE_MAX_SIZE=10        # MB
LOG_FILE_RETENTION_DAYS=30
```

### 2. 日志输出

日志自动保存到 `logs/` 目录：

```
logs/
├── app.log           # 当前日志
├── app.log.2025-11-25  # 按日期归档
└── error.log         # 错误日志
```

### 3. 安全事件日志

以下事件会被记录：

- ✅ JWT Token 验证失败
- ✅ 速率限制触发
- ✅ 数据库连接失败
- ✅ API 错误（5xx）
- ✅ 慢查询（超过阈值）

### 4. 监控示例

```bash
# 实时查看日志
tail -f logs/app.log

# 查看错误日志
grep "ERROR" logs/app.log

# 查看速率限制违规
grep "Rate Limit Violation" logs/app.log
```

---

## 部署安全检查清单

### 📋 部署前检查

在生产环境部署前，请确保完成以下检查：

#### 1. 环境变量 ✅

- [ ] 已生成并配置 `JWT_SECRET`
- [ ] 已生成并配置 `DATABASE_ENCRYPTION_KEY`
- [ ] 已配置生产数据库 `DATABASE_URL`
- [ ] 已配置 Redis（`REDIS_HOST` / `REDIS_PASSWORD`）
- [ ] 已配置 `ALLOWED_ORIGINS`（CORS）
- [ ] `NODE_ENV=production`

#### 2. 代码安全 ✅

- [ ] 已运行生产环境构建 (`npm run build`)
- [ ] 验证代码已混淆（检查 `.next/static/chunks/`）
- [ ] 无 `.map` 源码映射文件
- [ ] 已移除调试代码和 `console.log`

#### 3. 网络安全 ✅

- [ ] 已配置 HTTPS（使用 Let's Encrypt 或自签名证书）
- [ ] 已配置防火墙规则
- [ ] 已配置反向代理（Nginx / Apache）
- [ ] 已配置速率限制（Redis）

#### 4. 数据安全 ✅

- [ ] 数据库用户使用最小权限原则
- [ ] 敏感数据已加密存储
- [ ] 已配置数据库备份策略
- [ ] `.env` 文件不在版本控制中

#### 5. 日志与监控 ✅

- [ ] 已启用文件日志（`ENABLE_FILE_LOGGING=true`）
- [ ] 已配置日志轮转（`LOG_FILE_RETENTION_DAYS`）
- [ ] 已配置错误告警机制
- [ ] 已配置性能监控（可选）

#### 6. 依赖安全 ✅

- [ ] 已运行 `npm audit` 检查漏洞
- [ ] 已更新过期依赖
- [ ] 已检查第三方库安全性

### 📦 快速检查命令

```bash
# 一键检查
npm run security:check  # TODO: 创建此脚本

# 手动检查
npm audit
npm outdated
npx tsc --noEmit
npm run lint
```

---

## 安全最佳实践

### 🔐 密钥管理

1. **定期更换密钥**
   - JWT Secret: 每 3-6 个月
   - 数据库加密密钥: 每 6-12 个月
   - API 密钥: 每 6 个月

2. **密钥存储**
   - ✅ 使用环境变量
   - ✅ 使用密钥管理服务（AWS KMS / Azure Key Vault）
   - ❌ 不要硬编码在代码中
   - ❌ 不要提交到版本控制

3. **密钥传输**
   - ✅ 使用加密通道（HTTPS / SSH）
   - ✅ 使用密码管理器（1Password / LastPass）
   - ❌ 不要通过邮件 / 聊天软件传输

### 🛡️ API 安全

1. **认证与授权**
   - 所有敏感 API 必须验证 JWT Token
   - 实施基于角色的访问控制（RBAC）
   - 使用最小权限原则

2. **输入验证**
   - 验证所有用户输入
   - 使用 Zod 进行模式验证
   - 防止 SQL 注入（使用 Prisma 参数化查询）

3. **错误处理**
   - 不要在错误信息中泄露敏感信息
   - 记录详细错误日志（仅服务端）
   - 返回通用错误信息给客户端

### 🌐 网络安全

1. **HTTPS**
   - 生产环境强制使用 HTTPS
   - 配置 HSTS 头
   - 使用现代 TLS 版本（TLS 1.2+）

2. **防火墙**
   - 仅开放必要端口（443, 80）
   - 数据库端口不对外暴露
   - 使用 IP 白名单（如适用）

3. **DDoS 防护**
   - 使用 CDN（Cloudflare / AWS CloudFront）
   - 配置速率限制
   - 启用 IP 封禁机制

---

## 应急响应

### 🚨 密钥泄露处理

如果发现密钥泄露：

1. **立即更换密钥**
   ```bash
   npm run security:generate-keys
   # 更新 .env 文件
   ```

2. **撤销所有 Token**
   - 清空 Redis 缓存
   - 强制所有用户重新登录

3. **审查日志**
   - 检查是否有异常访问
   - 分析泄露影响范围

4. **通知相关方**
   - 通知运维团队
   - 必要时通知用户

### 🔍 安全事件排查

```bash
# 1. 查看最近的错误日志
tail -n 100 logs/error.log

# 2. 查看速率限制触发
grep "Rate Limit" logs/app.log | tail -n 50

# 3. 查看 JWT 验证失败
grep "JWT" logs/app.log | tail -n 50

# 4. 查看数据库异常
grep "DATABASE" logs/app.log | tail -n 50
```

---

## 参考资源

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Prisma Security](https://www.prisma.io/docs/concepts/components/prisma-client/security)

---

## 联系方式

如有安全问题或建议，请联系：

- **作者**: xusy
- **项目**: Galileo NLP-to-SQL System

---

**最后更新**: 2025-11-25
**版本**: 1.0.0
