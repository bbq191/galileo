/**
 * 关系查询 API 集成测试
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

describe('关系查询 API', () => {
  let testTableId: number;
  let testDatabaseId: number;
  let testInferredRelationshipId: number;

  async function apiRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ) {
    const url = `${API_BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();
    return { response, data };
  }

  beforeAll(async () => {
    // 尝试获取一个测试表 ID
    const { data: sourcesData } = await apiRequest('/datasources');
    if (sourcesData.status === 'success' && sourcesData.data.length > 0) {
      const sourceId = sourcesData.data[0].id;

      const { data: dbData } = await apiRequest(
        `/metadata/databases?sourceId=${sourceId}`
      );
      if (dbData.status === 'success' && dbData.data.length > 0) {
        testDatabaseId = dbData.data[0].id;

        const { data: tablesData } = await apiRequest(
          `/metadata/tables?databaseId=${testDatabaseId}&limit=1`
        );
        if (
          tablesData.status === 'success' &&
          tablesData.data.length > 0
        ) {
          testTableId = tablesData.data[0].id;
        }
      }
    }
  });

  describe('GET /api/relationships - 获取关系列表', () => {
    it('应该返回所有关系列表', async () => {
      const { response, data } = await apiRequest('/relationships');

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('pagination');
      expect(data.pagination).toHaveProperty('total');
      expect(data.pagination).toHaveProperty('page');
      expect(data.pagination).toHaveProperty('limit');

      if (data.data.length > 0) {
        const relationship = data.data[0];
        expect(relationship).toHaveProperty('type');
        expect(relationship).toHaveProperty('sourceTableId');
        expect(relationship).toHaveProperty('targetTableId');
        expect(relationship).toHaveProperty('relationshipType');
        expect(relationship).toHaveProperty('confidenceScore');

        if (relationship.type === 'inferred') {
          testInferredRelationshipId = relationship.id;
          expect(relationship).toHaveProperty('isVerified');
          expect(relationship).toHaveProperty('reasoning');
        }
      }
    });

    it('应该只返回显式关系（type=explicit）', async () => {
      const { response, data } = await apiRequest(
        '/relationships?type=explicit'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');

      if (data.data.length > 0) {
        data.data.forEach((rel: any) => {
          expect(rel.type).toBe('explicit');
          expect(rel.confidenceScore).toBe(1.0);
        });
      }
    });

    it('应该只返回推断关系（type=inferred）', async () => {
      const { response, data } = await apiRequest(
        '/relationships?type=inferred'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');

      if (data.data.length > 0) {
        data.data.forEach((rel: any) => {
          expect(rel.type).toBe('inferred');
          expect(rel).toHaveProperty('isVerified');
        });
      }
    });

    it('应该支持按表 ID 过滤', async () => {
      if (!testTableId) {
        console.log('跳过测试：testTableId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/relationships?tableId=${testTableId}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');

      if (data.data.length > 0) {
        data.data.forEach((rel: any) => {
          const isRelated =
            rel.sourceTableId === testTableId ||
            rel.targetTableId === testTableId;
          expect(isRelated).toBe(true);
        });
      }
    });

    it('应该支持按验证状态过滤（verified=false）', async () => {
      const { response, data } = await apiRequest(
        '/relationships?type=inferred&verified=false'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');

      if (data.data.length > 0) {
        data.data.forEach((rel: any) => {
          expect(rel.isVerified).toBe(false);
        });
      }
    });

    it('应该支持按验证状态过滤（verified=true）', async () => {
      const { response, data } = await apiRequest(
        '/relationships?type=inferred&verified=true'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');

      if (data.data.length > 0) {
        data.data.forEach((rel: any) => {
          expect(rel.isVerified).toBe(true);
        });
      }
    });

    it('应该支持最小置信度过滤', async () => {
      const minConfidence = 0.8;
      const { response, data } = await apiRequest(
        `/relationships?type=inferred&minConfidence=${minConfidence}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');

      if (data.data.length > 0) {
        data.data.forEach((rel: any) => {
          expect(rel.confidenceScore).toBeGreaterThanOrEqual(minConfidence);
        });
      }
    });

    it('应该支持分页', async () => {
      const { response, data } = await apiRequest(
        '/relationships?page=1&limit=5'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/relationships/graph - 获取关系图谱', () => {
    it('缺少 tableId 或 databaseId 应该返回 400 错误', async () => {
      const { response, data } = await apiRequest('/relationships/graph');

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('Either tableId or databaseId is required');
    });

    it('应该返回指定表的关系图谱', async () => {
      if (!testTableId) {
        console.log('跳过测试：testTableId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/relationships/graph?tableId=${testTableId}&depth=2`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data).toHaveProperty('nodes');
      expect(data.data).toHaveProperty('edges');
      expect(data.data).toHaveProperty('metadata');

      expect(Array.isArray(data.data.nodes)).toBe(true);
      expect(Array.isArray(data.data.edges)).toBe(true);

      // 验证 metadata
      const metadata = data.data.metadata;
      expect(metadata).toHaveProperty('nodeCount');
      expect(metadata).toHaveProperty('edgeCount');
      expect(metadata).toHaveProperty('explicitEdgeCount');
      expect(metadata).toHaveProperty('inferredEdgeCount');
      expect(metadata).toHaveProperty('depth');
      expect(metadata.centerTableId).toBe(testTableId);

      // 验证节点结构
      if (data.data.nodes.length > 0) {
        const node = data.data.nodes[0];
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('label');
        expect(node).toHaveProperty('type');
        expect(node.type).toBe('table');
        expect(node).toHaveProperty('databaseId');
        expect(node).toHaveProperty('databaseName');
      }

      // 验证边结构
      if (data.data.edges.length > 0) {
        const edge = data.data.edges[0];
        expect(edge).toHaveProperty('id');
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
        expect(edge).toHaveProperty('type');
        expect(['explicit', 'inferred']).toContain(edge.type);
        expect(edge).toHaveProperty('relationshipType');
        expect(edge).toHaveProperty('sourceColumn');
        expect(edge).toHaveProperty('targetColumn');
      }
    });

    it('应该返回指定数据库的关系图谱', async () => {
      if (!testDatabaseId) {
        console.log('跳过测试：testDatabaseId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/relationships/graph?databaseId=${testDatabaseId}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data).toHaveProperty('nodes');
      expect(data.data).toHaveProperty('edges');
    });

    it('应该支持不包含推断关系（includeInferred=false）', async () => {
      if (!testTableId) {
        console.log('跳过测试：testTableId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/relationships/graph?tableId=${testTableId}&includeInferred=false`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');

      if (data.data.edges.length > 0) {
        data.data.edges.forEach((edge: any) => {
          expect(edge.type).toBe('explicit');
        });
      }
    });

    it('应该支持最小置信度过滤', async () => {
      if (!testTableId) {
        console.log('跳过测试：testTableId 未设置');
        return;
      }

      const minConfidence = 0.85;
      const { response, data } = await apiRequest(
        `/relationships/graph?tableId=${testTableId}&minConfidence=${minConfidence}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');

      if (data.data.edges.length > 0) {
        data.data.edges
          .filter((edge: any) => edge.type === 'inferred')
          .forEach((edge: any) => {
            expect(edge.confidence).toBeGreaterThanOrEqual(minConfidence);
          });
      }
    });

    it('应该支持自定义深度', async () => {
      if (!testTableId) {
        console.log('跳过测试：testTableId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/relationships/graph?tableId=${testTableId}&depth=1`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data.metadata.depth).toBe(1);
    });
  });

  describe('POST /api/relationships/verify - 验证推断关系', () => {
    it('缺少必填字段应该返回 400 错误', async () => {
      const { response, data } = await apiRequest(
        '/relationships/verify',
        'POST',
        {
          // 缺少 relationshipId 和 verified
        }
      );

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('Missing required fields');
    });

    it('不存在的推断关系应该返回 404 错误', async () => {
      const { response, data } = await apiRequest(
        '/relationships/verify',
        'POST',
        {
          relationshipId: 99999,
          verified: true,
        }
      );

      expect(response.status).toBe(404);
      expect(data.status).toBe('error');
      expect(data.message).toContain('not found');
    });

    it('应该成功验证推断关系（action=verify）', async () => {
      if (!testInferredRelationshipId) {
        console.log('跳过测试：testInferredRelationshipId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        '/relationships/verify',
        'POST',
        {
          relationshipId: testInferredRelationshipId,
          verified: true,
          verifiedBy: 'test-user',
          action: 'verify',
        }
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data).toHaveProperty('isVerified');
      expect(data.data.isVerified).toBe(true);
      expect(data.data).toHaveProperty('verifiedBy');
      expect(data.data).toHaveProperty('verifiedAt');
    });

    it('应该成功拒绝推断关系（action=reject）', async () => {
      // 先获取一个未验证的推断关系
      const { data: relationshipsData } = await apiRequest(
        '/relationships?type=inferred&verified=false&limit=1'
      );

      if (
        relationshipsData.status !== 'success' ||
        relationshipsData.data.length === 0
      ) {
        console.log('跳过测试：没有可用的推断关系');
        return;
      }

      const relationshipId = relationshipsData.data[0].id;

      const { response, data } = await apiRequest(
        '/relationships/verify',
        'POST',
        {
          relationshipId,
          verified: false,
          action: 'reject',
        }
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.message).toContain('rejected and removed');

      // 验证关系已删除
      const { data: checkData } = await apiRequest(
        `/relationships?type=inferred`
      );
      const exists = checkData.data.some(
        (rel: any) => rel.id === relationshipId
      );
      expect(exists).toBe(false);
    });

    it('应该成功转换为显式关系（action=convert）', async () => {
      // 先获取一个未验证的推断关系
      const { data: relationshipsData } = await apiRequest(
        '/relationships?type=inferred&verified=false&limit=1'
      );

      if (
        relationshipsData.status !== 'success' ||
        relationshipsData.data.length === 0
      ) {
        console.log('跳过测试：没有可用的推断关系');
        return;
      }

      const relationshipId = relationshipsData.data[0].id;

      const { response, data } = await apiRequest(
        '/relationships/verify',
        'POST',
        {
          relationshipId,
          verified: true,
          action: 'convert',
        }
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.message).toContain('converted to explicit relationship');
      expect(data.data).toHaveProperty('explicitRelationship');
      expect(data.data.explicitRelationship).toHaveProperty('id');

      // 验证推断关系已删除
      const { data: inferredData } = await apiRequest(
        '/relationships?type=inferred'
      );
      const inferredExists = inferredData.data.some(
        (rel: any) => rel.id === relationshipId
      );
      expect(inferredExists).toBe(false);

      // 验证显式关系已创建
      const { data: explicitData } = await apiRequest(
        '/relationships?type=explicit'
      );
      const explicitExists = explicitData.data.some(
        (rel: any) => rel.id === data.data.explicitRelationship.id
      );
      expect(explicitExists).toBe(true);
    });
  });
});
