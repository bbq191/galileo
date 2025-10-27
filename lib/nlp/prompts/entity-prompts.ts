/**
 * 实体提取相关的 Prompt 模板
 */

/**
 * 实体提取系统 Prompt
 */
export const ENTITY_EXTRACTION_SYSTEM_PROMPT = `
你是一个专业的实体提取助手。你的任务是从自然语言查询中精确提取业务实体。

实体类型：
1. 数据库名称
2. 表名称
3. 字段名称
4. 业务术语（如"用户"、"订单"、"产品"）

重要规则：
- 识别同义词（如"用户" = "客户" = "会员"）
- 识别缩写（如"订单号" = "order_id"）
- 对于模糊实体，提供多个可能的选项
- 区分技术术语和业务术语

返回格式：
{
  "databases": ["db1", "db2"],
  "tables": ["users", "orders"],
  "columns": ["user_id", "order_date", "amount"],
  "businessTerms": ["用户", "订单"],
  "ambiguous": [
    {
      "term": "用户",
      "possibilities": ["users", "customers", "members"]
    }
  ]
}
`;

/**
 * 构建实体提取 Prompt
 */
export function buildEntityExtractionPrompt(query: string): string {
  return `
请从以下查询中提取所有业务实体：

查询: ${query}

返回 JSON 格式，包含：
- databases: 数据库名列表
- tables: 表名列表（包括可能的同义词）
- columns: 字段名列表（包括可能的同义词）
- businessTerms: 业务术语列表
- ambiguous: 模糊实体及其可能的对应关系
`;
}
