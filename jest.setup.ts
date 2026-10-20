/**
 * Jest 测试环境设置
 * 在所有测试运行前执行
 */

// 设置 NODE_ENV 为 test，用于抑制日志输出
// Note: Jest already sets NODE_ENV to 'test' automatically

// 认证模块要求 JWT_SECRET 至少 32 个字符（见 lib/auth/config.ts）
process.env.JWT_SECRET ??= 'test-jwt-secret-for-jest-only-0123456789abcdef';
