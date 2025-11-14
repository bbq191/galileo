export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-base-200">
      <div className="max-w-6xl w-full">
        {/* 标题部分 */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">Galileo</h1>
          <p className="text-xl mb-2">
            自然语言转 SQL 系统
          </p>
          <p className="text-base opacity-70 mb-8">
            Natural Language to SQL Conversion System
          </p>
        </div>

        {/* 核心功能区 */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">核心功能</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <a href="/query" className="card bg-gradient-to-br from-primary to-primary-focus text-primary-content shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">自然语言查询</h3>
                <p className="text-sm opacity-90">输入自然语言，智能生成SQL查询</p>
              </div>
            </a>

            <a href="/query/history" className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">查询历史</h3>
                <p className="text-sm opacity-70">查看和管理历史查询记录</p>
              </div>
            </a>

            <a href="/datasources" className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">数据源管理</h3>
                <p className="text-sm opacity-70">配置和管理数据库连接</p>
              </div>
            </a>

            <a href="/metadata" className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">元数据浏览</h3>
                <p className="text-sm opacity-70">浏览数据库结构和表信息</p>
              </div>
            </a>
          </div>
        </div>

        {/* 高级功能区 */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">高级功能</h2>
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <a href="/relationships" className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">关系图谱</h3>
                <p className="text-sm opacity-70">可视化查看表关系和数据结构</p>
              </div>
            </a>
          </div>
        </div>

        {/* 管理中心 */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">管理中心</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <a href="/admin/audit" className="card bg-gradient-to-br from-info to-info-focus text-info-content shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">审计日志</h3>
                <p className="text-sm opacity-90">查询审计和异常检测</p>
              </div>
            </a>

            <a href="/admin/performance" className="card bg-gradient-to-br from-success to-success-focus text-success-content shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">性能监控</h3>
                <p className="text-sm opacity-90">API性能和缓存统计</p>
              </div>
            </a>

            <a href="/admin/ai-cost" className="card bg-gradient-to-br from-warning to-warning-focus text-warning-content shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">AI成本管理</h3>
                <p className="text-sm opacity-90">成本追踪和缓存管理</p>
              </div>
            </a>

            <a href="/admin/statistics" className="card bg-gradient-to-br from-secondary to-secondary-focus text-secondary-content shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">统计分析</h3>
                <p className="text-sm opacity-90">系统统计和热点分析</p>
              </div>
            </a>

            <a href="/admin/health" className="card bg-gradient-to-br from-accent to-accent-focus text-accent-content shadow-xl hover:shadow-2xl transition-all">
              <div className="card-body">
                <h3 className="card-title">系统健康</h3>
                <p className="text-sm opacity-90">实时健康状态监控</p>
              </div>
            </a>
          </div>
        </div>

        {/* 系统状态 */}
        <div className="mt-12 flex justify-center">
          <div className="stats shadow bg-base-100">
            <div className="stat">
              <div className="stat-title">项目状态</div>
              <div className="stat-value text-primary">运行中</div>
              <div className="stat-desc">Next.js 14 + DaisyUI + TypeScript</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
