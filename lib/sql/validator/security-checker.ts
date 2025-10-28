/**
 * SQL 安全检查器
 *
 * 负责检查 SQL 语句的安全性，防止 SQL 注入和危险操作
 * 严格按照第二阶段文档规范实现
 */

import { SecurityIssue } from './types';

/**
 * 安全检查配置
 */
export interface SecurityCheckConfig {
  /**
   * 是否启用严格模式（检测更多潜在风险）
   */
  strictMode?: boolean;

  /**
   * 自定义危险关键字列表
   */
  customDangerousKeywords?: string[];

  /**
   * 自定义敏感函数列表
   */
  customSensitiveFunctions?: string[];

  /**
   * 是否允许系统表查询
   */
  allowSystemTables?: boolean;
}

export class SecurityChecker {
  private config: SecurityCheckConfig;

  /**
   * 默认危险关键字（只允许 SELECT 查询）
   */
  private readonly DEFAULT_DANGEROUS_KEYWORDS = [
    'DROP',
    'DELETE',
    'TRUNCATE',
    'ALTER',
    'CREATE',
    'INSERT',
    'UPDATE',
    'REPLACE',
    'RENAME',
    'GRANT',
    'REVOKE'
  ];

  /**
   * 默认敏感函数
   */
  private readonly DEFAULT_SENSITIVE_FUNCTIONS = [
    'LOAD_FILE',
    'INTO OUTFILE',
    'INTO DUMPFILE',
    'LOAD DATA',
    'SLEEP',
    'BENCHMARK',
    'GET_LOCK',
    'RELEASE_LOCK'
  ];

  constructor(config: SecurityCheckConfig = {}) {
    this.config = {
      strictMode: false,
      allowSystemTables: false,
      ...config
    };
  }

  /**
   * 执行安全检查
   */
  async check(sql: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // 1. 检查 SQL 注入特征
    const injectionIssues = this.checkSQLInjection(sql);
    issues.push(...injectionIssues);

    // 2. 检查危险操作
    const dangerousOpIssues = this.checkDangerousOperations(sql);
    issues.push(...dangerousOpIssues);

    // 3. 检查信息泄露风险
    if (!this.config.allowSystemTables) {
      const disclosureIssues = this.checkInformationDisclosure(sql);
      issues.push(...disclosureIssues);
    }

    // 4. 检查多语句执行
    if (this.containsMultipleStatements(sql)) {
      issues.push({
        severity: 'critical',
        type: 'sql_injection',
        message: '检测到多语句执行尝试',
        details: '不允许在单次查询中执行多个 SQL 语句，这可能是 SQL 注入攻击'
      });
    }

    // 5. 检查十六进制编码（可能用于绕过检测）
    if (this.config.strictMode && this.containsHexEncoding(sql)) {
      issues.push({
        severity: 'medium',
        type: 'sql_injection',
        message: '检测到十六进制编码',
        details: '十六进制编码可能被用于绕过安全检查'
      });
    }

    // 6. 检查敏感函数
    const sensitiveFuncIssues = this.checkSensitiveFunctions(sql);
    issues.push(...sensitiveFuncIssues);

    // 7. 检查字符编码绕过
    if (this.config.strictMode) {
      const encodingIssues = this.checkEncodingBypass(sql);
      issues.push(...encodingIssues);
    }

    return issues;
  }

  /**
   * 检查 SQL 注入特征
   */
  private checkSQLInjection(sql: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    // 检查是否包含 SQL 注入模式
    if (this.containsSQLInjectionPatterns(sql)) {
      issues.push({
        severity: 'critical',
        type: 'sql_injection',
        message: 'SQL 包含可能的注入特征',
        details: '检测到潜在的 SQL 注入模式，如联合查询、恒真条件、注释符号等'
      });
    }

    return issues;
  }

  /**
   * 检查危险操作
   */
  private checkDangerousOperations(sql: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const dangerousKeywords = this.config.customDangerousKeywords || this.DEFAULT_DANGEROUS_KEYWORDS;

    for (const keyword of dangerousKeywords) {
      // 使用词边界确保精确匹配
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(sql)) {
        issues.push({
          severity: 'critical',
          type: 'dangerous_operation',
          message: `不允许执行 ${keyword} 操作`,
          details: `系统仅允许 SELECT 查询，禁止执行 ${keyword} 操作`
        });
      }
    }

