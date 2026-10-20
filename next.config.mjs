/**
 * Next.js 配置文件
 * @author xusy
 * @type {import('next').NextConfig}
 *
 * 构建使用 Turbopack（Next.js 16 默认）。Turbopack 以 package-lock.json 所在目录为项目根目录，
 * 不解析根目录之外的文件，因此不再需要原 webpack 配置中为避免扫描 Windows 系统保护目录所做的处理。
 * pino、thread-stream、pino-pretty、prisma 等包已在 Next.js 默认的 serverExternalPackages 列表中，无需手动声明。
 */

const nextConfig = {
  // 生产环境禁用源码映射，防止源码泄露
  productionBrowserSourceMaps: false,

  // 忽略 Prisma 生成的文件
  // （Next.js 15 起从 experimental 移到顶层；key 是路由路径的 glob，'/*' 匹配全部路由）
  outputFileTracingExcludes: {
    '/*': [
      'app/generated/prisma/**',
      'generated/**',
      'node_modules/@prisma/**',
    ],
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
