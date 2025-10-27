/**
 * 自然语言处理相关的类型定义
 */

/**
 * 查询意图
 */
export interface QueryIntent {
  /** 查询类型 */
  type: 'select' | 'aggregate' | 'statistics' | 'comparison';

  /** 提取的实体 */
  entities: {
    /** 数据库名列表 */
    databases?: string[];
    /** 表名列表 */
    tables?: string[];
    /** 字段名列表 */
    columns?: string[];
  };

  /** 查询条件 */
  conditions: {
    /** 时间范围 */
    timeRange?: {
      start?: Date;
      end?: Date;
      /** 相对时间表达式，如"最近一个月"、"今年" */
      relative?: string;
    };
    /** 过滤条件 */
    filters?: Filter[];
    /** 排序条件 */
    orderBy?: {
      column: string;
      direction: 'ASC' | 'DESC';
    };
    /** 限制条数 */
    limit?: number;
  };

  /** 聚合信息 */
  aggregations?: {
    function: 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN';
    column: string;
    groupBy?: string[];
  };

  /** JOIN 信息 */
  joins?: {
    type: 'inner' | 'left' | 'right';
    tables: string[];
  };

  /** 置信度 */
  confidence?: number;

  /** 模糊性标记 */
  ambiguities?: string[];
}

/**
 * 过滤条件
 */
export interface Filter {
  /** 字段名 */
  column: string;
  /** 操作符 */
  operator: '=' | '>' | '<' | '>=' | '<=' | '!=' | 'LIKE' | 'IN' | 'BETWEEN';
  /** 值 */
  value: any;
}

/**
 * AI 返回的原始意图
 */
export interface RawIntent {
  type: string;
  confidence?: number;
  entities?: {
    databases?: string[];
    tables?: string[];
    columns?: string[];
  };
  conditions?: any;
  aggregations?: any;
  joins?: any;
  ambiguities?: string[];
}

/**
 * 时间范围解析结果
 */
export interface ParsedTimeRange {
  start?: Date;
  end?: Date;
  relative?: string;
  normalized?: string; // 标准化的相对时间，如 "last_30_days"
}

/**
 * 实体匹配结果
 */
export interface EntityMatch {
  /** 原始提示词 */
  hint: string;
  /** 匹配的实体 */
  matched: any;
  /** 匹配分数 */
  score: number;
  /** 匹配类型 */
  type: 'exact' | 'semantic' | 'fuzzy';
}
