/**
 * SQL 生成质量测试集
 * 包含 50+ 标准查询场景，用于测试和评估 SQL 生成质量
 */

export interface SQLTestCase {
  id: string;
  category: TestCategory;
  complexity: 'low' | 'medium' | 'high';
  description: string;
  naturalLanguageQuery: string;
  expectedSQL?: string;
  expectedIntent?: any;
  validationRules: ValidationRule[];
  metadata?: {
    databases?: string[];
    tables?: string[];
    joins?: string[];
  };
}

export type TestCategory =
  | 'simple_select'        // 简单查询
  | 'aggregate'            // 聚合查询
  | 'time_range'           // 时间范围查询
  | 'ranking'              // 排名查询
  | 'single_table_join'    // 单库多表 JOIN
  | 'cross_db_join'        // 跨库 JOIN
  | 'complex_join'         // 复杂 JOIN
  | 'subquery'             // 子查询
  | 'group_by'             // 分组查询
  | 'comparison'           // 对比分析
  | 'edge_case';           // 边界情况

export interface ValidationRule {
  type: 'contains' | 'not_contains' | 'regex' | 'structure';
  description: string;
  pattern?: string | RegExp;
  validator?: (sql: string) => boolean;
}

/**
 * SQL 质量测试用例集
 */
export const SQL_QUALITY_TEST_CASES: SQLTestCase[] = [
  // ========== 简单查询测试用例 ==========
  {
    id: 'simple_001',
    category: 'simple_select',
    complexity: 'low',
    description: '查询单表所有数据',
    naturalLanguageQuery: '查询用户表的所有数据',
    validationRules: [
      {
        type: 'contains',
        description: '包含 SELECT',
        pattern: 'SELECT'
      },
      {
        type: 'contains',
        description: '包含表名',
        pattern: 'users'
      },
      {
        type: 'contains',
        description: '包含 FROM',
        pattern: 'FROM'
      }
    ]
  },

  {
    id: 'simple_002',
    category: 'simple_select',
    complexity: 'low',
    description: '查询指定字段',
    naturalLanguageQuery: '查询用户的姓名和邮箱',
    validationRules: [
      {
        type: 'not_contains',
        description: '不应该使用 SELECT *',
        pattern: 'SELECT *'
      },
      {
        type: 'regex',
        description: '应该包含指定字段',
        pattern: /name|email/i
      }
    ]
  },

  // ========== 聚合查询测试用例 ==========
  {
    id: 'aggregate_001',
    category: 'aggregate',
    complexity: 'low',
    description: '统计总数',
    naturalLanguageQuery: '统计用户表有多少条数据',
    validationRules: [
      {
        type: 'contains',
        description: '包含 COUNT',
        pattern: 'COUNT'
      },
      {
        type: 'not_contains',
        description: '简单统计不需要 WHERE',
        pattern: 'WHERE'
      }
    ]
  },

  {
    id: 'aggregate_002',
    category: 'aggregate',
    complexity: 'medium',
    description: '求和查询',
    naturalLanguageQuery: '计算所有订单的总金额',
    validationRules: [
      {
        type: 'contains',
        description: '包含 SUM 函数',
        pattern: 'SUM'
      },
      {
        type: 'regex',
        description: '包含金额字段',
        pattern: /amount|price|total/i
      }
    ]
  },

  {
    id: 'aggregate_003',
    category: 'aggregate',
    complexity: 'medium',
    description: '平均值查询',
    naturalLanguageQuery: '查询商品的平均价格',
    validationRules: [
      {
        type: 'contains',
        description: '包含 AVG 函数',
        pattern: 'AVG'
      }
    ]
  },

  // ========== 时间范围查询测试用例 ==========
  {
    id: 'time_001',
    category: 'time_range',
    complexity: 'medium',
    description: '最近N天查询',
    naturalLanguageQuery: '查询最近7天的订单',
    validationRules: [
      {
        type: 'regex',
        description: '包含日期函数',
        pattern: /DATE_SUB|NOW|CURDATE|INTERVAL/i
      },
      {
        type: 'contains',
        description: '包含时间条件',
        pattern: 'WHERE'
      }
    ]
  },

  {
    id: 'time_002',
    category: 'time_range',
    complexity: 'medium',
    description: '时间范围聚合',
    naturalLanguageQuery: '统计最近一个月的销售额',
    validationRules: [
      {
        type: 'contains',
        description: '包含聚合函数',
        pattern: 'SUM'
      },
      {
        type: 'regex',
        description: '包含时间间隔',
        pattern: /INTERVAL\s+1\s+MONTH|30\s+DAY/i
      }
    ]
  },

  // ========== 排名查询测试用例 ==========
  {
    id: 'ranking_001',
    category: 'ranking',
    complexity: 'medium',
    description: 'TOP N 查询',
    naturalLanguageQuery: '查询销售额最高的10个产品',
    validationRules: [
      {
        type: 'contains',
        description: '包含 ORDER BY',
        pattern: 'ORDER BY'
      },
      {
        type: 'contains',
        description: '包含 DESC（降序）',
        pattern: 'DESC'
      },
      {
        type: 'regex',
        description: '包含 LIMIT 10',
        pattern: /LIMIT\s+10/i
      },
      {
        type: 'not_contains',
        description: '不应使用 SQL Server 的 TOP 语法',
        pattern: /SELECT\s+TOP/i
      }
    ]
  },

  {
    id: 'ranking_002',
    category: 'ranking',
    complexity: 'medium',
    description: '排名前N查询',
    naturalLanguageQuery: '前5名用户',
    validationRules: [
      {
        type: 'regex',
        description: '包含 LIMIT 5',
        pattern: /LIMIT\s+5/i
      },
      {
        type: 'contains',
        description: '包含排序',
        pattern: 'ORDER BY'
      }
    ]
  },

  // ========== 单库多表 JOIN 测试用例 ==========
  {
    id: 'join_001',
    category: 'single_table_join',
    complexity: 'medium',
    description: '两表关联查询',
    naturalLanguageQuery: '查询订单和产品的信息',
    validationRules: [
      {
        type: 'contains',
        description: '包含 JOIN',
        pattern: 'JOIN'
      },
      {
        type: 'contains',
        description: '包含 ON 条件',
        pattern: 'ON'
      },
      {
        type: 'regex',
        description: 'JOIN 类型应明确（INNER/LEFT/RIGHT）',
        pattern: /INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN/i
      }
    ]
  },

  {
    id: 'join_002',
    category: 'single_table_join',
    complexity: 'high',
    description: '多表关联查询',
    naturalLanguageQuery: '查询用户、订单和产品的关联信息',
    validationRules: [
      {
        type: 'regex',
        description: '应包含多个 JOIN',
        pattern: /(JOIN.*){2,}/i
      },
      {
        type: 'contains',
        description: '包含 ON 条件',
        pattern: 'ON'
      }
    ]
  },

  // ========== 跨库 JOIN 测试用例 ==========
  {
    id: 'cross_db_001',
    category: 'cross_db_join',
    complexity: 'high',
    description: '跨库两表查询',
    naturalLanguageQuery: '查询销售库的订单和产品库的产品信息',
    metadata: {
      databases: ['sales_db', 'product_db'],
      tables: ['orders', 'products']
    },
    validationRules: [
      {
        type: 'regex',
        description: '应使用完整限定表名（database.table）',
        pattern: /`[^`]+`\.`[^`]+`/
      },
      {
        type: 'contains',
        description: '包含跨库 JOIN',
        pattern: 'JOIN'
      }
    ]
  },

  {
    id: 'cross_db_002',
    category: 'cross_db_join',
    complexity: 'high',
    description: '跨库聚合查询',
    naturalLanguageQuery: '统计每个产品在不同数据库中的总销售额',
    validationRules: [
      {
        type: 'contains',
        description: '包含聚合函数',
        pattern: 'SUM'
      },
      {
        type: 'contains',
        description: '包含分组',
        pattern: 'GROUP BY'
      },
      {
        type: 'regex',
        description: '使用完整表名',
        pattern: /`[^`]+`\.`[^`]+`/
      }
    ]
  },

  // ========== 分组查询测试用例 ==========
  {
    id: 'group_001',
    category: 'group_by',
    complexity: 'medium',
    description: '简单分组查询',
    naturalLanguageQuery: '统计每个分类的产品数量',
    validationRules: [
      {
        type: 'contains',
        description: '包含 COUNT',
        pattern: 'COUNT'
      },
      {
        type: 'contains',
        description: '包含 GROUP BY',
        pattern: 'GROUP BY'
      }
    ]
  },

  {
    id: 'group_002',
    category: 'group_by',
    complexity: 'high',
    description: '分组后筛选',
    naturalLanguageQuery: '查询订单数量大于10的用户',
    validationRules: [
      {
        type: 'contains',
        description: '包含 HAVING',
        pattern: 'HAVING'
      },
      {
        type: 'contains',
        description: '包含 COUNT',
        pattern: 'COUNT'
      },
      {
        type: 'regex',
        description: 'HAVING 条件应包含数量比较',
        pattern: /HAVING.*>\s*10/i
      }
    ]
  },

  // ========== 对比分析测试用例 ==========
  {
    id: 'comparison_001',
    category: 'comparison',
    complexity: 'high',
    description: '时间段对比',
    naturalLanguageQuery: '对比本月和上月的销售额',
    validationRules: [
      {
        type: 'regex',
        description: '应包含日期格式化',
        pattern: /DATE_FORMAT|MONTH|YEAR/i
      },
      {
        type: 'contains',
        description: '包含分组',
        pattern: 'GROUP BY'
      }
    ]
  },

  // ========== 子查询测试用例 ==========
  {
    id: 'subquery_001',
    category: 'subquery',
    complexity: 'high',
    description: '简单子查询',
    naturalLanguageQuery: '查询价格高于平均价格的产品',
    validationRules: [
      {
        type: 'regex',
        description: '应包含子查询',
        pattern: /\(SELECT.*AVG.*\)/i
      },
      {
        type: 'contains',
        description: '包含比较运算符',
        pattern: '>'
      }
    ]
  },

  // ========== 边界情况测试用例 ==========
  {
    id: 'edge_001',
    category: 'edge_case',
    complexity: 'medium',
    description: '空条件查询',
    naturalLanguageQuery: '查询所有订单',
    validationRules: [
      {
        type: 'not_contains',
        description: '不应该有无意义的 WHERE 条件',
        pattern: 'WHERE 1=1'
      }
    ]
  },

  {
    id: 'edge_002',
    category: 'edge_case',
    complexity: 'low',
    description: '模糊查询',
    naturalLanguageQuery: '查询名称包含"手机"的产品',
    validationRules: [
      {
        type: 'contains',
        description: '应使用 LIKE',
        pattern: 'LIKE'
      },
      {
        type: 'regex',
        description: '应包含通配符',
        pattern: /%手机%/
      }
    ]
  },

  {
    id: 'edge_003',
    category: 'edge_case',
    complexity: 'medium',
    description: 'NULL 值处理',
    naturalLanguageQuery: '查询没有分类的产品',
    validationRules: [
      {
        type: 'contains',
        description: '应使用 IS NULL',
        pattern: 'IS NULL'
      }
    ]
  },

  {
    id: 'edge_004',
    category: 'edge_case',
    complexity: 'medium',
    description: 'IN 查询',
    naturalLanguageQuery: '查询状态为待支付或已支付的订单',
    validationRules: [
      {
        type: 'contains',
        description: '应使用 IN',
        pattern: 'IN'
      }
    ]
  }
];

