/**
 * SQL 验证器类型定义
 */

import { MetadataContext } from '@/lib/metadata/retrieval/types';

/**
 * 验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  securityIssues: SecurityIssue[];
  optimizationSuggestions: OptimizationSuggestion[];
  estimatedCost: EstimatedCost;
}

/**
 * 验证错误
 */
export interface ValidationError {
  type: 'syntax' | 'semantic' | 'security' | 'permission';
  message: string;
  position?: {
    line: number;
    column: number;
  };
}

/**
 * 验证警告
 */
export interface ValidationWarning {
  type: string;
  message: string;
  severity?: 'low' | 'medium' | 'high';
}

/**
 * 安全问题
 */
export interface SecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  details?: string;
}

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
  type: string;
  message: string;
  impact: 'low' | 'medium' | 'high';
  suggestion?: string;
}

/**
 * 预估成本
 */
export interface EstimatedCost {
  executionTimeMs?: number;
  rowsScanned?: number;
  complexity: 'low' | 'medium' | 'high';
}

/**
 * 性能分析结果
 */
export interface PerformanceAnalysis {
  warnings: ValidationWarning[];
  suggestions: OptimizationSuggestion[];
  estimatedCost: EstimatedCost;
}

/**
 * 用户权限
 */
export interface UserPermissions {
  userId?: string;
  allowedDatabases?: string[];
  allowedTables?: string[];
  allowedOperations?: string[];

  /**
   * 不受库表限制（仍只允许 SELECT）
   * 为 false 时，SQL 无法解析将被拒绝，避免解析失败导致权限检查被绕过
   */
  unrestricted?: boolean;

  /**
   * 检查是否可以访问指定表
   */
  canAccessTable(database: string, table: string): boolean;
}

/**
 * 表引用
 */
export interface TableReference {
  database?: string;
  name: string;
  alias?: string;
}

/**
 * 列引用
 */
export interface ColumnReference {
  table?: string;
  name: string;
  alias?: string;
}
