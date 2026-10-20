import { describe, it, expect, afterEach } from '@jest/globals';
import { isFeatureEnabled, getFeatureFlags } from '@/lib/feature-flags';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('feature-flags', () => {
  it('默认关闭', () => {
    delete process.env.ENABLE_SQL_PIPELINE;
    expect(isFeatureEnabled('sqlPipeline')).toBe(false);
  });

  it('仅 "true" 启用', () => {
    process.env.ENABLE_SQL_PIPELINE = '1';
    expect(isFeatureEnabled('sqlPipeline')).toBe(false);

    process.env.ENABLE_SQL_PIPELINE = 'true';
    expect(isFeatureEnabled('sqlPipeline')).toBe(true);
  });

  it('getFeatureFlags 返回全部开关', () => {
    process.env.ENABLE_SQL_PIPELINE = 'true';
    delete process.env.ENABLE_BUSINESS_RULES;

    expect(getFeatureFlags()).toEqual({ sqlPipeline: true, businessRules: false });
  });
});