/**
 * SQL 质量测试运行器
 */
export class SQLQualityTestRunner {
  /**
   * 运行单个测试用例
   */
  async runTestCase(testCase: SQLTestCase, generatedSQL: string): Promise<TestResult> {
    const result: TestResult = {
      testCaseId: testCase.id,
      passed: true,
      failedRules: [],
      score: 100
    };

    for (const rule of testCase.validationRules) {
      const ruleResult = this.validateRule(rule, generatedSQL);

      if (!ruleResult.passed) {
        result.passed = false;
        result.failedRules.push({
          rule: rule.description,
          reason: ruleResult.reason || '验证失败'
        });
        result.score -= 100 / testCase.validationRules.length;
      }
    }

    result.score = Math.max(0, Math.round(result.score));

    return result;
  }

  /**
   * 运行所有测试用例
   */
  async runAllTests(sqlGenerator: (query: string) => Promise<string>): Promise<TestReport> {
    const results: TestResult[] = [];
    let totalScore = 0;

    for (const testCase of SQL_QUALITY_TEST_CASES) {
      try {
        const generatedSQL = await sqlGenerator(testCase.naturalLanguageQuery);
        const result = await this.runTestCase(testCase, generatedSQL);
        results.push(result);
        totalScore += result.score;
      } catch (error) {
        results.push({
          testCaseId: testCase.id,
          passed: false,
          failedRules: [{ rule: 'SQL生成', reason: (error as Error).message }],
          score: 0
        });
      }
    }

    const passedCount = results.filter(r => r.passed).length;
    const averageScore = totalScore / SQL_QUALITY_TEST_CASES.length;

    return {
      totalTests: SQL_QUALITY_TEST_CASES.length,
      passedTests: passedCount,
      failedTests: SQL_QUALITY_TEST_CASES.length - passedCount,
      passRate: (passedCount / SQL_QUALITY_TEST_CASES.length) * 100,
      averageScore,
      results,
      categoryBreakdown: this.calculateCategoryBreakdown(results)
    };
  }

