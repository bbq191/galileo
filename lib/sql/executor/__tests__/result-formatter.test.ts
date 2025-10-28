/**
 * 结果格式化器单元测试
 */

import { ResultFormatter } from '../result-formatter';
import type { FieldPacket } from 'mysql2/promise';
import type { ExtendedFieldPacket } from '../types';

describe('结果格式化器', () => {
  const formatter = new ResultFormatter();

  describe('formatColumnMetadata', () => {
    it('应该格式化列元数据', () => {
      const fields: ExtendedFieldPacket[] = [
        {
          name: 'id',
          type: 3, // LONG (INT)
          length: 11,
          table: 'users',
          db: 'test_db',
          flags: 1, // NOT NULL
        } as ExtendedFieldPacket,
        {
          name: 'username',
          type: 253, // VAR_STRING
          length: 255,
          table: 'users',
          db: 'test_db',
          flags: 0,
        } as ExtendedFieldPacket,
      ];

      const metadata = formatter.formatColumnMetadata(fields);

      expect(metadata).toHaveLength(2);
      expect(metadata[0]).toMatchObject({
        name: 'id',
        type: 'LONG',
        table: 'users',
        database: 'test_db',
        nullable: false,
      });
      expect(metadata[1]).toMatchObject({
        name: 'username',
        type: 'VAR_STRING',
        nullable: true,
      });
    });
  });

  describe('formatResultData', () => {
    it('应该格式化查询结果', () => {
      const rows = [
        { id: 1, username: 'alice', created_at: new Date('2024-01-01') },
        { id: 2, username: 'bob', created_at: new Date('2024-01-02') },
      ];

      const fields: ExtendedFieldPacket[] = [
        { name: 'id', type: 3 } as ExtendedFieldPacket,
        { name: 'username', type: 253 } as ExtendedFieldPacket,
        { name: 'created_at', type: 12 } as ExtendedFieldPacket,
      ];

      const formatted = formatter.formatResultData(rows, fields);

      expect(formatted).toHaveLength(2);
      expect(formatted[0].id).toBe(1);
      expect(formatted[0].username).toBe('alice');
    });

    it('应该处理空结果', () => {
      const formatted = formatter.formatResultData([], []);
      expect(formatted).toEqual([]);
    });
  });

  describe('toCSV', () => {
    it('应该转换为 CSV 格式', () => {
      const data = [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ];

      const columns = [
        { name: 'id', type: 'LONG' },
        { name: 'name', type: 'VAR_STRING' },
        { name: 'age', type: 'LONG' },
      ];

      const csv = formatter.toCSV(data, columns);

      expect(csv).toContain('id,name,age');
      expect(csv).toContain('1,Alice,30');
      expect(csv).toContain('2,Bob,25');
    });

    it('应该正确转义 CSV 特殊字符', () => {
      const data = [
        { id: 1, description: 'Hello, World!' },
        { id: 2, description: 'Quote: "test"' },
      ];

      const columns = [
        { name: 'id', type: 'LONG' },
        { name: 'description', type: 'VAR_STRING' },
      ];

      const csv = formatter.toCSV(data, columns);

      expect(csv).toContain('"Hello, World!"');
      expect(csv).toContain('"Quote: ""test"""');
    });
  });

  describe('toJSON', () => {
    it('应该转换为 JSON 字符串', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];

      const json = formatter.toJSON(data);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Alice');
    });

    it('应该支持美化格式', () => {
      const data = [{ id: 1, name: 'Alice' }];

      const json = formatter.toJSON(data, true);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  describe('calculateDataSize', () => {
    it('应该计算数据大小', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];

      const size = formatter.calculateDataSize(data);

      expect(size).toBeGreaterThan(0);
    });
  });

  describe('formatDataSize', () => {
    it('应该格式化字节大小', () => {
      expect(formatter.formatDataSize(100)).toBe('100.00 B');
      expect(formatter.formatDataSize(1024)).toBe('1.00 KB');
      expect(formatter.formatDataSize(1024 * 1024)).toBe('1.00 MB');
      expect(formatter.formatDataSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    });
  });
});
