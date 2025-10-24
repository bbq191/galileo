export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">Galileo</h1>
        <p className="text-xl mb-2">
          自然语言转 SQL 系统
        </p>
        <p className="text-base opacity-70 mb-8">
          Natural Language to SQL Conversion System
        </p>

        <div className="flex gap-4 justify-center">
          <a href="/datasources" className="btn btn-primary">数据源管理</a>
          <a href="/metadata" className="btn btn-outline">元数据浏览</a>
          <a href="/relationships" className="btn btn-outline">关系图谱</a>
        </div>

        <div className="mt-12 stats shadow">
          <div className="stat">
            <div className="stat-title">项目状态</div>
            <div className="stat-value text-primary">初始化</div>
            <div className="stat-desc">Next.js 14 + DaisyUI</div>
          </div>
        </div>
      </div>
    </main>
  );
}
