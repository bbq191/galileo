/**
 * 向量嵌入生成器
 * 将文本转换为向量表示
 */

import { Vector, EmbeddingOptions, EmbeddingResult } from './types';

/**
 * 向量嵌入生成器
 * 使用简单的文本特征提取（可替换为 AI 模型）
 */
export class EmbeddingGenerator {
  private dimension: number;
  private model: string;

  constructor(options: EmbeddingOptions = {}) {
    this.dimension = 384; // 默认维度（与常见的 sentence-transformers 模型一致）
    this.model = options.model || 'simple-hash';
  }

  /**
   * 生成单个文本的向量
   */
  async generate(text: string): Promise<EmbeddingResult> {
    const vector = await this.textToVector(text);

    return {
      text,
      vector,
      dimension: vector.length,
      timestamp: new Date(),
    };
  }

  /**
   * 批量生成向量
   */
  async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(text => this.generate(text)));
  }

  /**
   * 将文本转换为向量
   *
   * 实现策略：
   * 1. 简单方案：基于字符哈希的向量化（当前实现）
   * 2. 高级方案：集成 AI 模型（如 Deepseek Embedding API）
   */
  private async textToVector(text: string): Promise<Vector> {
    // 清理文本
    const cleanText = this.cleanText(text);

    switch (this.model) {
      case 'simple-hash':
        return this.simpleHashEmbedding(cleanText);

      case 'ai-model':
        // TODO: 集成 AI 模型
        // return await this.aiModelEmbedding(cleanText);
        return this.simpleHashEmbedding(cleanText);

      default:
        return this.simpleHashEmbedding(cleanText);
    }
  }

  /**
   * 清理文本
   */
  private cleanText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 1000); // 限制长度
  }

  /**
   * 简单哈希向量化（用于原型和测试）
   *
   * 算法：
   * 1. 提取 n-grams（字符、词组）
   * 2. 计算特征哈希
   * 3. 生成固定维度的向量
   */
  private simpleHashEmbedding(text: string): Vector {
    const vector = new Array(this.dimension).fill(0);

    // 1. 字符级 n-grams
    for (let i = 0; i < text.length - 1; i++) {
      const bigram = text.substring(i, i + 2);
      const hash = this.stringHash(bigram);
      const index = Math.abs(hash) % this.dimension;
      vector[index] += 1;
    }

    // 2. 词级 n-grams
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = this.stringHash(word);
      const index = Math.abs(hash) % this.dimension;
      vector[index] += 2; // 词的权重更高
    }

    // 3. 词对（bigrams）
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]}_${words[i + 1]}`;
      const hash = this.stringHash(bigram);
      const index = Math.abs(hash) % this.dimension;
      vector[index] += 1.5;
    }

    // 归一化向量（L2 norm）
    return this.normalizeVector(vector);
  }

  /**
   * 字符串哈希函数
   */
  private stringHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * 向量归一化（L2 范数）
   */
  private normalizeVector(vector: Vector): Vector {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

    if (norm === 0) {
      return vector;
    }

    return vector.map(val => val / norm);
  }

  /**
   * AI 模型向量化（预留接口）
   *
   * 可集成：
   * - Deepseek Embedding API
   * - OpenAI Embeddings
   * - 本地 sentence-transformers 模型
   */
  private async aiModelEmbedding(text: string): Promise<Vector> {
    // TODO: 实现 AI 模型调用
    // 示例代码：
    // const response = await fetch('https://api.deepseek.com/v1/embeddings', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    //   },
    //   body: JSON.stringify({
    //     model: 'deepseek-embedding-v1',
    //     input: text
    //   })
    // });
    // const data = await response.json();
    // return data.data[0].embedding;

    throw new Error('AI model embedding not implemented yet');
  }

  /**
   * 获取向量维度
   */
  getDimension(): number {
    return this.dimension;
  }

  /**
   * 获取模型名称
   */
  getModel(): string {
    return this.model;
  }

  /**
   * 计算两个向量的余弦相似度
   */
  static cosineSimilarity(vectorA: Vector, vectorB: Vector): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimension');
    }

    const dotProduct = vectorA.reduce((sum, a, i) => sum + a * vectorB[i], 0);

    // 如果向量已归一化，点积就是余弦相似度
    return Math.max(0, Math.min(1, dotProduct));
  }

  /**
   * 计算两个向量的欧氏距离
   */
  static euclideanDistance(vectorA: Vector, vectorB: Vector): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimension');
    }

    const sum = vectorA.reduce((s, a, i) => s + Math.pow(a - vectorB[i], 2), 0);
    return Math.sqrt(sum);
  }

  /**
   * 将欧氏距离转换为相似度分数（0-1）
   */
  static euclideanToSimilarity(distance: number): number {
    return 1 / (1 + distance);
  }
}
