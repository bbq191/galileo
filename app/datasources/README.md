# 数据源管理页面

## 概述

数据源管理页面是 Galileo 系统的核心模块，用于管理所有数据库连接配置。

## 文件结构

```
app/datasources/
├── README.md                          # 本文件
├── page.tsx                           # 主页面组件
└── components/
    ├── DataSourceList.tsx             # 数据源列表组件
    └── DataSourceForm.tsx             # 数据源表单组件
```

## 快速开始

### 1. 启动开发服务器

```bash
npm run dev
```

### 2. 访问页面

在浏览器中打开: `http://localhost:3000/datasources`

## 功能特性

### ✅ 已实现功能

- [x] 数据源列表展示
- [x] 添加数据源
- [x] 编辑数据源
- [x] 删除数据源
- [x] 测试数据库连接
- [x] 触发元数据同步
- [x] 查看同步状态
- [x] 加载状态显示
- [x] 错误处理
- [x] 空状态提示

### 📋 待实现功能

- [ ] 批量操作
- [ ] 搜索和过滤
- [ ] 数据源分组
- [ ] 导入/导出配置

## 组件说明

### page.tsx - 主页面组件

**职责**:
- 数据加载和状态管理
- 事件处理（添加、编辑、删除等）
- 页面布局和导航

**主要状态**:
- `dataSources`: 数据源列表
- `loading`: 加载状态
- `error`: 错误信息
- `showModal`: 模态框显示状态
- `editingDataSource`: 正在编辑的数据源

**主要方法**:
- `loadDataSources()`: 加载数据源列表
- `handleAdd()`: 打开添加模态框
- `handleEdit()`: 打开编辑模态框
- `handleDelete()`: 删除数据源
- `handleTestConnection()`: 测试连接
- `handleSync()`: 触发同步

### DataSourceList.tsx - 列表组件

**职责**:
- 展示数据源列表
- 状态和时间格式化
- 操作按钮渲染

**主要功能**:
- 状态徽章显示
- 相对时间计算
- 连接状态提示
- 操作按钮事件触发

### DataSourceForm.tsx - 表单组件

**职责**:
- 数据源表单渲染
- 表单验证
- 数据提交

**主要功能**:
- 支持添加/编辑模式
- 表单字段验证
- 密码加密处理
- 数据库列表解析
- 自动端口调整

## 使用的技术

### 前端框架
- **Next.js 14**: React 框架，使用 App Router
- **React 18**: UI 库
- **TypeScript**: 类型安全

### UI 组件库
- **DaisyUI**: Tailwind CSS 组件库
- **Tailwind CSS**: 实用工具优先的 CSS 框架

### 状态管理
- **React Hooks**: useState, useEffect

### API 通信
- **Fetch API**: HTTP 请求

## API 端点

| 功能 | 方法 | 端点 |
|------|------|------|
| 获取列表 | GET | `/api/datasources` |
| 创建 | POST | `/api/datasources` |
| 更新 | PUT | `/api/datasources/:id` |
| 删除 | DELETE | `/api/datasources/:id` |
| 测试连接 | POST | `/api/datasources/:id/test` |
| 触发同步 | POST | `/api/datasources/:id/sync` |

## 开发指南

### 添加新功能

1. 在 `page.tsx` 中添加状态和处理函数
2. 在对应的组件中添加 UI 元素
3. 实现 API 调用
4. 添加错误处理
5. 更新文档

### 修改样式

使用 DaisyUI 和 Tailwind CSS 类：

```tsx
// 主色按钮
<button className="btn btn-primary">...</button>

// 成功徽章
<div className="badge badge-success">...</div>

// 卡片容器
<div className="card bg-base-100 shadow-xl">...</div>
```

### 调试技巧

1. **检查网络请求**: 使用浏览器开发者工具的 Network 标签
2. **查看状态**: 在组件中添加 `console.log` 输出状态
3. **React DevTools**: 安装 React DevTools 扩展查看组件树

## 测试

### 手动测试

1. **测试添加功能**:
   ```
   1. 点击"添加数据源"
   2. 填写表单
   3. 点击"创建"
   4. 验证列表中出现新数据源
   ```

2. **测试编辑功能**:
   ```
   1. 点击某个数据源的"编辑"按钮
   2. 修改信息
   3. 点击"保存"
   4. 验证信息已更新
   ```

3. **测试删除功能**:
   ```
   1. 点击某个数据源的"删除"按钮
   2. 在确认对话框中点击"确定"
   3. 验证数据源已从列表中移除
   ```

4. **测试连接功能**:
   ```
   1. 点击"测试连接"按钮
   2. 查看弹出的结果提示
   ```

5. **测试同步功能**:
   ```
   1. 点击"同步"按钮
   2. 查看同步任务是否触发
   3. 检查"最后同步"时间是否更新
   ```

### 集成测试

参考 `__tests__/integration/` 目录下的测试文件

## 常见问题

### Q1: 页面显示空白？

**检查**:
1. 开发服务器是否正常运行
2. API 端点是否可访问
3. 浏览器控制台是否有错误

### Q2: 数据不刷新？

**解决方法**:
1. 检查 `loadDataSources()` 是否被调用
2. 检查 API 响应是否正确
3. 检查状态更新逻辑

### Q3: 表单提交失败？

**排查**:
1. 检查必填字段是否填写
2. 检查 API 端点是否正确
3. 查看网络请求的错误信息

### Q4: 样式不生效？

**解决方法**:
1. 确认 DaisyUI 已正确安装
2. 检查 `tailwind.config.js` 配置
3. 确认 `globals.css` 已导入

## 性能优化

### 已实现的优化

- ✅ 组件化设计，减少重复渲染
- ✅ 使用 `useState` 和 `useEffect` 管理状态
- ✅ 错误边界处理
- ✅ 加载状态反馈

### 可优化项

- [ ] 虚拟滚动（处理大量数据）
- [ ] 防抖/节流（搜索输入）
- [ ] 缓存数据源列表
- [ ] 懒加载组件

## 相关文档

- **使用指南**: [docs/guides/datasource-management.md](../../docs/guides/datasource-management.md)
- **API 文档**: [docs/api/reference.md](../../docs/api/reference.md)
- **完成报告**: [docs/planning/summaries/week5-datasource-page.md](../../docs/planning/summaries/week5-datasource-page.md)

## 贡献指南

### 提交代码前

1. 确保代码遵循项目规范
2. 添加必要的类型定义
3. 更新相关文档
4. 手动测试所有功能

### 提交信息格式

```
feat: 添加批量删除功能

- 实现批量选择
- 实现批量删除 API 调用
- 添加确认对话框
```

## 联系方式

如有问题或建议，请提交 Issue 或联系开发团队。

---

**最后更新**: 2025-01-20
**维护者**: Galileo Team
