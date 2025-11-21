/**
 * API 文档页面 - Swagger UI
 *
 * 提供交互式 API 文档，支持：
 * - 浏览所有 API 端点
 * - 查看请求/响应格式
 * - 直接测试 API 调用
 */

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import 'swagger-ui-react/swagger-ui.css';

// 动态导入 SwaggerUI 以避免 SSR 问题
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">加载 API 文档...</p>
      </div>
    </div>
  ),
});

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 加载 OpenAPI 规范
    fetch('/api/docs/openapi')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => setSpec(data))
      .catch((err) => {
        console.error('Failed to load OpenAPI spec:', err);
        setError(err.message);
      });
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <svg
            className="w-16 h-16 text-red-500 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">加载 API 文档失败</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载 API 文档...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 页面头部 */}
      <header className="bg-gray-900 text-white py-4 px-6 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Galileo API 文档</h1>
            <p className="text-gray-400 text-sm mt-1">交互式 API 参考文档</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="px-3 py-1 bg-green-600 rounded-full text-sm font-medium">
              v1.0.0
            </span>
            <a
              href="/"
              className="text-gray-300 hover:text-white transition-colors"
            >
              返回首页
            </a>
          </div>
        </div>
      </header>

      {/* Swagger UI */}
      <main className="swagger-ui-wrapper">
        <SwaggerUI spec={spec} />
      </main>

      {/* 自定义样式 */}
      <style jsx global>{`
        /* 自定义覆盖 */
        .swagger-ui .topbar {
          display: none;
        }

        .swagger-ui .info {
          margin: 20px 0;
        }

        .swagger-ui .scheme-container {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 4px;
        }

        .swagger-ui .opblock-tag {
          border-bottom: 1px solid #e0e0e0;
        }

        .swagger-ui .opblock {
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .swagger-ui .btn {
          border-radius: 4px;
        }

        .swagger-ui-wrapper {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }
      `}</style>
    </div>
  );
}
