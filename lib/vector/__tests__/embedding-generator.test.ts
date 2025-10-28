/**
 * 向量嵌入生成器测试
 */

import { EmbeddingGenerator } from '../embedding-generator';

describe('EmbeddingGenerator', () => {
  let generator: EmbeddingGenerator;

  beforeEach(() => {
    generator = new EmbeddingGenerator();
  });

  describe('generate', () => {
    it('应该生成固定维度的向量', async () => {
      const text = 'user table with id and name columns';
      const result = await generator.generate(text);

      expect(result.vector).toBeDefined();
      expect(result.vector.length).toBe(generator.getDimension());
      expect(result.dimension).toBe(generator.getDimension());
    });

    it('应该为不同的文本生成不同的向量', async () => {
      const text1 = 'user table';
      const text2 = 'product table';

      const result1 = await generator.generate(text1);
      const result2 = await generator.generate(text2);

      // 向量应该不同
      const similarity = EmbeddingGenerator.cosineSimilarity(
        result1.vector,
        result2.vector
      );
      expect(similarity).toBeLessThan(1.0);
    });

    it('应该为相似的文本生成相似的向量', async () => {
      const text1 = 'user table with user data';
      const text2 = 'user table containing user information';

      const result1 = await generator.generate(text1);
      const result2 = await generator.generate(text2);

      const similarity = EmbeddingGenerator.cosineSimilarity(
        result1.vector,
        result2.vector
      );

      // 相似文本应该有较高的相似度
      expect(similarity).toBeGreaterThan(0.5);
    });

    it('应该处理空字符串', async () => {
      const result = await generator.generate('');
      expect(result.vector).toBeDefined();
      expect(result.vector.length).toBe(generator.getDimension());
    });

    it('应该处理长文本', async () => {
      const longText = 'user '.repeat(500);
      const result = await generator.generate(longText);
      expect(result.vector).toBeDefined();
      expect(result.vector.length).toBe(generator.getDimension());
    });
  });

  describe('generateBatch', () => {
    it('应该批量生成向量', async () => {
      const texts = ['user table', 'product table', 'order table'];
      const results = await generator.generateBatch(texts);

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.vector).toBeDefined();
        expect(result.vector.length).toBe(generator.getDimension());
      });
    });

    it('应该处理空数组', async () => {
      const results = await generator.generateBatch([]);
      expect(results).toEqual([]);
    });
  });

  describe('cosineSimilarity', () => {
    it('应该计算相同向量的相似度为 1', () => {
      const vector = [0.5, 0.5, 0.5, 0.5];
      const similarity = EmbeddingGenerator.cosineSimilarity(vector, vector);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('应该计算正交向量的相似度为 0', () => {
      const vector1 = [1, 0, 0, 0];
      const vector2 = [0, 1, 0, 0];
      const similarity = EmbeddingGenerator.cosineSimilarity(vector1, vector2);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('应该抛出错误当向量维度不匹配', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [0, 1];
      expect(() => {
        EmbeddingGenerator.cosineSimilarity(vector1, vector2);
      }).toThrow('Vectors must have the same dimension');
    });

    it('应该返回 0-1 范围内的值', async () => {
      const text1 = 'test';
      const text2 = 'another test';

      const result1 = await generator.generate(text1);
      const result2 = await generator.generate(text2);

      const similarity = EmbeddingGenerator.cosineSimilarity(
        result1.vector,
        result2.vector
      );

      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('euclideanDistance', () => {
    it('应该计算相同向量的距离为 0', () => {
      const vector = [0.5, 0.5, 0.5, 0.5];
      const distance = EmbeddingGenerator.euclideanDistance(vector, vector);
      expect(distance).toBeCloseTo(0, 5);
    });

    it('应该计算不同向量的距离大于 0', () => {
      const vector1 = [1, 0, 0, 0];
      const vector2 = [0, 1, 0, 0];
      const distance = EmbeddingGenerator.euclideanDistance(vector1, vector2);
      expect(distance).toBeGreaterThan(0);
    });

    it('应该抛出错误当向量维度不匹配', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [0, 1];
      expect(() => {
        EmbeddingGenerator.euclideanDistance(vector1, vector2);
      }).toThrow('Vectors must have the same dimension');
    });
  });

  describe('euclideanToSimilarity', () => {
    it('应该将距离 0 转换为相似度 1', () => {
      const similarity = EmbeddingGenerator.euclideanToSimilarity(0);
      expect(similarity).toBe(1);
    });

    it('应该将距离转换为 0-1 范围的相似度', () => {
      const distances = [0, 0.5, 1, 2, 5];
      distances.forEach(distance => {
        const similarity = EmbeddingGenerator.euclideanToSimilarity(distance);
        expect(similarity).toBeGreaterThan(0);
        expect(similarity).toBeLessThanOrEqual(1);
      });
    });
  });
});
