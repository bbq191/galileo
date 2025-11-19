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
- **表名格式**：只返回表名本身，不要包含数据库名（例如：返回 "tb_chatroom_relation" 而不是 "db_live.tb_chatroom_relation"）
- 对于模糊的实体名称，提供多个可能的选项
- 对于时间表达式（"最近一个月"、"今年"、"2025年"），标准化为相对时间（如 "2025_year", "last_30_days"）
- 对于数字表达式（"TOP10"、"前5名"），提取为 LIMIT 条件
- **字段名规则**：**只返回用户明确提到的字段名，不确定的留空，不要猜测**
- **聚合维度规则**：
  - 对于"按月"、"按年"等时间维度，使用 "month"、"year" 等语义标识
  - 对于"每个XXX"、"按XXX统计"、"各XXX"，识别 XXX 对应的字段作为 groupBy
  - 例如："每个分类" → columns: ["classify_name"], groupBy: ["classify_name"]
  - 例如："每个用户" → columns: ["user_name"], groupBy: ["user_name"]
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
export function buildIntentPrompt(
  naturalLanguageQuery: string,
  availableTables?: Array<{ name: string; description: string; database: string }>
): string {
  // 构建可用表列表
  let tablesContext = '';
  if (availableTables && availableTables.length > 0) {
    const tablesList = availableTables
      .slice(0, 50) // 只展示前 50 个表，避免 token 过多
      .map(t => {
        const desc = t.description ? ` - ${t.description}` : '';
        return `  - ${t.database}.${t.name}${desc}`;
      })
      .join('\n');

    tablesContext = `

可用的数据库表（从这些表中选择最相关的）：
${tablesList}

**重要说明**：
1. 表名格式为 "database.table_name"，但在返回的 JSON 中，你应该只返回表名部分（table_name），不要包含数据库名
2. 例如：如果看到 "db_live.tb_chatroom_relation"，你应该返回 "tb_chatroom_relation"
3. 你必须从上述表名中选择，不要猜测或创造不存在的表名
4. 如果用户查询与任何表都不相关，请返回空的 tables 数组
`;
  }

  return `
请分析以下自然语言查询，并提取查询意图：

用户查询: ${naturalLanguageQuery}
${tablesContext}

请识别：
1. 查询类型（查询明细/统计聚合/对比分析）
2. 涉及的业务实体（从上述可用表中选择最相关的表名）
3. 查询条件（时间范围、过滤条件）
4. 聚合维度（按什么分组，如：按月、按年、按用户等）
5. 排序和限制条件
6. 是否需要跨表关联

**重要规则**：
- ⚠️ 字段名（columns）：**只提及用户明确指定的字段名，不要猜测**
- ⚠️ 聚合维度：如果用户说"按月"、"按年"，在 groupBy 中使用 ["month"]、["year"] 这样的语义标识
- ⚠️ 聚合字段：如果用户说"统计数量"但没指定具体字段，可以省略 column 字段，让 SQL 生成器自动选择

返回 JSON 格式：
{
  "type": "aggregate",
  "entities": {
    "tables": ["actual_table_name_from_list"],
    "columns": []  // 只包含用户明确提到的字段，不确定的留空
  },
  "conditions": {
    "timeRange": {
      "relative": "2025_year"  // 使用语义标识，如：2025_year, last_30_days, this_month
    },
    "orderBy": {
      "column": "month",  // 可以是派生字段，如 month, year 等
      "direction": "DESC"
    },
    "limit": 10
  },
  "aggregations": {
    "function": "COUNT",  // COUNT, SUM, AVG, MAX, MIN
    "column": "",  // 如果不确定，留空；COUNT(*) 的情况不需要指定
    "groupBy": ["month"]  // 可以是语义标识，如 month, year, date 等
  }
}

**示例1**：用户查询"查询2025年每月直播数量"
{
  "type": "aggregate",
  "entities": {
    "tables": ["tb_live_all_room"],
    "columns": []  // 没有明确的字段名
  },
  "conditions": {
    "timeRange": { "relative": "2025_year" }
  },
  "aggregations": {
    "function": "COUNT",
    "column": "",  // COUNT(*) 不需要指定字段
    "groupBy": ["month"]  // 按月分组
  }
}

**示例2**：用户查询"统计每个用户的订单总额"
{
  "type": "aggregate",
  "entities": {
    "tables": ["orders"],
    "columns": ["user_id", "amount"]  // 明确提到了用户和金额
  },
  "aggregations": {
    "function": "SUM",
    "column": "amount",
    "groupBy": ["user_id"]
  }
}

**示例3**：用户查询"统计每个分类的直播数量"
{
  "type": "aggregate",
  "entities": {
    "tables": ["tb_live_all_room"],
    "columns": ["classify_name"]  // "每个分类"说明需要用分类字段分组
  },
  "aggregations": {
    "function": "COUNT",
    "column": "",  // COUNT(*) 不需要指定字段
    "groupBy": ["classify_name"]  // 按分类分组
  }
}

**关键语义识别规则**：
- "每个XXX" → groupBy: ["XXX相关字段"]
- "按XXX统计" → groupBy: ["XXX相关字段"]
- "各XXX的" → groupBy: ["XXX相关字段"]
- "不同XXX" → groupBy: ["XXX相关字段"]
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
