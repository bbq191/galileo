/**
 * API 路由共享配置
 *
 * 用途：
 * 1. 统一配置所有 API 路由的动态渲染模式
 * 2. 避免构建时预渲染导致的 DI 容器初始化问题
 * 3. 防止 reflect-metadata 和 Redis 连接错误
 *
 * 使用方法：
 * ```typescript
 * export const runtime = 'nodejs';  // 每个文件独立声明
 * export { dynamic } from '@/lib/api/route-config';
 * ```
 *
 * 注意：
 * - runtime 必须在每个文件中独立声明，否则 Next.js 无法识别
 * - dynamic 可以使用共享配置
 *
 * @author xusy
 */

/**
 * 强制所有 API 路由使用动态渲染
 *
 * 原因：
 * 1. 大部分路由依赖 DI 容器（tsyringe + reflect-metadata）
 * 2. 许多路由需要 Redis、数据库等外部服务
 * 3. API 路由本质上是动态的，不应该被静态生成
 * 4. 避免构建时的服务初始化和连接错误
 */
export const dynamic = 'force-dynamic';
