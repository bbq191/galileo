/**
 * 意图识别相关的 Prompt 模板
 */

/**
 * 系统 Prompt - 意图识别
 */
export const INTENT_SYSTEM_PROMPT = `
你是一个专业的 SQL 查询意图识别助手。你的任务是：

1. 准确理解用户的自然语言查询意图
2. 识别查询类型（明细查询、统计聚合、对比分析）
3. 提取关键实体（表名、字段名、数据库名）
4. 提取查询条件（时间范围、过滤条件、排序、限制）
5. 识别是否需要跨表关联

重要规则：
- 对于模糊的实体名称，提供多个可能的选项
- 对于时间表达式（"最近一个月"、"今年"），标准化为相对时间
- 对于数字表达式（"TOP10"、"前5名"），提取为 LIMIT 条件
- 始终返回标准的 JSON 格式

返回格式示例：
{
  "type": "aggregate",
  "confidence": 0.95,
  "entities": {
    "tables": ["orders", "products"],
    "columns": ["product_name", "total_amount"]
  },
  "conditions": {
    "timeRange": { "relative": "last_30_days" },
    "orderBy": { "column": "total_amount", "direction": "DESC" },
    "limit": 10
  },
  "aggregations": {
    "function": "SUM",
    "column": "amount",
    "groupBy": ["product_name"]
  },
  "ambiguities": []
}
`;

/**
 * 构建意图识别用户 Prompt
 */
export function buildIntentPrompt(naturalLanguageQuery: string): string {
  return `
请分析以下自然语言查询，并提取查询意图：

用户查询: ${naturalLanguageQuery}

请识别：
1. 查询类型（查询明细/统计聚合/对比分析）
2. 涉及的业务实体（数据库、表、字段）
3. 查询条件（时间范围、过滤条件）
4. 排序和限制条件
5. 是否需要跨表关联

返回 JSON 格式：
{
  "type": "aggregate",
  "entities": {
    "tables": ["orders", "products"],
    "columns": ["product_name", "order_amount"]
  },
  "conditions": {
    "timeRange": {
      "relative": "最近一个月"
    },
    "orderBy": {
      "column": "order_amount",
      "direction": "DESC"
    },
    "limit": 10
  },
  "aggregations": {
    "function": "SUM",
    "column": "amount",
    "groupBy": ["product_name"]
  }
}
`;
}

/**
 * 实体消歧 Prompt
 */
export function buildDisambiguationPrompt(
  entityHint: string,
  candidates: any[]
): string {
  const candidatesList = candidates
    .map(
      (c, idx) =>
        `${idx + 1}. ${c.tableName || c.columnName} - ${c.tableComment || c.columnComment || '无说明'}`
    )
    .join('\n');

  return `
用户提到了实体: "${entityHint}"

我们找到了以下可能匹配的实体：
${candidatesList}

根据上下文，请选择最匹配的实体编号（1-${candidates.length}）。
如果无法确定，返回 0。

返回 JSON 格式：
{
  "selectedIndex": 1,
  "confidence": 0.85,
  "reason": "选择理由"
}
`;
}
