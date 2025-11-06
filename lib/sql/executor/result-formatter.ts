/**
 * 结果格式化器
 * 负责将数据库查询结果转换为标准格式
 */

import 'reflect-metadata';
import { injectable } from 'tsyringe';
import type { FieldPacket } from 'mysql2/promise';
import type { ColumnMetadata, ExtendedFieldPacket } from './types';

/**
 * MySQL 类型 ID 到类型名称的映射
 */
const MYSQL_TYPE_MAP: Record<number, string> = {
  0: 'DECIMAL',
  1: 'TINY',
  2: 'SHORT',
  3: 'LONG',
  4: 'FLOAT',
  5: 'DOUBLE',
  6: 'NULL',
  7: 'TIMESTAMP',
  8: 'LONGLONG',
  9: 'INT24',
  10: 'DATE',
  11: 'TIME',
  12: 'DATETIME',
  13: 'YEAR',
  14: 'NEWDATE',
  15: 'VARCHAR',
  16: 'BIT',
  245: 'JSON',
  246: 'NEWDECIMAL',
  247: 'ENUM',
  248: 'SET',
  249: 'TINY_BLOB',
  250: 'MEDIUM_BLOB',
  251: 'LONG_BLOB',
  252: 'BLOB',
  253: 'VAR_STRING',
  254: 'STRING',
  255: 'GEOMETRY',
};

/**
 * 结果格式化器类
 */
@injectable()
export class ResultFormatter {
  /**
   * 格式化列元数据
   */
  formatColumnMetadata(fields: FieldPacket[]): ColumnMetadata[] {
    return fields.map((field) => this.formatSingleColumn(field));
  }

  /**
   * 格式化单个列的元数据
   */
  private formatSingleColumn(field: FieldPacket): ColumnMetadata {
    const extendedField = field as ExtendedFieldPacket;

    return {
      name: extendedField.name,
      type: this.getTypeName(extendedField.type),
      typeId: extendedField.type,
      length: extendedField.length,
      table: extendedField.table,
      database: extendedField.db,
      nullable: this.isNullable(extendedField.flags),
      charset: extendedField.characterSet?.toString(),
    };
  }

  /**
   * 获取类型名称
   */
  private getTypeName(typeId: number): string {
    return MYSQL_TYPE_MAP[typeId] || `UNKNOWN(${typeId})`;
  }

  /**
   * 检查字段是否可为空
   */
  private isNullable(flags?: number): boolean {
    if (flags === undefined) return true;
    // MySQL NOT_NULL_FLAG = 1
    return (flags & 1) === 0;
  }

  /**
   * 格式化查询结果数据
   */
  formatResultData<T = any>(
    rows: any[],
    fields: FieldPacket[]
  ): T[] {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    // 转换特殊类型的值
    return rows.map((row) => this.formatRow(row, fields));
  }

  /**
   * 格式化单行数据
   */
  private formatRow(row: any, fields: FieldPacket[]): any {
    const formattedRow: any = {};

    for (const field of fields) {
      const extendedField = field as ExtendedFieldPacket;
      const value = row[extendedField.name];

      formattedRow[extendedField.name] = this.formatValue(
        value,
        extendedField.type
      );
    }

    return formattedRow;
  }

  /**
   * 格式化单个值
   */
  private formatValue(value: any, typeId: number): any {
    if (value === null || value === undefined) {
      return null;
    }

    // 根据类型进行转换
    switch (typeId) {
      case 1: // TINY (TINYINT)
      case 2: // SHORT (SMALLINT)
      case 3: // LONG (INT)
      case 8: // LONGLONG (BIGINT)
      case 9: // INT24 (MEDIUMINT)
        return this.formatInteger(value);

      case 4: // FLOAT
      case 5: // DOUBLE
      case 0: // DECIMAL
      case 246: // NEWDECIMAL
        return this.formatDecimal(value);

      case 10: // DATE
      case 11: // TIME
      case 12: // DATETIME
      case 7: // TIMESTAMP
      case 13: // YEAR
        return this.formatDateTime(value);

      case 245: // JSON
        return this.formatJSON(value);

      case 16: // BIT
        return this.formatBit(value);

      case 249: // TINY_BLOB
      case 250: // MEDIUM_BLOB
      case 251: // LONG_BLOB
      case 252: // BLOB
        return this.formatBlob(value);

      default:
        // 字符串和其他类型保持原样
        return value;
    }
  }

  /**
   * 格式化整数
   */
  private formatInteger(value: any): number | string {
    if (typeof value === 'bigint') {
      // BigInt 转换为字符串（避免精度损失）
      return value.toString();
    }
    return Number(value);
  }

  /**
   * 格式化小数
   */
  private formatDecimal(value: any): number {
    return Number(value);
  }

  /**
   * 格式化日期时间
   */
  private formatDateTime(value: any): string | null {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    return null;
  }

  /**
   * 格式化 JSON
   */
  private formatJSON(value: any): any {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  /**
   * 格式化 BIT
   */
  private formatBit(value: any): boolean | number {
    if (Buffer.isBuffer(value)) {
      // 单 bit 转换为 boolean
      if (value.length === 1) {
        return value[0] === 1;
      }
      // 多 bit 转换为数字
      return value.readUIntBE(0, value.length);
    }
    return Boolean(value);
  }

  /**
   * 格式化 BLOB
   */
  private formatBlob(value: any): string | null {
    if (Buffer.isBuffer(value)) {
      // 尝试转换为 UTF-8 字符串
      try {
        return value.toString('utf8');
      } catch {
        // 如果不是有效的 UTF-8，返回 Base64
        return value.toString('base64');
      }
    }
    return value;
  }

  /**
   * 将结果转换为 CSV 格式
   */
  toCSV(data: any[], columns: ColumnMetadata[]): string {
    if (data.length === 0) {
      return '';
    }

    // CSV 头部
    const header = columns.map((col) => this.escapeCSV(col.name)).join(',');

    // CSV 数据行
    const rows = data.map((row) => {
      return columns
        .map((col) => {
          const value = row[col.name];
          return this.escapeCSV(this.valueToString(value));
        })
        .join(',');
    });

    return [header, ...rows].join('\n');
  }

  /**
   * 将结果转换为 JSON 字符串
   */
  toJSON(data: any[], pretty: boolean = false): string {
    if (pretty) {
      return JSON.stringify(data, null, 2);
    }
    return JSON.stringify(data);
  }

  /**
   * 转义 CSV 值
   */
  private escapeCSV(value: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    const str = String(value);

    // 如果包含逗号、引号或换行符，需要用引号包裹并转义
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  /**
   * 将值转换为字符串
   */
  private valueToString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * 计算数据大小（字节）
   */
  calculateDataSize(data: any[]): number {
    // 简单估算：使用 JSON 序列化后的字符串长度
    try {
      const json = JSON.stringify(data);
      return Buffer.byteLength(json, 'utf8');
    } catch {
      return 0;
    }
  }

  /**
   * 格式化数据大小（转换为可读格式）
   */
  formatDataSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// 向后兼容：导出单例（通过 DI 容器管理）
// 使用 getter 延迟解析，避免循环依赖问题
let _resultFormatter: ResultFormatter | null = null;

export const resultFormatter: ResultFormatter = new Proxy({} as ResultFormatter, {
  get(target, prop) {
    if (!_resultFormatter) {
      const { resolve } = require('@/lib/di/container');
      const { DI_TOKENS } = require('@/lib/di/tokens');
      _resultFormatter = resolve<ResultFormatter>(DI_TOKENS.ResultFormatter);
    }
    return (_resultFormatter as any)[prop];
  }
});
