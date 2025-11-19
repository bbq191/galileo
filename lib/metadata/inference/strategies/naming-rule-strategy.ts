/**
 * 命名规则策略
 *
 * 职责：基于数据库名称、表名前缀等命名规则推断业务域
 */

import type { BusinessDomain } from '@/app/generated/prisma';
import type { StrategyResult, DatabaseMetadataForInference } from '../domain-inference.types';

/**
 * 命名规则策略
 */
export class NamingRuleStrategy {
  // 业务域命名规则库
  private readonly DOMAIN_PATTERNS: Record<string, RegExp[]> = {
    '用户中心': [
      /user/i,
      /account/i,
      /auth/i,
      /member/i,
      /profile/i,
      /用户/,
      /账号/,
      /认证/,
      /会员/,
    ],
    '订单系统': [
      /order/i,
      /trade/i,
      /payment/i,
      /transaction/i,
      /订单/,
      /交易/,
      /支付/,
    ],
    '商品中心': [
      /product/i,
      /goods/i,
      /item/i,
      /inventory/i,
      /sku/i,
      /spu/i,
      /商品/,
      /库存/,
      /货品/,
    ],
    '财务系统': [
      /finance/i,
      /billing/i,
      /invoice/i,
      /accounting/i,
      /财务/,
      /账单/,
      /发票/,
      /会计/,
    ],
    '营销系统': [
      /marketing/i,
      /campaign/i,
      /coupon/i,
      /promotion/i,
      /discount/i,
      /营销/,
      /优惠/,
      /活动/,
      /促销/,
    ],
    '物流系统': [
      /logistics/i,
      /shipping/i,
      /delivery/i,
      /warehouse/i,
      /物流/,
      /配送/,
      /仓储/,
      /快递/,
    ],
    '客服系统': [
      /customer.*service/i,
      /support/i,
      /ticket/i,
      /feedback/i,
      /客服/,
      /工单/,
      /反馈/,
    ],
    '数据分析': [
      /analytics/i,
      /report/i,
      /dw/i,
      /warehouse/i,
      /bi/i,
      /stat/i,
      /数据/,
      /报表/,
      /分析/,
      /统计/,
    ],
    '运营系统': [
      /operation/i,
      /cms/i,
      /content/i,
      /运营/,
      /内容/,
      /管理/,
    ],
  };

  /**
   * 推断业务域
   */
  async infer(
    database: DatabaseMetadataForInference,
    domains: BusinessDomain[]
  ): Promise<StrategyResult | null> {
    const matches: Map<string, { score: number; features: string[] }> = new Map();

    // 1. 检查数据库名
    for (const [domainName, patterns] of Object.entries(this.DOMAIN_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(database.databaseName)) {
          const current = matches.get(domainName) || { score: 0, features: [] };
          current.score += 0.5; // 数据库名匹配权重高
          current.features.push(`数据库名匹配: ${this.getPatternDescription(pattern)}`);
          matches.set(domainName, current);
        }
      }
    }

    // 2. 检查表名（权重较低）
    const tableNames = database.tables.map(t => t.tableName).join(' ');
    for (const [domainName, patterns] of Object.entries(this.DOMAIN_PATTERNS)) {
      let tableMatchCount = 0;
      const matchedPatterns: string[] = [];

      for (const pattern of patterns) {
        if (pattern.test(tableNames)) {
          tableMatchCount++;
          matchedPatterns.push(this.getPatternDescription(pattern));
        }
      }

      if (tableMatchCount > 0) {
        const current = matches.get(domainName) || { score: 0, features: [] };
        const tableScore = Math.min(tableMatchCount * 0.1, 0.3); // 最多 0.3 分
        current.score += tableScore;
        current.features.push(`${tableMatchCount} 个表名匹配: ${matchedPatterns.slice(0, 3).join(', ')}`);
        matches.set(domainName, current);
      }
    }

    // 3. 检查语义描述（如果存在）
    if (database.semanticDescription) {
      for (const [domainName, patterns] of Object.entries(this.DOMAIN_PATTERNS)) {
        for (const pattern of patterns) {
          if (pattern.test(database.semanticDescription)) {
            const current = matches.get(domainName) || { score: 0, features: [] };
            current.score += 0.2;
            current.features.push(`描述匹配: ${this.getPatternDescription(pattern)}`);
            matches.set(domainName, current);
          }
        }
      }
    }

    // 4. 找到最佳匹配
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const [domainName, { score }] of matches.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestMatch = domainName;
      }
    }

    // 如果没有匹配或得分太低，返回 null
    if (!bestMatch || bestScore < 0.3) {
      return null;
    }

    const domain = domains.find(d => d.name === bestMatch);
    if (!domain) {
      return null;
    }

    const matchInfo = matches.get(bestMatch)!;

    return {
      strategyName: 'naming_rule',
      domainId: domain.id,
      score: Math.min(bestScore, 1.0),
      features: matchInfo.features,
      weight: 0.4, // 命名规则策略权重
    };
  }

  /**
   * 获取正则表达式的可读描述
   */
  private getPatternDescription(pattern: RegExp): string {
    const source = pattern.source;
    // 移除正则特殊字符，返回关键词
    return source.replace(/[\/.*\[\](){}?+^$|\\]/g, '');
  }
}