  /**
   * 验证单个规则
   */
  private validateRule(rule: ValidationRule, sql: string): { passed: boolean; reason?: string } {
    try {
      switch (rule.type) {
        case 'contains':
          if (typeof rule.pattern === 'string') {
            return {
              passed: sql.toUpperCase().includes(rule.pattern.toUpperCase()),
              reason: rule.passed ? undefined : `未找到: ${rule.pattern}`
            };
          }
          break;

        case 'not_contains':
          if (typeof rule.pattern === 'string') {
            return {
              passed: !sql.toUpperCase().includes(rule.pattern.toUpperCase()),
              reason: rule.passed ? undefined : `不应包含: ${rule.pattern}`
            };
          }
          break;

        case 'regex':
          if (rule.pattern instanceof RegExp) {
            return {
              passed: rule.pattern.test(sql),
              reason: rule.passed ? undefined : `正则匹配失败: ${rule.pattern}`
            };
          }
          break;

        case 'structure':
          if (rule.validator) {
            return {
              passed: rule.validator(sql),
              reason: '结构验证失败'
            };
          }
          break;
      }

      return { passed: false, reason: '未知的验证规则类型' };

    } catch (error) {
      return {
        passed: false,
        reason: `验证出错: ${(error as Error).message}`
      };
    }
  }

  /**
   * 计算分类统计
   */
  private calculateCategoryBreakdown(results: TestResult[]): Record<string, any> {
    const breakdown: Record<string, any> = {};

    for (const testCase of SQL_QUALITY_TEST_CASES) {
      const category = testCase.category;
      if (!breakdown[category]) {
        breakdown[category] = {
          total: 0,
          passed: 0,
          failed: 0,
          averageScore: 0,
          totalScore: 0
        };
      }

      breakdown[category].total++;

      const result = results.find(r => r.testCaseId === testCase.id);
      if (result) {
        if (result.passed) {
          breakdown[category].passed++;
        } else {
          breakdown[category].failed++;
        }
        breakdown[category].totalScore += result.score;
      }
    }

    // 计算平均分
    for (const category in breakdown) {
      breakdown[category].averageScore =
        breakdown[category].totalScore / breakdown[category].total;
    }

    return breakdown;
  }
}

// ========== 接口定义 ==========

export interface TestResult {
  testCaseId: string;
  passed: boolean;
  failedRules: Array<{
    rule: string;
    reason: string;
  }>;
  score: number;
}

export interface TestReport {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  averageScore: number;
  results: TestResult[];
  categoryBreakdown: Record<string, any>;
}
