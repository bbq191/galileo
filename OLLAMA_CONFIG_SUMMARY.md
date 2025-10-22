# Ollama Deepseek 配置摘要

## ✅ 配置状态

您的 Galileo 项目已成功配置 Ollama Deepseek-r1:1.5b 模型！

## 📋 已完成的配置

### 1. 环境变量 (.env)

```bash
# Deepseek AI Configuration (使用本地 Ollama)
DEEPSEEK_API_KEY="ollama"
DEEPSEEK_API_URL="http://localhost:11434"
DEEPSEEK_MODEL="deepseek-r1:1.5b"
DEEPSEEK_TIMEOUT="60000"
DEEPSEEK_MAX_RETRIES="3"
DEEPSEEK_RETRY_DELAY="1000"

# AI 语义标注配置
SEMANTIC_ANNOTATION_ENABLED="true"
SEMANTIC_TEMPERATURE="0.3"
SEMANTIC_MAX_TOKENS="500"
SEMANTIC_TOP_P="0.9"

# AI 关系推断配置
AI_INFERENCE_ENABLED="true"
MIN_CONFIDENCE="0.7"
INFERENCE_TEMPERATURE="0.2"
INFERENCE_MAX_TOKENS="1000"
INFERENCE_TOP_P="0.9"

# 批量处理配置
BATCH_SIZE="10"
BATCH_DELAY="1000"
MAX_CONCURRENCY="3"
```

### 2. 核心代码

- ✅ **lib/ai/deepseek-client.ts**: 已支持 Ollama API
- ✅ **lib/ai/config.ts**: 已配置环境变量
- ✅ **lib/ai/types.ts**: 类型定义完整
- ✅ **lib/ai/__tests__/deepseek-client.test.ts**: 测试脚本就绪

### 3. Ollama 服务

- ✅ Ollama 服务运行中: `http://localhost:11434`
- ✅ 模型已下载: `deepseek-r1:1.5b` (1.1GB)
- ✅ 连接测试通过

## 🚀 快速使用

### 启动项目

```bash
# 确保 Ollama 服务运行
ollama serve

# 启动开发服务器
npm run dev
```

### 测试 AI 功能

项目中的 AI 客户端会自动连接到本地 Ollama：

```typescript
import { getDeepseekClient } from '@/lib/ai/deepseek-client';

const client = getDeepseekClient();
const response = await client.chat([
  {
    role: 'user',
    content: '你的问题',
  },
]);
```

### API 端点

以下 API 端点会使用 AI 功能：

- `/api/metadata/collect` - 元数据采集 (语义标注)
- `/api/metadata/relationships/infer` - 关系推断

## 📊 性能参数说明

### 为什么这样配置？

| 参数 | 值 | 说明 |
|------|-----|------|
| `DEEPSEEK_TIMEOUT` | 60000ms | 小模型推理较慢，给予充足时间 |
| `BATCH_SIZE` | 10 | 避免内存和 CPU 过载 |
| `MAX_CONCURRENCY` | 3 | 限制并发数，保证稳定性 |
| `SEMANTIC_TEMPERATURE` | 0.3 | 语义标注需要一致性 |
| `INFERENCE_TEMPERATURE` | 0.2 | 关系推断需要更高确定性 |

## 🔄 切换到官方 API

如果想使用官方 Deepseek API（生产环境推荐）：

```bash
# 在 .env 中修改
DEEPSEEK_API_KEY="your_actual_api_key"
DEEPSEEK_API_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"
DEEPSEEK_TIMEOUT="30000"

# 可以提高并发
BATCH_SIZE="50"
MAX_CONCURRENCY="10"
```

## 📚 相关文档

- [详细配置指南](./docs/ollama-setup.md)
- [项目 README](./README.md)
- [开发规范](./CLAUDE.md)

## 🐛 常见问题

### 1. Ollama 连接失败

```bash
# 检查服务
curl http://localhost:11434/api/tags

# 重启服务
ollama serve
```

### 2. 推理速度慢

- 这是正常的，1.5B 模型在 CPU 上推理需要时间
- 建议：减少 `max_tokens` 或升级到更大的模型

### 3. 响应为空

- 检查提示词是否清晰
- 尝试调整 `temperature` 值
- 增加 `max_tokens` 限制

## ✅ 下一步

现在您可以：

1. 运行完整测试: `npm run test:all`
2. 启动开发服务器: `npm run dev`
3. 开始使用 AI 功能进行元数据语义化和关系推断

---

**配置日期**: 2025-10-22
**Ollama 版本**: Latest
**模型**: deepseek-r1:1.5b
**状态**: ✅ 就绪
