/**
 * 问题推荐：重建与查询
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import {
  containsSensitive,
  listSuggestions,
  rebuildSuggestions,
  setSuggestionHidden,
} from '@/lib/suggestions/question-suggestions';
import { questionHash } from '@/lib/feedback/question';

type Mock = jest.Mock<(...args: any[]) => Promise<any>>;
const fn = (impl: (...args: any[]) => any = () => undefined): Mock => jest.fn(async (...args: any[]) => impl(...args));

const H = (q: string) => questionHash(q);

function fakePrisma(options: { stats?: any[]; latest?: any[]; verified?: any[]; hidden?: string[]; templates?: any[]; rows?: any[] } = {}) {
  const prisma: any = {
    $queryRaw: fn(() => options.stats ?? []),
    queryAuditLog: { findMany: fn(() => options.latest ?? []) },
    verifiedQuery: { findMany: fn(() => options.verified ?? []) },
    queryTemplate: { findMany: fn(() => options.templates ?? []) },
    questionSuggestion: {
      findMany: fn(({ where }) =>
        where?.isHidden === true ? (options.hidden ?? []).map((questionHash) => ({ questionHash })) : options.rows ?? []
      ),
      deleteMany: fn(),
      createMany: fn(),
      findUnique: fn(() => null),
      update: fn(),
    },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  return prisma;
}

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('containsSensitive', () => {
  it('长数字串（含分隔）与邮箱视为敏感；短数字不算', () => {
    expect(containsSensitive('查询手机号 13800138000 的订单')).toBe(true);
    expect(containsSensitive('订单 2024-0101-88 的状态')).toBe(true);
    expect(containsSensitive('a@b.com 的注册时间')).toBe(true);
    expect(containsSensitive('2024 年 10 月 TOP10 商品')).toBe(false);
  });
});

describe('rebuildSuggestions', () => {
  it('按 已验证 > 多人问过 > 模板 去重；排除隐藏与敏感问题；保留隐藏行', async () => {
    process.env.ENABLE_BUSINESS_RULES = 'true';
    const prisma = fakePrisma({
      stats: [
        { questionHash: H('各城市订单数'), userCount: BigInt(5), okCount: BigInt(9), total: BigInt(10) },
        { questionHash: H('上月GMV'), userCount: BigInt(3), okCount: BigInt(3), total: BigInt(3) },
        { questionHash: H('手机号13800138000的订单'), userCount: BigInt(2), okCount: BigInt(2), total: BigInt(2) },
        { questionHash: H('隐藏的问题'), userCount: BigInt(2), okCount: BigInt(2), total: BigInt(2) },
      ],
      latest: [
        { questionHash: H('各城市订单数'), naturalLanguageQuery: '各城市订单数', dataSourceIds: '[1]' },
        { questionHash: H('上月GMV'), naturalLanguageQuery: '上月 GMV', dataSourceIds: null },
        { questionHash: H('手机号13800138000的订单'), naturalLanguageQuery: '手机号13800138000的订单', dataSourceIds: '[1]' },
        { questionHash: H('隐藏的问题'), naturalLanguageQuery: '隐藏的问题', dataSourceIds: '[1]' },
      ],
      verified: [{ id: 7, question: '各城市订单数', questionHash: H('各城市订单数'), dataSourceIds: '[1]', hitCount: 3 }],
      hidden: [H('隐藏的问题')],
      templates: [{ examples: JSON.stringify(['上月 GMV', '本周新增用户', '查询{时间}的{指标}']) }],
    });

    const summary = await rebuildSuggestions(prisma, new Date(2026, 9, 21));

    expect(summary).toEqual({ verified: 1, popular: 1, template: 1, hidden: 1 });
    expect(prisma.questionSuggestion.deleteMany).toHaveBeenCalledWith({ where: { isHidden: false } });
    const { data } = prisma.questionSuggestion.createMany.mock.calls[0][0];
    expect(data.map((d: any) => [d.question, d.source])).toEqual([
      ['各城市订单数', 'verified'],
      ['上月 GMV', 'popular'],
      ['本周新增用户', 'template'],
    ]);
    // 已验证的问题沿用热门统计中的提问人数
    expect(data[0]).toMatchObject({ verifiedQueryId: 7, userCount: 5, successRate: 0.9 });
    expect(data[1]).toMatchObject({ dataSourceIds: '[]', userCount: 3, successRate: 1, score: 3 });
  });

  it('未开启业务规则时不使用模板示例', async () => {
    delete process.env.ENABLE_BUSINESS_RULES;
    const prisma = fakePrisma({ templates: [{ examples: JSON.stringify(['本周新增用户']) }] });

    const summary = await rebuildSuggestions(prisma);

    expect(summary.template).toBe(0);
    expect(prisma.queryTemplate.findMany).not.toHaveBeenCalled();
    expect(prisma.questionSuggestion.createMany).not.toHaveBeenCalled();
  });
});

describe('listSuggestions / setSuggestionHidden', () => {
  it('指定数据源时只返回该数据源或不限数据源的问题', async () => {
    const prisma = fakePrisma({
      rows: [
        { id: 1, question: 'a', source: 'verified', dataSourceIds: '[1]', userCount: 0 },
        { id: 2, question: 'b', source: 'popular', dataSourceIds: '[2]', userCount: 3 },
        { id: 3, question: 'c', source: 'template', dataSourceIds: '[]', userCount: 0 },
      ],
    });

    expect((await listSuggestions(prisma, 1)).map((s) => s.id)).toEqual([1, 3]);
    expect((await listSuggestions(prisma)).map((s) => s.id)).toEqual([1, 2, 3]);
    expect(prisma.questionSuggestion.findMany.mock.calls[0][0].where).toEqual({ isHidden: false });
  });

  it('隐藏不存在的问题：404', async () => {
    await expect(setSuggestionHidden(fakePrisma(), 9, true)).rejects.toMatchObject({ status: 404 });
  });
});
