import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // 设置测试环境变量
  setupFiles: ['<rootDir>/jest.setup.ts'],

  // 模块路径映射（与 tsconfig.json 保持一致）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // 测试文件匹配模式
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts',
  ],

  // 忽略的目录
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
  ],

  // jose 仅提供 ESM，需要经过转换
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],

  // TypeScript 转换配置
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    }],
    '^.+/node_modules/jose/.+\\.js$': '<rootDir>/jest.esm-transform.js',
  },

  // 覆盖率配置
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],

  // 设置超时时间（毫秒）
  testTimeout: 30000,

  // 清除 mock 状态
  clearMocks: true,

  // 显示详细输出
  verbose: true,

  // 强制退出 Jest（解决异步操作未关闭的问题）
  forceExit: true,
};

export default config;
