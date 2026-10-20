// lib/validation/schemas.ts
import { z } from 'zod';

// 查询执行
export const QueryExecuteSchema = z.object({
  query: z
    .string({ message: '查询内容不能为空' })
    .min(1, '查询内容不能为空')
    .max(5000, '查询内容不能超过 5000 字符')
    .regex(/^[^<>]*$/, '查询包含非法字符'),

  options: z
    .object({
      enableCache: z.boolean().optional(),
      maxRows: z.number().int().min(1).max(10000).optional(),
      timeout: z.number().int().min(1000).max(300000).optional(), // 1秒到5分钟
    })
    .optional(),
});

// 元数据同步
export const MetadataSyncSchema = z.object({
  dataSourceId: z.number().int().positive('数据源 ID 必须是正整数'),

  databases: z
    .array(z.string().min(1))
    .max(50, '最多同时同步 50 个数据库')
    .optional(),

  inferRelationships: z.boolean().optional(),

  minConfidence: z.number().min(0).max(1, '置信度必须在 0-1 之间').optional(),

  trackChanges: z.boolean().optional(),
});

// 数据源创建
export const DatasourceCreateSchema = z.object({
  name: z
    .string()
    .min(1, '名称不能为空')
    .max(100, '名称不能超过 100 字符')
    .regex(/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/, '名称只能包含字母、数字、下划线、中划线和中文'),

  type: z.enum(['mysql', 'mariadb', 'postgresql', 'sqlserver'], {
    message: '不支持的数据库类型',
  }),

  host: z.string().min(1, '主机地址不能为空'),

  port: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num < 1 || num > 65535) {
      throw new Error('端口号必须在 1-65535 之间');
    }
    return num;
  }),

  username: z.string().min(1, '用户名不能为空'),

  password: z.string().optional().default(''),

  databases: z.array(z.string()).optional(),

  description: z.string().max(500, '描述不能超过 500 字符').optional(),
});

// AI 语义标注
export const SemanticAnnotateSchema = z.object({
  tables: z
    .array(z.string().uuid())
    .min(1, '至少选择一个表')
    .max(100, '最多同时标注 100 个表'),

  force: z.boolean().optional(),
});

// 审计日志查询
export const AuditLogQuerySchema = z.object({
  userId: z.string().optional(),

  page: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return isNaN(num) ? 1 : Math.max(1, num);
  }).optional().default(1),

  limit: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num < 1) return 50;
    return Math.min(num, 100); // 最大 100
  }).optional().default(50),

  success: z.enum(['true', 'false']).optional(),

  startDate: z.string().optional(),

  endDate: z.string().optional(),
});

export const LoginSchema = z.object({
  username: z.string({ message: '请输入用户名' }).trim().min(1, '请输入用户名').max(64),
  password: z.string({ message: '请输入密码' }).min(1, '请输入密码').max(256),
});

// 导出所有 schemas
export const schemas = {
  login: LoginSchema,
  queryExecute: QueryExecuteSchema,
  metadataSync: MetadataSyncSchema,
  datasourceCreate: DatasourceCreateSchema,
  semanticAnnotate: SemanticAnnotateSchema,
  auditLogQuery: AuditLogQuerySchema,
};
