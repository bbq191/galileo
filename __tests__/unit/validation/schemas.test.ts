// __tests__/unit/validation/schemas.test.ts
import { schemas } from '@/lib/validation/schemas';
import { validateRequest } from '@/lib/validation/validator';

describe('Input Validation Schemas', () => {
  describe('QueryExecuteSchema', () => {
    it('应接受有效的查询输入', () => {
      const input = {
        query: '查询所有用户',
      };

      const result = validateRequest(schemas.queryExecute, input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        query: '查询所有用户',
        options: undefined,
      });
    });

    it('应接受带选项的查询输入', () => {
      const input = {
        query: '查询所有用户',
        options: {
          enableCache: true,
          maxRows: 100,
          timeout: 5000,
        },
      };

      const result = validateRequest(schemas.queryExecute, input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    it('应拒绝空查询', () => {
      const input = {
        query: '',
      };

      const result = validateRequest(schemas.queryExecute, input);

      expect(result.success).toBe(false);
      expect(result.errors?.query).toContain('查询内容不能为空');
    });

    it('应拒绝超长查询', () => {
      const input = {
        query: 'a'.repeat(5001),
      };

      const result = validateRequest(schemas.queryExecute, input);

      expect(result.success).toBe(false);
      expect(result.errors?.query).toContain('查询内容不能超过 5000 字符');
    });

    it('应拒绝包含危险字符的查询', () => {
      const input = {
        query: '<script>alert("xss")</script>',
      };

      const result = validateRequest(schemas.queryExecute, input);

      expect(result.success).toBe(false);
      expect(result.errors?.query).toContain('查询包含非法字符');
    });

    it('应拒绝无效的 maxRows 选项', () => {
      const input = {
        query: '查询所有用户',
        options: {
          maxRows: 20000, // 超过 10000 上限
        },
      };

      const result = validateRequest(schemas.queryExecute, input);

      expect(result.success).toBe(false);
    });
  });

  describe('MetadataSyncSchema', () => {
    it('应接受有效的同步请求', () => {
      const input = {
        dataSourceId: 1,
      };

      const result = validateRequest(schemas.metadataSync, input);

      expect(result.success).toBe(true);
      expect(result.data?.dataSourceId).toBe(1);
    });

    it('应接受带数据库列表的同步请求', () => {
      const input = {
        dataSourceId: 1,
        databases: ['db1', 'db2'],
        inferRelationships: true,
        minConfidence: 0.8,
        trackChanges: true,
      };

      const result = validateRequest(schemas.metadataSync, input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    it('应拒绝无效的数据源 ID', () => {
      const input = {
        dataSourceId: -1,
      };

      const result = validateRequest(schemas.metadataSync, input);

      expect(result.success).toBe(false);
      expect(result.errors?.dataSourceId).toContain('数据源 ID 必须是正整数');
    });

    it('应拒绝超过数量限制的数据库列表', () => {
      const input = {
        dataSourceId: 1,
        databases: Array(51).fill('db'),
      };

      const result = validateRequest(schemas.metadataSync, input);

      expect(result.success).toBe(false);
      expect(result.errors?.databases).toContain('最多同时同步 50 个数据库');
    });

    it('应拒绝无效的置信度', () => {
      const input = {
        dataSourceId: 1,
        minConfidence: 1.5, // 超过 1
      };

      const result = validateRequest(schemas.metadataSync, input);

      expect(result.success).toBe(false);
      expect(result.errors?.minConfidence).toContain('置信度必须在 0-1 之间');
    });
  });

  describe('DatasourceCreateSchema', () => {
    it('应接受有效的数据源创建请求', () => {
      const input = {
        name: 'test_db',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'password',
      };

      const result = validateRequest(schemas.datasourceCreate, input);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('test_db');
    });

    it('应接受字符串形式的端口号', () => {
      const input = {
        name: 'test_db',
        type: 'mysql',
        host: 'localhost',
        port: '3306',
        username: 'root',
      };

      const result = validateRequest(schemas.datasourceCreate, input);

      expect(result.success).toBe(true);
      expect(result.data?.port).toBe(3306);
    });

    it('应拒绝空名称', () => {
      const input = {
        name: '',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
      };

      const result = validateRequest(schemas.datasourceCreate, input);

      expect(result.success).toBe(false);
      expect(result.errors?.name).toContain('名称不能为空');
    });

    it('应拒绝包含非法字符的名称', () => {
      const input = {
        name: 'test@db!',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
      };

      const result = validateRequest(schemas.datasourceCreate, input);

      expect(result.success).toBe(false);
      expect(result.errors?.name).toContain('名称只能包含字母、数字、下划线、中划线和中文');
    });

    it('应拒绝不支持的数据库类型', () => {
      const input = {
        name: 'test_db',
        type: 'oracle',
        host: 'localhost',
        port: 3306,
        username: 'root',
      };

      const result = validateRequest(schemas.datasourceCreate, input);

      expect(result.success).toBe(false);
      expect(result.errors?.type).toContain('不支持的数据库类型');
    });

    it('应拒绝无效的端口号', () => {
      const input = {
        name: 'test_db',
        type: 'mysql',
        host: 'localhost',
        port: 99999,
        username: 'root',
      };

      const result = validateRequest(schemas.datasourceCreate, input);

      expect(result.success).toBe(false);
    });
  });

  describe('AuditLogQuerySchema', () => {
    it('应接受有效的审计日志查询参数', () => {
      const input = {
        page: '1',
        limit: '50',
      };

      const result = validateRequest(schemas.auditLogQuery, input);

      expect(result.success).toBe(true);
      expect(result.data?.page).toBe(1);
      expect(result.data?.limit).toBe(50);
    });

    it('应接受数字形式的分页参数', () => {
      const input = {
        page: 2,
        limit: 20,
      };

      const result = validateRequest(schemas.auditLogQuery, input);

      expect(result.success).toBe(true);
      expect(result.data?.page).toBe(2);
      expect(result.data?.limit).toBe(20);
    });

    it('应限制 limit 最大值为 100', () => {
      const input = {
        limit: 200,
      };

      const result = validateRequest(schemas.auditLogQuery, input);

      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(100); // 应被限制为 100
    });

    it('应接受可选的筛选参数', () => {
      const input = {
        userId: 'user123',
        success: 'true',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = validateRequest(schemas.auditLogQuery, input);

      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe('user123');
      expect(result.data?.success).toBe('true');
    });

    it('应处理无效的分页参数', () => {
      const input = {
        page: 'invalid',
        limit: 'invalid',
      };

      const result = validateRequest(schemas.auditLogQuery, input);

      expect(result.success).toBe(true);
      expect(result.data?.page).toBe(1); // 应回退到默认值
      expect(result.data?.limit).toBe(50); // 应回退到默认值
    });
  });
});
