/**
 * 业务域旧接口弃用：/api/metadata/domains CRUD → /api/domains
 */
import { describe, it, expect, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

const findMany = jest.fn(async (..._args: any[]) => [{ id: 1, name: '默认域', description: null, ownerTeam: null }]);

jest.mock('@/lib/di/setup', () => ({
  getService: () => ({ businessDomain: { findMany } }),
}));

import { GET } from '@/app/api/metadata/domains/route';
import { isEndpointDeprecated } from '@/lib/api/version-middleware';

describe('业务域旧接口弃用', () => {
  it('GET /api/metadata/domains 正常返回，并带上弃用响应头', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await GET(new NextRequest('http://localhost/api/metadata/domains'));

    expect(res.status).toBe(200);
    expect((await res.json()).data.domains).toHaveLength(1);
    expect(res.headers.get('Deprecation')).toBe('true');
    expect(res.headers.get('Sunset')).toBe('2027-01-20');
    expect(res.headers.get('Link')).toBe('</api/domains>; rel="successor-version"');
  });

  it.each([
    ['/api/metadata/domains', true],
    ['/api/metadata/domains/', true],
    ['/api/metadata/domains/12', true],
    ['/api/metadata/domains/infer', false],
    ['/api/metadata/domains/batch-infer', false],
    ['/api/metadata/domains/apply', false],
    ['/api/metadata/domains/metrics', false],
    ['/api/domains', false],
  ])('%s 弃用=%s', (path, deprecated) => {
    expect(!!isEndpointDeprecated(path)).toBe(deprecated);
  });
});
