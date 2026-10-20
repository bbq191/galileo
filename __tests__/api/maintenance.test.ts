/**
 * 维护任务接口 + 单数据源同步失败处理
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const cleanupOldLogs = jest.fn(async (days: number) => days * 10);
const syncDataSource = jest.fn<(options: any) => Promise<any>>();
const dataSourceFindMany = jest.fn(async (..._args: any[]) => [
  { id: 1, name: 'main', targetDatabases: '["shop"]' },
  { id: 2, name: 'crm', targetDatabases: null },
]);
const dataSourceFindUnique = jest.fn(async (..._args: any[]) => ({ targetDatabases: null }));

jest.mock('@/lib/di/setup', () => ({
  getAuditOrchestrator: () => ({ cleanupOldLogs }),
  getMetadataOrchestrator: () => ({ syncDataSource }),
  getPrismaClient: () => ({ dataSource: { findMany: dataSourceFindMany, findUnique: dataSourceFindUnique } }),
}));

import { POST as cleanupHistory } from '@/app/api/admin/maintenance/cleanup-history/route';
import { POST as syncAll } from '@/app/api/admin/maintenance/sync-datasources/route';
import { POST as syncOne } from '@/app/api/datasources/[id]/sync/route';
import { resolveRouteAccess } from '@/lib/auth/route-policy';
import { Permission } from '@/lib/auth/permissions';

const originalEnv = { ...process.env };

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  syncDataSource.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

const post = (path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

describe('POST /api/admin/maintenance/cleanup-history', () => {
  it('默认保留 90 天', async () => {
    const res = await cleanupHistory(post('/api/admin/maintenance/cleanup-history'));

    expect(await res.json()).toEqual({ success: true, data: { deleted: 900, retentionDays: 90 } });
    expect(cleanupOldLogs).toHaveBeenLastCalledWith(90);
  });

  it('可通过环境变量或请求体调整，过小的值被拒绝', async () => {
    process.env.QUERY_HISTORY_RETENTION_DAYS = '30';
    await cleanupHistory(post('/api/admin/maintenance/cleanup-history'));
    expect(cleanupOldLogs).toHaveBeenLastCalledWith(30);

    await cleanupHistory(post('/api/admin/maintenance/cleanup-history', { days: 180 }));
    expect(cleanupOldLogs).toHaveBeenLastCalledWith(180);

    const res = await cleanupHistory(post('/api/admin/maintenance/cleanup-history', { days: 1 }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/maintenance/sync-datasources', () => {
  it('依次同步全部 active 数据源，使用各自配置的目标库，不做关系推断与 AI 标注', async () => {
    syncDataSource.mockResolvedValue({ success: true, tableCount: 3 });

    const res = await syncAll();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ total: 2, failed: 0 });
    expect(dataSourceFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'active' } }));
    expect(syncDataSource).toHaveBeenNthCalledWith(1, expect.objectContaining({
      dataSourceId: 1,
      databases: ['shop'],
      inferRelationships: false,
      enableAIAnnotation: false,
    }));
    expect(syncDataSource).toHaveBeenNthCalledWith(2, expect.objectContaining({ dataSourceId: 2, databases: undefined }));
  });

  it('单个数据源失败（返回 success: false 或抛异常）不影响其他数据源，整体返回 207', async () => {
    syncDataSource
      .mockResolvedValueOnce({ success: false, error: 'Connection refused' })
      .mockResolvedValueOnce({ success: true, tableCount: 5 });

    const res = await syncAll();
    const body = await res.json();

    expect(res.status).toBe(207);
    expect(body.success).toBe(false);
    expect(body.data.results).toEqual([
      expect.objectContaining({ id: 1, success: false, error: 'Connection refused' }),
      expect.objectContaining({ id: 2, success: true, tableCount: 5 }),
    ]);

    syncDataSource.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ success: true, tableCount: 1 });
    const second = await (await syncAll()).json();
    expect(second.data.failed).toBe(1);
  });

  it('需要系统配置权限（管理员或 X-API-Key）', () => {
    expect(resolveRouteAccess('/api/admin/maintenance/sync-datasources', 'POST')).toEqual({
      kind: 'authenticated',
      permission: Permission.SYSTEM_CONFIG,
    });
  });
});

describe('POST /api/datasources/[id]/sync', () => {
  it('同步失败时返回错误，而不是「同步成功」', async () => {
    syncDataSource.mockResolvedValue({ success: false, databaseCount: 0, tableCount: 0, columnCount: 0, error: 'Access denied' });

    const res = await syncOne(post('/api/datasources/1/sync', {}), { params: Promise.resolve({ id: '1' }) });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: 'error', message: '元数据同步失败', error: 'Access denied' });
  });
});
