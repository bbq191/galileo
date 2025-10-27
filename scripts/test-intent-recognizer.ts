/**
 * 意图识别器测试脚本
 * 用于手动测试意图识别功能
 */

import { IntentRecognizer } from '@/lib/nlp/intent-recognizer';

async function main() {
  console.log('=== 意图识别器测试 ===\n');

  const recognizer = new IntentRecognizer();

  const testQueries = [
    '查询用户表的所有数据',
    '查询最近一个月销售额TOP10的产品',
    '统计近7天每个分类的订单数量',
    '查询今年的总销售额',
    '查询订单和产品信息',
  ];

  for (const query of testQueries) {
    console.log(`\n查询: ${query}`);
    console.log('-'.repeat(60));

    try {
      const intent = await recognizer.recognize(query);

      console.log('识别结果:');
      console.log('  类型:', intent.type);
      console.log('  涉及的表:', intent.entities.tables?.join(', ') || '无');
      console.log('  涉及的字段:', intent.entities.columns?.join(', ') || '无');

      if (intent.conditions.timeRange) {
        console.log('  时间范围:', intent.conditions.timeRange.relative || '自定义');
        if (intent.conditions.timeRange.start) {
          console.log('    开始:', intent.conditions.timeRange.start.toISOString());
        }
        if (intent.conditions.timeRange.end) {
          console.log('    结束:', intent.conditions.timeRange.end.toISOString());
        }
      }

      if (intent.conditions.limit) {
        console.log('  限制:', intent.conditions.limit);
      }

      if (intent.aggregations) {
        console.log('  聚合函数:', intent.aggregations.function);
        console.log('  聚合字段:', intent.aggregations.column);
        if (intent.aggregations.groupBy) {
          console.log('  分组字段:', intent.aggregations.groupBy.join(', '));
        }
      }

      if (intent.joins) {
        console.log('  JOIN类型:', intent.joins.type);
        console.log('  关联表:', intent.joins.tables.join(', '));
      }

      console.log('  置信度:', intent.confidence);

      if (intent.ambiguities && intent.ambiguities.length > 0) {
        console.log('  歧义警告:');
        intent.ambiguities.forEach(amb => console.log(`    - ${amb}`));
      }
    } catch (error) {
      console.error('识别失败:', error instanceof Error ? error.message : String(error));
    }
  }

  await recognizer.cleanup();
  console.log('\n测试完成');
}

main().catch(console.error);
