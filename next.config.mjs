/**
 * Next.js 配置文件
 * @author xusy
 * @type {import('next').NextConfig}
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const WebpackFsBlockerPlugin = require('./lib/webpack-fs-blocker-plugin.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Windows 系统保护目录列表
const protectedDirs = [
  'Cookies',
  'Application Data',
  'Local Settings',
  'AppData',
  'NetHood',
  'PrintHood',
  'Recent',
  'SendTo',
  'Templates',
  'Start Menu',
  'My Documents',
  'NTUSER.DAT',
  'ntuser.dat.LOG',
];

// 检查路径是否是系统保护目录
const isProtectedPath = (filePath) => {
  if (!filePath) return false;

  const normalizedPath = filePath.replace(/\\/g, '/');

  // 检查是否包含保护目录名称
  const hasProtectedDir = protectedDirs.some(dir => normalizedPath.includes(dir));

  // 检查是否在 Windows 系统目录下
  const isSystemPath = normalizedPath.includes('C:/Windows') ||
    normalizedPath.includes('C:/Program Files');

  return hasProtectedDir || isSystemPath;
};

// Monkey-patch fs.readdirSync 和 fs.promises.readdir 来跳过系统保护目录
const originalReaddirSync = fs.readdirSync;
fs.readdirSync = function (path, options) {
  if (isProtectedPath(path)) {
    console.warn(`跳过系统保护目录: ${path}`);
    return [];
  }
  try {
    return originalReaddirSync.call(this, path, options);
  } catch (error) {
    if (error.code === 'EPERM' && isProtectedPath(error.path)) {
      console.warn(`忽略系统保护目录的权限错误: ${error.path}`);
      return [];
    }
    throw error;
  }
};

const originalReaddir = fs.promises.readdir;
fs.promises.readdir = function (path, options) {
  if (isProtectedPath(path)) {
    console.warn(`跳过系统保护目录: ${path}`);
    return Promise.resolve([]);
  }
  return originalReaddir.call(this, path, options).catch(error => {
    if (error.code === 'EPERM' && isProtectedPath(error.path)) {
      console.warn(`忽略系统保护目录的权限错误: ${error.path}`);
      return [];
    }
    throw error;
  });
};

// 捕获并忽略未处理的权限错误
process.on('unhandledRejection', (error) => {
  if (error && error.code === 'EPERM' && (error.syscall === 'scandir' || error.syscall === 'lstat')) {
    if (isProtectedPath(error.path)) {
      console.warn(`忽略系统保护目录的未处理拒绝: ${error.path}`);
      return;
    }
  }
  // 其他未处理的拒绝仍然抛出
  throw error;
});

const nextConfig = {
  // 生产环境禁用源码映射，防止源码泄露
  productionBrowserSourceMaps: false,

  // 实验性功能配置
  experimental: {
    // 忽略 Prisma 生成的文件，防止 Windows 上的文件扫描权限问题
    outputFileTracingExcludes: {
      '*': [
        'app/generated/prisma/**',
        'generated/**',
        'node_modules/@prisma/**',
      ],
    },
  },

  // 编译器优化
  compiler: {
    // 生产环境移除 console 输出
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'], // 保留 error 和 warn
    } : false,
  },

  // 启用 gzip 压缩
  compress: true,

  // Webpack 配置 - 增强代码混淆和优化
  webpack: (config, { isServer, dev }) => {
    // 添加文件系统访问拦截插件
    config.plugins = config.plugins || [];
    config.plugins.push(new WebpackFsBlockerPlugin());

    // 配置文件监听选项，排除系统保护目录
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        // Windows 用户目录下的系统保护文件夹
        '**/Cookies/**',
        '**/AppData/**',
        '**/Local Settings/**',
        '**/Application Data/**',
        '**/NetHood/**',
        '**/PrintHood/**',
        '**/Recent/**',
        '**/SendTo/**',
        '**/Templates/**',
        '**/Start Menu/**',
        '**/My Documents/**',
        'C:/Users/**/Cookies/**',
        'C:/Users/**/AppData/**',
        'C:/Users/**/Local Settings/**',
        'C:/Users/**/Application Data/**',
        'C:/Users/**/NetHood/**',
        'C:/Users/**/PrintHood/**',
        'C:/Users/**/Recent/**',
        'C:/Users/**/SendTo/**',
        'C:/Users/**/Templates/**',
        'C:/Users/**/Start Menu/**',
        // Windows 系统目录
        'C:/Windows/**',
        'C:/Program Files/**',
        'C:/Program Files (x86)/**',
      ],
    };

    // 配置 resolve 选项，限制模块搜索范围
    config.resolve = {
      ...config.resolve,
      // 只在项目目录和 node_modules 中搜索模块（使用绝对路径）
      modules: [
        path.resolve(__dirname, 'node_modules'),
        __dirname,
      ],
      // 限制符号链接解析
      symlinks: false,
      // 明确指定根目录
      roots: [__dirname],
    };

    // 禁用文件系统缓存以避免扫描系统目录
    config.cache = false;

    // 配置快照选项，明确指定受管路径
    config.snapshot = {
      managedPaths: [/^(.+?[\\/]node_modules[\\/])/],
      immutablePaths: [],
      // 排除系统保护目录
      buildDependencies: {
        hash: true,
        timestamp: true,
      },
    };

    if (!isServer) {
      // 客户端代码优化
      config.optimization = {
        ...config.optimization,
        minimize: true,
        // 使用 Next.js 默认的代码分割策略
        // 自定义 splitChunks 可能会干扰某些包（如 thread-stream）的正常工作
      };
    }

    if (isServer) {
      // 服务器端：排除 pino 相关模块，避免 worker 线程问题
      config.externals = config.externals || [];
      config.externals.push({
        'pino': 'commonjs pino',
        'thread-stream': 'commonjs thread-stream',
        'pino-pretty': 'commonjs pino-pretty',
      });
    }

    return config;
  },

  // 安全响应头
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
