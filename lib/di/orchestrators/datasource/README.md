# DataSource Orchestrator 拆分说明

## 概述

原 `datasource.orchestrator.ts` (757 行) 已拆分为 4 个职责单一的子服务 + 1 个聚合类。

## 文件结构

### 子服务 (datasource/ 目录)

1. **datasource-lifecycle.service.ts** (382 行)
   - 职责：数据源生命周期管理
   - 方法：
     - `createDataSource()` - 创建数据源
     - `updateDataSource()` - 更新数据源
     - `deleteDataSource()` - 删除数据源
     - `rollbackDataSourceCreation()` - 回滚创建（私有方法）

2. **datasource-connection.service.ts** (82 行)
   - 职责：数据源连接管理
   - 方法：
     - `testConnection()` - 测试数据源连接

3. **datasource-sync.service.ts** (97 行)
   - 职责：数据源元数据同步
   - 方法：
     - `syncMetadata()` - 同步数据源元数据

4. **datasource-query.service.ts** (135 行)
   - 职责：数据源查询操作
   - 方法：
     - `listDataSources()` - 获取数据源列表
     - `getDataSource()` - 获取数据源详情

### 聚合类

**datasource.orchestrator.ts** (275 行)
- 职责：统一入口点，保持向后兼容
- 所有方法委托给相应子服务执行
- 依赖注入 4 个子服务

## DI 配置

### tokens.ts
新增 4 个 Token：
- `DataSourceLifecycleService`
- `DataSourceConnectionService`
- `DataSourceSyncService`
- `DataSourceQueryService`

### setup.ts
注册顺序：
1. 先注册 4 个子服务
2. 再注册聚合类 `DataSourceOrchestrator`

## 优势

1. **单一职责**: 每个服务职责清晰，易于维护
2. **可测试性**: 子服务可独立测试
3. **向后兼容**: 原 API 保持不变
4. **代码规模**: 所有文件 < 500 行

## 使用示例

```typescript
// 直接使用聚合类（推荐，保持兼容）
const orchestrator = getDataSourceOrchestrator();
await orchestrator.createDataSource(options);

// 或直接使用子服务（适合特定场景）
const lifecycleService = getService<DataSourceLifecycleService>(DI_TOKENS.DataSourceLifecycleService);
await lifecycleService.createDataSource(options);
```
