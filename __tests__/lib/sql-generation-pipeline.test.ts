import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';

// 阶段实现的依赖链会初始化整个 DI 容器；这里只需要类型占位，实例由测试注入
jest.mock('@/lib/sql/generator/pipeline/stages/template-matcher-stage', () => ({ TemplateMatcher: class {} }));
jest.mock('@/lib/sql/generator/pipeline/stages/prompt-cache-checker-stage', () => ({ PromptCacheChecker: class {} }));
jest.mock('@/lib/sql/generator/pipeline/stages/sql-cache-checker-stage', () => ({ SQLCacheChecker: class {} }));
jest.mock('@/lib/sql/generator/pipeline/stages/ai-generator-stage', () => ({ AIGenerator: class {} }));
jest.mock('@/lib/sql/generator/pipeline/stages/quality-enhancer-stage', () => ({ QualityEnhancer: class {} }));
jest.mock('@/lib/sql/generator/pipeline/stages/validator-stage', () => ({ Validator: class {} }));

import { SQLGenerationPipeline } from '@/lib/sql/generator/pipeline/sql-generation-pipeline';

function stage(name: string, produce?: string) {
  return {
    name,
    process: jest.fn(async (context: any) => {
      if (produce) context.result = { sql: produce, explanation: name, confidence: 1, usedTables: [], usedColumns: [] };
      context.executedStages.push({ stageName: name, success: true, duration: 0 });
      return context;
    }),
  };
}

function createPipeline() {
  const stages = {
    templateMatcher: stage('TemplateMatcher'),
    promptCacheChecker: stage('PromptCacheChecker'),
    sqlCacheChecker: stage('SQLCacheChecker'),
    aiGenerator: stage('AIGenerator', 'SELECT 1'),
    qualityEnhancer: stage('QualityEnhancer'),
    validator: stage('Validator'),
  };
  const pipeline = new SQLGenerationPipeline(
    ...(Object.values(stages) as unknown as ConstructorParameters<typeof SQLGenerationPipeline>)
  );
  return { pipeline, stages };
}

describe('SQLGenerationPipeline', () => {
  it('构造时阶段列表引用的是注入的实例（字段初始化顺序依赖参数属性先赋值）', () => {
    const { pipeline } = createPipeline();

    expect([...pipeline.getStatistics().stageStats.keys()]).toEqual([
      'TemplateMatcher',
      'PromptCacheChecker',
      'SQLCacheChecker',
      'AIGenerator',
      'QualityEnhancer',
      'Validator',
    ]);
  });

  it('disabledStages 跳过 Validator 阶段', async () => {
    const { pipeline, stages } = createPipeline();

    const result = await pipeline.generate({} as any, { tables: [] } as any, {}, { disabledStages: ['Validator'] });

    expect(result.result.sql).toBe('SELECT 1');
    expect(result.skippedStages).toEqual(['Validator']);
    expect(stages.validator.process).not.toHaveBeenCalled();
    expect(stages.qualityEnhancer.process).toHaveBeenCalled();
  });
});
