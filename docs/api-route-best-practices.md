# API 路由最佳实践

## 问题背景

在构建过程中，Next.js 会加载所有 API 路由模块进行分析。如果路由使用了依赖注入（tsyringe）或外部服务（Redis、数据库），会导致：

1. ❌ `reflect-metadata` 错误
2. ❌ Redis/数据库连接错误
3. ❌ 构建失败或警告过多

## 解决方案：使用共享配置

### 方法 1：使用共享配置文件（推荐）

**优点**：
- ✅ 一行代码解决问题
- ✅ 统一管理所有 API 路由配置
- ✅ 避免重复代码

**示例：**

```typescript
/**
 * 任何 API 路由
 * app/api/xxx/route.ts
 */

// ✅ 推荐：导入共享配置
export { runtime, dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // ... 你的代码
}
```

### 方法 2：手动配置（不推荐）

```typescript
/**
 * ⚠️ 不推荐：每个文件都要写
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // ... 你的代码
}
```

## 需要使用共享配置的路由

所有符合以下条件之一的路由都应该使用共享配置：

- ✅ 使用了 `@/lib/di/*`（依赖注入）
- ✅ 使用了 `getService` 或 `getContainer`
- ✅ 直接或间接访问 Redis
- ✅ 直接或间接访问数据库（Prisma）
- ✅ 使用了任何需要外部服务的库

**简单判断**：如果你的路由导入了任何 `@/lib/*` 下的业务逻辑模块，就应该使用共享配置。

## 迁移指南

### 自动迁移（推荐）

运行以下命令查找所有需要迁移的路由：

```bash
# 查找使用 DI 的路由
grep -r "from '@/lib/di" app/api --include="*.ts" -l

# 查找使用 getService 的路由
grep -r "getService\|getContainer" app/api --include="*.ts" -l
```

### 手动迁移步骤

1. 打开路由文件
2. 如果有这些行，删除它们：
   ```typescript
   export const runtime = 'nodejs';
   export const dynamic = 'force-dynamic';
   ```
3. 在文件顶部添加：
   ```typescript
   export { runtime, dynamic } from '@/lib/api/route-config';
   ```

### 迁移示例

**修改前：**
```typescript
/**
 * 某个 API 路由
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/helpers/app-router';

export async function GET(request: NextRequest) {
  // ...
}
```

**修改后：**
```typescript
/**
 * 某个 API 路由
 */
export { runtime, dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/helpers/app-router';

export async function GET(request: NextRequest) {
  // ...
}
```

## 验证

修改后运行构建验证：

```bash
npm run build
```

应该看到所有 API 路由都标记为 `ƒ (Dynamic)`：

```
├ ƒ /api/your-route    0 B    0 B
```

## 未来新增路由

创建新的 API 路由时，直接使用共享配置：

```typescript
// app/api/new-feature/route.ts
export { runtime, dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Hello' });
}
```

---

*作者：xusy*
