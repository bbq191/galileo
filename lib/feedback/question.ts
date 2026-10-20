/**
 * 问题归一化与相似度
 *
 * 用于「完全相同的问题」判定（归一化后比较哈希）与相似问题排序。
 * 相似度使用字符二元组的 Dice 系数：不依赖分词，对中文可用；
 * MySQL 全文索引默认按空格分词，无法用于中文，因此相似度在应用层计算。
 */

import crypto from 'crypto';

/** 去掉空白与中英文标点，英文转小写 */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}

export function questionHash(question: string): string {
  return crypto.createHash('md5').update(normalizeQuestion(question)).digest('hex');
}

function bigrams(text: string): Map<string, number> {
  const chars = Array.from(text);
  const grams = new Map<string, number>();
  if (chars.length === 1) {
    grams.set(chars[0], 1);
  }
  for (let i = 0; i < chars.length - 1; i++) {
    const gram = chars[i] + chars[i + 1];
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** 0 ~ 1，1 表示归一化后完全相同 */
export function questionSimilarity(a: string, b: string): number {
  const na = normalizeQuestion(a);
  const nb = normalizeQuestion(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  let total = 0;
  for (const count of ga.values()) total += count;
  for (const count of gb.values()) total += count;
  for (const [gram, count] of ga) {
    overlap += Math.min(count, gb.get(gram) ?? 0);
  }
  return (2 * overlap) / total;
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