    return issues;
  }

  /**
   * 检查信息泄露风险
   */
  private checkInformationDisclosure(sql: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    // 检查系统数据库访问
    const systemDatabases = [
      'information_schema',
      'mysql',
      'sys',
      'performance_schema'
    ];

    for (const db of systemDatabases) {
      const regex = new RegExp(`\\b${db}\\b`, 'i');
      if (regex.test(sql)) {
        issues.push({
          severity: 'high',
          type: 'information_disclosure',
          message: `查询涉及系统数据库 ${db}，可能存在信息泄露风险`,
          details: `不建议直接查询 ${db} 等系统数据库，这可能暴露数据库结构和敏感信息`
        });
      }
    }

    return issues;
  }

  /**
   * 检查敏感函数
   */
  private checkSensitiveFunctions(sql: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const sensitiveFunctions = this.config.customSensitiveFunctions || this.DEFAULT_SENSITIVE_FUNCTIONS;

    for (const func of sensitiveFunctions) {
      const regex = new RegExp(`\\b${func}\\b`, 'i');
      if (regex.test(sql)) {
        issues.push({
          severity: 'critical',
          type: 'dangerous_operation',
          message: `不允许使用 ${func} 函数`,
          details: '该函数可能被用于文件操作、时间延迟攻击或其他恶意行为'
        });
      }
    }

    return issues;
  }

  /**
   * 检查字符编码绕过
   */
  private checkEncodingBypass(sql: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    // 检查 CHAR 函数（可能用于绕过检测）
    if (/CHAR\s*\(/i.test(sql)) {
      issues.push({
        severity: 'medium',
        type: 'sql_injection',
        message: '检测到 CHAR 函数',
        details: 'CHAR 函数可能被用于编码绕过安全检查'
      });
    }

    // 检查 CONCAT 与特殊字符组合
    if (/CONCAT\s*\([^)]*['"][\s;]+/i.test(sql)) {
      issues.push({
        severity: 'medium',
        type: 'sql_injection',
        message: '检测到可疑的 CONCAT 函数使用',
        details: 'CONCAT 函数与特殊字符的组合可能用于构造恶意 SQL'
      });
    }

    return issues;
  }

  /**
   * 检查 SQL 注入模式
   * 根据文档规范，检测常见的 SQL 注入特征
   */
  private containsSQLInjectionPatterns(sql: string): boolean {
    const patterns = [
      /;\s*(DROP|DELETE|TRUNCATE|ALTER|UPDATE|INSERT|CREATE)/i,  // 多语句注入
      /UNION\s+(ALL\s+)?SELECT/i,  // 联合查询注入
      /OR\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,  // OR 1=1 等恒真条件
      /AND\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,  // AND 1=1 等恒真条件
      /OR\s+['"][^'"]*['"]\s*=\s*['"]/i,  // OR 'x'='x'
      /AND\s+['"][^'"]*['"]\s*=\s*['"]/i,  // AND 'x'='x'
      /--\s*$/m,  // 单行注释（行末）
      /--\s+/,  // 单行注释（后有空格）
      /\/\*[\s\S]*?\*\//,  // 多行注释
      /;\s*--/,  // 语句结束加注释
      /#\s*$/m,  // MySQL 单行注释
      /\bEXEC\s*\(/i,  // 执行存储过程
      /\bEXECUTE\s+IMMEDIATE/i,  // 动态执行
      /\bCALL\s+/i,  // 调用存储过程
      /xp_cmdshell/i,  // SQL Server 命令执行
      /INTO\s+OUTFILE/i,  // 文件写入
      /INTO\s+DUMPFILE/i,  // 文件写入
    ];

    return patterns.some(pattern => pattern.test(sql));
  }

  /**
   * 检查是否包含多个语句
   * 多语句执行是常见的 SQL 注入手法
   */
  private containsMultipleStatements(sql: string): boolean {
    // 移除字符串内的分号（避免误报）
    let withoutStrings = sql;

    // 移除单引号字符串
    withoutStrings = withoutStrings.replace(/'(?:[^'\\]|\\.)*'/g, '');

    // 移除双引号字符串
    withoutStrings = withoutStrings.replace(/"(?:[^"\\]|\\.)*"/g, '');

    // 移除反引号标识符
    withoutStrings = withoutStrings.replace(/`(?:[^`\\]|\\.)*`/g, '');

    // 检查是否有多个分号
    const semicolons = (withoutStrings.match(/;/g) || []).length;

    // 如果有多个分号，肯定是多语句
    if (semicolons > 1) {
      return true;
    }

    // 如果有一个分号，检查分号后是否还有有效内容
    if (semicolons === 1) {
      const parts = withoutStrings.split(';');
      if (parts.length > 1) {
        const afterSemicolon = parts[1].trim();
        // 如果分号后还有非注释内容，认为是多语句
        if (afterSemicolon.length > 0 &&
            !afterSemicolon.startsWith('--') &&
            !afterSemicolon.startsWith('#') &&
            !afterSemicolon.startsWith('/*')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 检查是否包含十六进制编码
   * 十六进制编码可能用于绕过关键字检测
   */
  private containsHexEncoding(sql: string): boolean {
    // 检查是否有十六进制字符串（0x开头）
    const hexPattern = /0x[0-9a-fA-F]+/;
    return hexPattern.test(sql);
  }

  /**
   * 获取所有检测到的安全问题的严重程度统计
   */
  getIssueSeverityStats(issues: SecurityIssue[]): Record<string, number> {
    const stats: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    for (const issue of issues) {
      stats[issue.severity]++;
    }

    return stats;
  }

  /**
   * 判断是否有致命安全问题（critical 级别）
   */
  hasCriticalIssues(issues: SecurityIssue[]): boolean {
    return issues.some(issue => issue.severity === 'critical');
  }
}
