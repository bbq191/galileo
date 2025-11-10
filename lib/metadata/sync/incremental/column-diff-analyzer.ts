/**
 * 字段差异分析器
 *
 * 功能：
 * - 对比当前数据库字段和存储的元数据字段
 * - 识别新增、删除、修改的字段
 * - 判断字段是否相等（类型、属性等）
 *
 * 职责：
 * - 纯逻辑层，不涉及数据库操作
 * - 提供字段对比算法
 */

/**
 * 字段基本信息
 */
export interface ColumnBase {
  columnName: string;
  dataType: string;
  columnType: string;
  columnComment: string | null;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
}

/**
 * 字段差异结果
 */
export interface ColumnDiffResult {
  /** 新增的字段 */
  added: ColumnBase[];
  /** 删除的字段名 */
  deleted: string[];
  /** 修改的字段 */
  modified: ColumnBase[];
}

/**
 * 字段差异分析器
 */
export class ColumnDiffAnalyzer {
  /**
   * 对比字段差异
   *
   * @param currentColumns 当前数据库的字段列表
   * @param storedColumns 存储在元数据中的字段列表
   * @returns 字段差异结果（新增、删除、修改）
   */
  compareColumns(
    currentColumns: ColumnBase[],
    storedColumns: ColumnBase[]
  ): ColumnDiffResult {
    const currentMap = new Map(currentColumns.map((col) => [col.columnName, col]));
    const storedMap = new Map(storedColumns.map((col) => [col.columnName, col]));

    const added: ColumnBase[] = [];
    const deleted: string[] = [];
    const modified: ColumnBase[] = [];

    // 检测新增和修改的字段
    for (const [columnName, currentCol] of currentMap) {
      const storedCol = storedMap.get(columnName);

      if (!storedCol) {
        // 新增字段
        added.push(currentCol);
      } else if (!this.columnsEqual(currentCol, storedCol)) {
        // 修改字段
        modified.push(currentCol);
      }
    }

    // 检测删除的字段
    for (const [columnName] of storedMap) {
      if (!currentMap.has(columnName)) {
        deleted.push(columnName);
      }
    }

    return { added, deleted, modified };
  }

  /**
   * 判断两个字段是否相等
   *
   * 比较字段的所有关键属性：
   * - 数据类型（dataType、columnType）
   * - 可空性（isNullable）
   * - 键类型（isPrimaryKey、isUnique）
   * - 默认值（defaultValue）
   * - 顺序位置（ordinalPosition）
   */
  private columnsEqual(col1: ColumnBase, col2: ColumnBase): boolean {
    return (
      col1.dataType === col2.dataType &&
      col1.columnType === col2.columnType &&
      col1.isNullable === col2.isNullable &&
      col1.isPrimaryKey === col2.isPrimaryKey &&
      col1.isUnique === col2.isUnique &&
      this.defaultValuesEqual(col1.defaultValue, col2.defaultValue) &&
      col1.ordinalPosition === col2.ordinalPosition
    );
  }

  /**
   * 判断两个默认值是否相等
   *
   * 特殊处理：
   * - 忽略大小写（数据库可能返回不同大小写）
   * - 处理 null 值
   */
  private defaultValuesEqual(
    val1: string | null,
    val2: string | null
  ): boolean {
    if (val1 === null && val2 === null) return true;
    if (val1 === null || val2 === null) return false;
    return val1.toLowerCase() === val2.toLowerCase();
  }

  /**
   * 获取字段变更摘要（用于日志记录）
   *
   * @param diff 字段差异结果
   * @returns 变更摘要字符串
   */
  getChangeSummary(diff: ColumnDiffResult): string {
    const parts: string[] = [];

    if (diff.added.length > 0) {
      parts.push(`新增 ${diff.added.length} 个字段`);
    }

    if (diff.deleted.length > 0) {
      parts.push(`删除 ${diff.deleted.length} 个字段`);
    }

    if (diff.modified.length > 0) {
      parts.push(`修改 ${diff.modified.length} 个字段`);
    }

    return parts.length > 0 ? parts.join(', ') : '无变更';
  }

  /**
   * 检查是否有字段变更
   */
  hasChanges(diff: ColumnDiffResult): boolean {
    return (
      diff.added.length > 0 ||
      diff.deleted.length > 0 ||
      diff.modified.length > 0
    );
  }

  /**
   * 获取详细的变更列表（用于详细日志）
   */
  getDetailedChanges(diff: ColumnDiffResult): string[] {
    const details: string[] = [];

    for (const col of diff.added) {
      details.push(`  + ${col.columnName} (${col.columnType})`);
    }

    for (const colName of diff.deleted) {
      details.push(`  - ${colName}`);
    }

    for (const col of diff.modified) {
      details.push(`  * ${col.columnName} (${col.columnType})`);
    }

    return details;
  }
}
