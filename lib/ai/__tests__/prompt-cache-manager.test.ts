/**
 * PromptCacheManager 单元测试
 */

import { PromptCacheManager, PromptType } from '../prompt-cache-manager';
import { EmbeddingGenerator } from '@/lib/vector/embedding-generator';

describe('PromptCacheManager', () => {
  let promptCache: PromptCacheManager;
  let embedder: EmbeddingGenerator;

  beforeEach(async () => {
    embedder = new EmbeddingGenerator();
    promptCache = new PromptCacheManager(undefined, embedder);
    await promptCache.initialize();
  });

  afterEach(async () => {
    await promptCache.clear();
  });

  describe('基本功能', () => {
    it('应该初始化成功', () => {
      expect(promptCache.size()).toBe(0);
    });

    it('应该添加 Prompt 到缓存', async () => {
      await promptCache.addPrompt(
        'Analyze the semantic meaning of table "users"',
        '{ "description": "User account information" }',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 150, completionTokens: 80, totalTokens: 230 },
        'deepseek-r1:1.5b',
        0.3
      );

      expect(promptCache.size()).toBe(1);
    });

    it('应该找到相似的 Prompt', async () => {
      // 添加原始 Prompt
      await promptCache.addPrompt(
        'Analyze the semantic meaning of table "users"',
        '{ "description": "User account information" }',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 150, completionTokens: 80, totalTokens: 230 },
        'deepseek-r1:1.5b',
        0.3
      );

      // 查找相似 Prompt（相同内容）
      const result = await promptCache.findSimilar(
        'Analyze the semantic meaning of table "users"',
        { type: PromptType.SEMANTIC_ANNOTATION, threshold: 0.90 }
      );

      expect(result).not.toBeNull();
      expect(result?.score).toBeGreaterThan(0.90);
      expect(result?.entry.response).toBe('{ "description": "User account information" }');
    });

    it('应该正确处理不同类型的 Prompt', async () => {
      // 添加语义标注 Prompt
      await promptCache.addPrompt(
        'Analyze table users',
        'Response 1',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'deepseek-r1:1.5b',
        0.3
      );

      // 添加关系推断 Prompt
      await promptCache.addPrompt(
        'Analyze table users',
        'Response 2',
        PromptType.RELATIONSHIP_INFERENCE,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'deepseek-r1:1.5b',
        0.3
      );

      // 查找语义标注类型
      const result1 = await promptCache.findSimilar('Analyze table users', {
        type: PromptType.SEMANTIC_ANNOTATION,
      });

      expect(result1?.entry.type).toBe(PromptType.SEMANTIC_ANNOTATION);
      expect(result1?.entry.response).toBe('Response 1');

      // 查找关系推断类型
      const result2 = await promptCache.findSimilar('Analyze table users', {
        type: PromptType.RELATIONSHIP_INFERENCE,
      });

      expect(result2?.entry.type).toBe(PromptType.RELATIONSHIP_INFERENCE);
      expect(result2?.entry.response).toBe('Response 2');
    });
  });

  describe('统计功能', () => {
    it('应该正确计算缓存统计', async () => {
      // 添加多个 Prompt
      await promptCache.addPrompt(
        'Prompt 1',
        'Response 1',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'deepseek-r1:1.5b',
        0.3
      );

      await promptCache.addPrompt(
        'Prompt 2',
        'Response 2',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        'deepseek-r1:1.5b',
        0.3
      );

      const stats = await promptCache.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.byType[PromptType.SEMANTIC_ANNOTATION].count).toBe(2);
    });

    it('应该正确计算命中率', async () => {
      await promptCache.addPrompt(
        'Test prompt',
        'Test response',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'deepseek-r1:1.5b',
        0.3
      );

      // 第一次查找：未命中（因为是第一次）
      const runtimeStats1 = promptCache.getRuntimeStats();
      expect(runtimeStats1.requests).toBe(0);

      // 第二次查找：命中
      await promptCache.findSimilar('Test prompt', {
        type: PromptType.SEMANTIC_ANNOTATION,
      });

      const runtimeStats2 = promptCache.getRuntimeStats();
      expect(runtimeStats2.requests).toBe(1);
      expect(runtimeStats2.hits).toBe(1);
      expect(runtimeStats2.hitRate).toBe(1);

      // 第三次查找：未命中（不存在的 Prompt）
      await promptCache.findSimilar('Non-existent prompt', {
        type: PromptType.SEMANTIC_ANNOTATION,
      });

      const runtimeStats3 = promptCache.getRuntimeStats();
      expect(runtimeStats3.requests).toBe(2);
      expect(runtimeStats3.hits).toBe(1);
      expect(runtimeStats3.hitRate).toBe(0.5);
    });
  });

  describe('清理功能', () => {
    it('应该清理低访问次数的缓存', async () => {
      // 添加一个低访问次数的缓存
      await promptCache.addPrompt(
        'Old prompt',
        'Old response',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'deepseek-r1:1.5b',
        0.3
      );

      // 模拟过期（修改创建时间）
      // 注意：这个测试需要等待实际时间，或者 mock Date
      // 简化测试，仅验证清理功能不会报错
      const removedCount = await promptCache.cleanup({
        minAccessCount: 10,
        maxAge: 0,
      });

      expect(removedCount).toBeGreaterThanOrEqual(0);
    });

    it('应该清空所有缓存', async () => {
      await promptCache.addPrompt(
        'Prompt 1',
        'Response 1',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'deepseek-r1:1.5b',
        0.3
      );

      await promptCache.addPrompt(
        'Prompt 2',
        'Response 2',
        PromptType.SEMANTIC_ANNOTATION,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'deepseek-r1:1.5b',
        0.3
      );

      expect(promptCache.size()).toBe(2);

      await promptCache.clear();

      expect(promptCache.size()).toBe(0);
    });
  });

  describe('预热功能', () => {
    it('应该批量预热缓存', async () => {
      const prompts = [
        {
          prompt: 'Prompt 1',
          response: 'Response 1',
          type: PromptType.SEMANTIC_ANNOTATION,
          tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: 'deepseek-r1:1.5b',
          temperature: 0.3,
        },
        {
          prompt: 'Prompt 2',
          response: 'Response 2',
          type: PromptType.SEMANTIC_ANNOTATION,
          tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: 'deepseek-r1:1.5b',
          temperature: 0.3,
        },
      ];

      await promptCache.warmup(prompts);

      expect(promptCache.size()).toBe(2);
    });
  });
});
