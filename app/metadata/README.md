# 元数据浏览页面

## 概述

元数据浏览页面提供直观的界面来浏览和查询数据库元数据，支持三级导航、全文搜索和详细信息展示。

## 文件结构

```
app/metadata/
├── README.md                         # 本文件
├── page.tsx                          # 主页面组件
└── components/
    ├── MetadataTree.tsx              # 元数据树组件
    ├── TableDetail.tsx               # 表详情组件
    └── ColumnList.tsx                # 字段列表组件
```

## 快速开始

### 访问页面

```
http://localhost:3000/metadata
```

### 前置条件

1. 至少添加一个数据源
2. 触发过一次元数据同步
3. 确保 API 端点可用

## 功能特性

### ✅ 已实现功能

- [x] 三级导航（数据源 → 数据库 → 表）
- [x] 元数据树形展示
- [x] 表详情查看
- [x] 字段列表展示
- [x] 字段详细信息展开
- [x] 全文搜索功能
- [x] AI 语义描述显示
- [x] 语义来源标注
- [x] 复制功能（表名、字段名、DDL）
- [x] 统计信息展示
- [x] 加载状态显示
- [x] 错误处理

### 📋 待实现功能

- [ ] 虚拟滚动（处理大量字段）
- [ ] 键盘快捷键
- [ ] 导出功能
- [ ] 字段对比
- [ ] 历史版本查看

## 组件说明

### page.tsx - 主页面组件

**职责**:
- 整体布局管理
- 数据源加载
- 选择状态管理
- 搜索功能实现
- 组件协调

**主要状态**:
```typescript
- dataSources: any[]              // 数据源列表
- selectedSource: number | null    // 选中的数据源 ID
- selectedDatabase: number | null  // 选中的数据库 ID
- selectedTable: any | null        // 选中的表对象
- searchQuery: string              // 搜索关键词
- searchResults: any | null        // 搜索结果
- loading: boolean                 // 加载状态
- error: string | null             // 错误信息
```

**主要方法**:
```typescript
- loadDataSources()         // 加载数据源列表
- handleSearch(query)       // 执行搜索
- handleSearchChange(e)     // 处理搜索输入
- handleTableSelect(table)  // 选择表
- handleClearSelection()    // 清除选择
```

### MetadataTree.tsx - 元数据树组件

**职责**:
- 树形结构展示
- 展开/折叠控制
- 懒加载数据
- 选中状态高亮

**Props**:
```typescript
interface MetadataTreeProps {
  dataSources: any[];                           // 数据源列表
  selectedSource: number | null;                // 选中的数据源
  selectedDatabase: number | null;              // 选中的数据库
  selectedTable: any | null;                    // 选中的表
  onSourceSelect: (sourceId: number) => void;   // 数据源选择回调
  onDatabaseSelect: (dbId: number) => void;     // 数据库选择回调
  onTableSelect: (table: any) => void;          // 表选择回调
}
```

**状态管理**:
```typescript
- databases: any[]                  // 当前数据源的数据库列表
- tables: any[]                     // 当前数据库的表列表
- expandedSources: Set<number>      // 已展开的数据源集合
- expandedDatabases: Set<number>    // 已展开的数据库集合
- loadingDatabases: boolean         // 数据库加载状态
- loadingTables: boolean            // 表加载状态
```

**交互逻辑**:
1. 点击数据源 → 加载数据库列表 → 展开/折叠
2. 点击数据库 → 加载表列表 → 展开/折叠
3. 点击表 → 触发父组件的 onTableSelect

### TableDetail.tsx - 表详情组件

**职责**:
- 展示表的详细信息
- 格式化显示数据
- 提供快速操作

**Props**:
```typescript
interface TableDetailProps {
  table: any;  // 表对象
}
```

**显示内容**:
- 基本信息（表名、注释、行数）
- AI 语义描述
- 详细信息（ID、数据库、时间等）
- 统计信息（字段数、主键数、关系数）
- 操作按钮（查看关系、复制表名）

**辅助方法**:
```typescript
- formatNumber(num)    // 格式化数字
- formatDate(date)     // 格式化日期
```

### ColumnList.tsx - 字段列表组件

**职责**:
- 展示字段列表
- 提供字段详情展开
- 显示字段统计
- 提供复制功能

**Props**:
```typescript
interface ColumnListProps {
  tableId: number;  // 表 ID
}
```

**状态管理**:
```typescript
- columns: any[]                    // 字段列表
- loading: boolean                  // 加载状态
- error: string | null              // 错误信息
- expandedColumn: number | null     // 展开的字段 ID
```

**功能特性**:
- 字段列表表格
- 字段统计卡片
- 字段详情展开/折叠
- AI 语义描述显示
- 复制字段名
- 复制 DDL

## 使用的 DaisyUI 组件

| 组件 | 用途 |
|------|------|
| navbar | 页面导航栏 |
| breadcrumbs | 面包屑导航 |
| card | 卡片容器 |
| input-group | 搜索输入组 |
| table | 数据表格 |
| badge | 状态标签 |
| alert | 提示信息 |
| stat / stats | 统计卡片 |
| btn | 按钮 |
| loading | 加载动画 |

## 数据流示例

### 浏览元数据流程

