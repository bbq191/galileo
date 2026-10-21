/**
 * 契约测试：GET /api/datasources
 * 数据源、元数据、关系图谱、业务域管理页面均依赖此结构
 *
 * 另：创建 / 更新时只接受 MySQL / MariaDB
 */
import { describe, it, expect, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

const listDataSources = jest.fn<(status?: string) => Promise<any[]>>();
const createDataSource = jest.fn<(options: any) => Promise<any>>();
const updateDataSource = jest.fn<(options: any) => Promise<any>>();

jest.mock('@/lib/di/setup', () => ({
  getDataSourceOrchestrator: () => ({ listDataSources, createDataSource, updateDataSource }),
}));

import { GET, POST } from '@/app/api/datasources/route';
import { PUT } from '@/app/api/datasources/[id]/route';
import { ConnectionPool } from '@/lib/database/connection-pool';

describe('GET /api/datasources', () => {
  it('成功：{ status: "success", data, total }', async () => {
    listDataSources.mockResolvedValue([{ id: 1, name: 'main' }]);

    const res = await GET(new NextRequest('http://localhost/api/datasources'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'success', data: [{ id: 1, name: 'main' }], total: 1 });
    expect(listDataSources).toHaveBeenCalledWith(undefined);
  });

  it('透传 status 过滤参数', async () => {
    listDataSources.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost/api/datasources?status=active'));

    expect(listDataSources).toHaveBeenCalledWith('active');
  });

  it('服务异常：500 + safeErrorResponse 结构 { success: false, error: { code, message } }', async () => {
    listDataSources.mockRejectedValue(new Error('boom'));

    const res = await GET(new NextRequest('http://localhost/api/datasources'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: { code: expect.any(String), message: expect.any(String) },
    });
  });
});

describe('数据源类型限制', () => {
  const base = { name: 'pg_main', host: 'db.internal', port: 5432, username: 'u', password: 'p' };
  const jsonRequest = (url: string, method: string, body: unknown) =>
    new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

  it('创建 PostgreSQL 数据源：400，不调用创建', async () => {
    const res = await POST(jsonRequest('http://localhost/api/datasources', 'POST', { ...base, type: 'postgresql' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(JSON.stringify(body)).toContain('目前仅支持 MySQL / MariaDB');
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it('把已有数据源改为 PostgreSQL：400，不调用更新；不改类型时正常更新', async () => {
    const context = { params: Promise.resolve({ id: '1' }) };
    const res = await PUT(jsonRequest('http://localhost/api/datasources/1', 'PUT', { type: 'postgresql' }), context);

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('目前仅支持 MySQL / MariaDB');
    expect(updateDataSource).not.toHaveBeenCalled();

    updateDataSource.mockResolvedValue({ success: true, dataSource: { id: 1, name: 'main', type: 'mysql' } });
    const ok = await PUT(jsonRequest('http://localhost/api/datasources/1', 'PUT', { name: 'main' }), context);
    expect(ok.status).toBe(200);
  });

  it('数据库中已有的 PostgreSQL 数据源不建立连接', async () => {
    const pool = new ConnectionPool({ id: '9', name: 'legacy_pg', type: 'postgresql' as any, host: 'h', port: 5432, username: 'u', password: '', databases: [] }, { min: 0, max: 1 } as any);

    await expect(pool.initialize()).rejects.toThrow('暂不支持该数据库类型，目前仅支持 MySQL / MariaDB（postgresql）');
  });
});

