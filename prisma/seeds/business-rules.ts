// prisma/seeds/business-rules.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedBusinessRules() {
  console.log('🌱 开始添加业务规则测试数据...');

  // 1. 业务术语映射
  console.log('📝 添加业务术语映射...');
  const terms = await prisma.businessTermMapping.createMany({
    data: [
      {
        term: '寿险',
        description: '中国人民人寿保险部门',
        category: 'domain',
        targetType: 'condition',
        targetTable: 'tb_live_all_room',
        targetValue: JSON.stringify({
          type: 'subquery',
          condition: "orgId IN (SELECT dept_id FROM openser.live_temporary_dept WHERE top_name = '中国人民人寿保险股份有限公司')"
        }),
        priority: 1,
        confidence: 0.95,
        usageCount: 0,
        isEnabled: true,
        examples: JSON.stringify(['查询寿险部门的数据', '寿险直播间观看情况'])
      },
      {
        term: '观看时长',
        description: '直播观看时长指标',
        category: 'metric',
        targetType: 'column',
        targetTable: 'tb_live_watch_detail',
        targetColumn: 'watch_time',
        targetValue: JSON.stringify({
          type: 'column',
          aggregation: 'SUM',
          unit: '秒'
        }),
        priority: 2,
        confidence: 0.90,
        usageCount: 0,
        isEnabled: true
      },
      {
        term: '今天',
        description: '当天日期',
        category: 'time',
        targetType: 'condition',
        targetValue: JSON.stringify({
          type: 'date_function',
          condition: "DATE(created_at) = CURDATE()"
        }),
        priority: 3,
        confidence: 0.98,
        usageCount: 0,
        isEnabled: true,
        examples: JSON.stringify(['今天的数据', '查询今天的情况'])
      },
      {
        term: '本月',
        description: '当前月份',
        category: 'time',
        targetType: 'condition',
        targetValue: JSON.stringify({
          type: 'date_function',
          condition: "YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())"
        }),
        priority: 3,
        confidence: 0.98,
        usageCount: 0,
        isEnabled: true
      },
      {
        term: '活跃用户',
        description: '过去7天有观看记录的用户',
        category: 'dimension',
        targetType: 'condition',
        targetTable: 'tb_live_watch_detail',
        targetValue: JSON.stringify({
          type: 'subquery',
          condition: "user_id IN (SELECT DISTINCT user_id FROM tb_live_watch_detail WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY))"
        }),
        priority: 4,
        confidence: 0.85,
        usageCount: 0,
        isEnabled: true
      }
    ]
  });

  // 2. 分表模式
  console.log('📊 添加分表模式...');
  const patterns = await prisma.shardingPattern.createMany({
    data: [
      {
        patternName: 'live_watch_detail_sharding',
        description: '观看时长明细数据分表模式',
        baseTableName: 'tb_live_watch_detail',
        suffixPattern: '_{shard:hex:2}',
        shardCount: 256,
        tableList: JSON.stringify(
          Array.from({ length: 256 }, (_, i) =>
            `tb_live_watch_detail_${i.toString(16).padStart(2, '0')}`
          )
        ),
        mergeStrategy: 'UNION_ALL',
        shardKeyColumn: 'live_id',
        shardAlgorithm: 'CRC32',
        isEnabled: true,
        semanticDescription: '观看时长明细数据按照live_id进行哈希分表，共256个分表。查询时需要使用UNION ALL合并所有分表。'
      },
      {
        patternName: 'user_behavior_sharding',
        description: '用户行为数据按月分表',
        baseTableName: 'tb_user_behavior',
        suffixPattern: '_YYYYMM',
        shardCount: 12,
        tableList: JSON.stringify(
          Array.from({ length: 12 }, (_, i) =>
            `tb_user_behavior_${new Date(2025, i).toISOString().slice(0, 7).replace('-', '')}`
          )
        ),
        mergeStrategy: 'UNION_ALL',
        shardKeyColumn: 'behavior_date',
        shardAlgorithm: 'RANGE_MONTH',
        isEnabled: true,
        semanticDescription: '用户行为数据按月分表，每月一张表。'
      },
      {
        patternName: 'order_sharding',
        description: '订单数据分表',
        baseTableName: 'tb_order',
        suffixPattern: '_{shard:int:3}',
        shardCount: 10,
        tableList: JSON.stringify(
          Array.from({ length: 10 }, (_, i) => `tb_order_${i}`)
        ),
        mergeStrategy: 'UNION_ALL',
        shardKeyColumn: 'order_id',
        shardAlgorithm: 'MOD10',
        isEnabled: true
      }
    ]
  });

  // 3. 查询模板
  console.log('📋 添加查询模板...');
  const templates = await prisma.queryTemplate.createMany({
    data: [
      {
        name: '时间范围聚合查询',
        category: 'time_series',
        naturalLanguagePattern: '查询{时间范围}的{指标}{聚合方式}',
        sqlTemplate: 'SELECT {aggregation}({metric_column}) AS result FROM {table} WHERE {time_column} BETWEEN {start_date} AND {end_date}',
        parameters: JSON.stringify({
          required: ['table', 'metric_column', 'time_column', 'aggregation', 'start_date', 'end_date'],
          optional: []
        }),
        usageCount: 0,
        avgExecutionTime: null,
        isEnabled: true,
        semanticDescription: '适用于按时间范围聚合指标的查询，如"查询本月的总观看时长"',
        examples: JSON.stringify([
          '查询本月的总观看时长',
          '统计今天的直播间数量',
          '本周的平均观看人数'
        ])
      },
      {
        name: 'TOP N 排名查询',
        category: 'ranking',
        naturalLanguagePattern: '查询{指标}最{高/低}的{N}个{维度}',
        sqlTemplate: 'SELECT {dimension}, {aggregation}({metric}) AS value FROM {table} GROUP BY {dimension} ORDER BY value {order} LIMIT {N}',
        parameters: JSON.stringify({
          required: ['table', 'dimension', 'metric', 'aggregation', 'order', 'N'],
          optional: ['where_clause']
        }),
        usageCount: 0,
        isEnabled: true,
        examples: JSON.stringify([
          '查询观看时长最长的10个直播间',
          '统计评论数最多的前5个用户'
        ])
      },
      {
        name: '多维度分组统计',
        category: 'group_by',
        naturalLanguagePattern: '按{维度1}和{维度2}统计{指标}',
        sqlTemplate: 'SELECT {dim1}, {dim2}, {aggregation}({metric}) AS value FROM {table} GROUP BY {dim1}, {dim2}',
        parameters: JSON.stringify({
          required: ['table', 'dim1', 'dim2', 'metric', 'aggregation'],
          optional: ['where_clause', 'having_clause']
        }),
        usageCount: 0,
        isEnabled: true
      },
      {
        name: '同环比计算',
        category: 'comparison',
        naturalLanguagePattern: '{指标}的{同比/环比}',
        sqlTemplate: 'SELECT current_value, previous_value, (current_value - previous_value) / previous_value * 100 AS change_rate FROM ...',
        parameters: JSON.stringify({
          required: ['table', 'metric', 'comparison_type', 'period'],
          optional: []
        }),
        usageCount: 0,
        isEnabled: true
      },
      {
        name: '明细数据查询',
        category: 'detail',
        naturalLanguagePattern: '查询{主题}的明细数据',
        sqlTemplate: 'SELECT * FROM {table} WHERE {conditions} LIMIT {limit}',
        parameters: JSON.stringify({
          required: ['table'],
          optional: ['conditions', 'limit', 'order_by']
        }),
        usageCount: 0,
        isEnabled: true
      }
    ]
  });

  // 4. 常用过滤规则
  console.log('🔍 添加常用过滤规则...');
  const filters = await prisma.commonFilter.createMany({
    data: [
      {
        name: '有效数据过滤',
        description: '过滤掉逻辑删除和无效的数据',
        targetTable: '*',
        filterCondition: 'is_deleted = 0 AND status = 1',
        autoApply: true,
        priority: 1,
        isEnabled: true
      },
      {
        name: '最近30天数据',
        description: '只查询最近30天的数据',
        targetTable: '*',
        filterCondition: 'created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)',
        autoApply: false,
        priority: 3,
        isEnabled: true
      },
      {
        name: '寿险部门数据过滤',
        description: '限定查询寿险部门的数据',
        targetTable: 'tb_live_all_room',
        filterCondition: "orgId IN (SELECT dept_id FROM openser.live_temporary_dept WHERE top_name = '中国人民人寿保险股份有限公司')",
        autoApply: false,
        priority: 2,
        isEnabled: true,
        semanticKeywords: JSON.stringify(['寿险', '人保寿险', '寿险部门'])
      }
    ]
  });

  // 5. 聚合规则
  console.log('📊 添加聚合规则...');
  const aggregations = await prisma.aggregationRule.createMany({
    data: [
      {
        name: '观看时长汇总',
        metricName: '观看时长',
        sourceTable: 'tb_live_watch_detail',
        sourceColumn: 'watch_time',
        aggregationFunction: 'SUM',
        unit: '秒',
        isEnabled: true,
        semanticDescription: '观看时长需要对所有记录求和'
      },
      {
        name: '平均观看时长',
        metricName: '平均观看时长',
        sourceTable: 'tb_live_watch_detail',
        sourceColumn: 'watch_time',
        aggregationFunction: 'AVG',
        unit: '秒',
        isEnabled: true
      },
      {
        name: '观看人数统计',
        metricName: '观看人数',
        sourceTable: 'tb_live_watch_detail',
        sourceColumn: 'user_id',
        aggregationFunction: 'COUNT_DISTINCT',
        unit: '人',
        isEnabled: true,
        semanticDescription: '观看人数需要对user_id去重计数'
      },
      {
        name: '直播间数量',
        metricName: '直播间数量',
        sourceTable: 'tb_live_all_room',
        sourceColumn: 'room_id',
        aggregationFunction: 'COUNT_DISTINCT',
        unit: '个',
        isEnabled: true
      }
    ]
  });

  console.log('✅ 业务术语映射:', terms.count);
  console.log('✅ 分表模式:', patterns.count);
  console.log('✅ 查询模板:', templates.count);
  console.log('✅ 常用过滤规则:', filters.count);
  console.log('✅ 聚合规则:', aggregations.count);
  console.log('🎉 测试数据添加完成！');
}

seedBusinessRules()
  .catch((e) => {
    console.error('❌ 种子数据添加失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