```
1. 用户访问页面
   ↓
2. loadDataSources() 加载数据源
   ↓
3. setDataSources(data)
   ↓
4. 自动选择第一个数据源
   ↓
5. setSelectedSource(firstId)
   ↓
6. MetadataTree 检测到 selectedSource 变化
   ↓
7. loadDatabases(selectedSource)
   ↓
8. setDatabases(data)
   ↓
9. 用户点击数据库
   ↓
10. onDatabaseSelect(databaseId)
   ↓
11. setSelectedDatabase(databaseId)
   ↓
12. loadTables(selectedDatabase)
   ↓
13. setTables(data)
   ↓
14. 用户点击表
   ↓
15. onTableSelect(table)
   ↓
16. setSelectedTable(table)
   ↓
17. TableDetail 显示表详情
   ↓
18. ColumnList 加载字段列表
   ↓
19. loadColumns(table.id)
   ↓
20. setColumns(data)
   ↓
21. 显示字段列表
```

### 搜索流程

```
1. 用户输入搜索关键词
   ↓
2. handleSearchChange(e)
   ↓
3. setSearchQuery(query)
   ↓
4. 防抖延迟 500ms
   ↓
5. handleSearch(query)
   ↓
6. fetch('/api/metadata/search?q=...&type=all')
   ↓
7. setSearchResults(data)
   ↓
8. 显示搜索结果
   ↓
9. 用户点击结果
   ↓
10. handleTableSelect(table) 或
    setSelectedDatabase(dbId)
   ↓
11. 清除搜索结果
   ↓
12. 显示对应的详情
```

## API 调用

### 获取数据源列表

```typescript
GET /api/datasources

Response:
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "生产环境数据库",
      "type": "mysql",
      ...
    }
  ]
}
```

### 获取数据库列表

```typescript
GET /api/metadata/databases?sourceId=1

Response:
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "databaseName": "shop_db",
      "semanticDescription": "电商系统核心数据库",
      ...
    }
  ]
}
```

### 获取表列表

```typescript
GET /api/metadata/tables?databaseId=1

Response:
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "tableName": "orders",
      "tableComment": "订单表",
      "rowCount": 10000,
      ...
    }
  ]
}
```

### 获取字段列表

```typescript
GET /api/metadata/columns?tableId=1

Response:
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "columnName": "id",
      "dataType": "INT",
      "columnType": "INT(11)",
      "isPrimaryKey": true,
      ...
    }
  ]
}
```

### 搜索元数据

```typescript
GET /api/metadata/search?q=user&type=all&sourceId=1

Response:
{
  "status": "success",
  "data": {
    "databases": [...],
    "tables": [...],
    "columns": [...]
  }
}
```

## 性能优化

### 已实现

- ✅ 懒加载（按需加载数据库、表、字段）
- ✅ 内存缓存（已加载的数据保存在状态中）
- ✅ 防抖搜索（500ms 延迟）
- ✅ 条件渲染（只渲染展开的节点）

### 待优化

- [ ] 虚拟滚动（字段列表）
- [ ] 分页加载（大量数据时）
- [ ] Service Worker 缓存
- [ ] 增量更新（WebSocket）

## 样式定制

### 自定义主题

在 `tailwind.config.js` 中配置 DaisyUI 主题：

```javascript
module.exports = {
  daisyui: {
    themes: ["light", "dark", "cupcake"],
  },
}
```

### 自定义颜色

```css
/* globals.css */
.metadata-tree-item:hover {
  @apply bg-base-200;
}

.selected-item {
  @apply bg-primary/10 border-l-4 border-primary;
}
```

## 故障排查

### 问题 1: 元数据树不显示

**可能原因**:
- 数据源未同步
- API 请求失败
- 数据格式错误

**解决方法**:
1. 打开浏览器开发者工具 → Network 标签
2. 检查 API 请求状态
3. 查看返回的数据格式
4. 检查控制台错误信息

### 问题 2: 搜索无结果

**可能原因**:
- 搜索关键词太短（< 2 个字符）
- 元数据未同步
- API 端点错误

**解决方法**:
1. 确保输入至少 2 个字符
2. 检查 `/api/metadata/search` 端点
3. 查看网络请求的响应

### 问题 3: 字段详情展开卡顿

**可能原因**:
- 字段数量过多
- DOM 渲染性能问题

**解决方法**:
1. 限制同时展开的字段数量
2. 实现虚拟滚动
3. 优化组件渲染逻辑

## 测试

### 手动测试清单

- [ ] 数据源列表正常加载
- [ ] 点击数据源展开数据库
- [ ] 点击数据库展开表
- [ ] 点击表显示详情
- [ ] 字段列表正常显示
- [ ] 展开字段详情
- [ ] 搜索功能正常
- [ ] 搜索结果可点击
- [ ] 复制功能正常
- [ ] 加载状态正常显示
- [ ] 错误提示正常显示
- [ ] 响应式布局正常

### 集成测试

参考 `__tests__/integration/` 目录

## 相关文档

- **使用指南**: [docs/guides/metadata-browser.md](../../docs/guides/metadata-browser.md)
- **API 文档**: [docs/api/reference.md](../../docs/api/reference.md)
- **数据源管理**: [../datasources/README.md](../datasources/README.md)

---

**最后更新**: 2025-01-20
**维护者**: Galileo Team
