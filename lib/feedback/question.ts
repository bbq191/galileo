/**
 * 问题哈希（服务端）
 *
 * 归一化规则与相似度见 ./similarity（可在浏览器中使用）。
 */

import crypto from 'crypto';
import { normalizeQuestion } from './similarity';

export { normalizeQuestion, questionSimilarity } from './similarity';

export function questionHash(question: string): string {
  return crypto.createHash('md5').update(normalizeQuestion(question)).digest('hex');
}

export function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
