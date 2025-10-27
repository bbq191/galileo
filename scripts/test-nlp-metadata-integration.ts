/**
 * 意图识别 + 元数据检索集成测试
 * 测试完整的流程：自然语言 → 意图 → 元数据上下文
 */

import { IntentRecognizer } from '@/lib/nlp';
import { MetadataRetriever } from '@/lib/metadata/retrieval';

async function main() {
  console.log('=== 意图识别 + 元数据检索集成测试 ===\n');

  const recognizer = new IntentRecognizer();
  const retriever = new MetadataRetriever();

  const testCases = [
    {
      query: '查询用户表的所有数据',
      description: '简单查询',
    },
    {
      query: '查询最近一个月销售额TOP10的产品',
      description: '聚合查询 + 跨表JOIN',
    },
    {
      query: '统计每个分类的订单数量',
      description: '分组聚合查询',
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试: ${testCase.description}`);
    console.log(`查询: ${testCase.query}`);
    console.log('='.repeat(60));

    try {
      // 步骤1: 意图识别
      console.log('\n[步骤1] 意图识别...');
      const intent = await recognizer.recognize(testCase.query);

      console.log('识别结果:');
      console.log('  类型:', intent.type);
      console.log('  涉及的表:', intent.entities.tables?.join(', ') || '无');
      console.log('  涉及的字段:', intent.entities.columns?.join(', ') || '无');
      console.log('  置信度:', intent.confidence);

      if (intent.conditions.timeRange) {
        console.log('  时间范围:', intent.conditions.timeRange.relative);
      }

      if (intent.aggregations) {
        console.log('  聚合函数:', intent.aggregations.function);
      }

      // 步骤2: 元数据检索
      console.log('\n[步骤2] 元数据检索...');
      const context = await retriever.retrieveContext(intent, {
        limit: 5,
        threshold: 0.3,
        includeSampleData: false,
      });

      console.log('检索结果:');
      console.log('  表数量:', context.tables.length);
      console.log('  关系数量:', context.relationships.length);
      console.log('  总字段数:', context.columns.length);
      console.log('  复杂度:', context.estimatedComplexity);

      // 显示表详情
      console.log('\n  表详情:');
      for (const table of context.tables) {
        console.log(`    - ${table.databaseName}.${table.tableName}`);
        console.log(`      字段数: ${table.columns.length}`);
        console.log(`      主键: ${table.primaryKeys.join(', ') || '无'}`);
        if (table.semanticDescription) {
          console.log(`      描述: ${table.semanticDescription.substring(0, 50)}...`);
        }
      }

      // 显示关系
      if (context.relationships.length > 0) {
        console.log('\n  表关系:');
        for (const rel of context.relationships) {
          console.log(
            `    - ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn} (${rel.type})`
          );
          if (rel.confidence) {
            console.log(`      置信度: ${rel.confidence}`);
          }
        }
      }

      // 步骤3: 验证上下文完整性
      console.log('\n[步骤3] 验证上下文完整性...');
      const validation = validateContext(intent, context);
      if (validation.isValid) {
        console.log('  ✅ 上下文完整，可以生成 SQL');
      } else {
        console.log('  ❌ 上下文不完整:');
        validation.errors.forEach(err => console.log(`    - ${err}`));
      }

      console.log('\n✅ 测试通过');
    } catch (error) {
      console.error('\n❌ 测试失败:', error instanceof Error ? error.message : String(error));
    }
  }

  // 清理资源
  await recognizer.cleanup();
  await retriever.cleanup();

  console.log('\n\n所有测试完成');
}

/**
 * 验证上下文完整性
 */
function validateContext(intent: any, context: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查是否有表
  if (context.tables.length === 0) {
    errors.push('未找到相关的表');
  }

  // 检查跨表查询是否有关系
  if (context.tables.length > 1 && context.relationships.length === 0) {
    errors.push('跨表查询但未找到表关系');
  }

  // 检查聚合查询是否有数值字段
  if (intent.aggregations) {
    const hasNumericColumn = context.columns.some((col: any) => {
      const numericTypes = ['INT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BIGINT'];
      return numericTypes.some(type => col.dataType?.toUpperCase().includes(type));
    });

    if (!hasNumericColumn) {
      errors.push('聚合查询但未找到数值字段');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

main().catch(console.error);
