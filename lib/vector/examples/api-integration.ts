/**
 * API 集成示例
 * 展示如何在 Next.js API 路由中使用向量搜索
 */

import { VectorSearchService } from '../vector-search-service';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * 全局向量搜索服务实例（单例模式）
 * 避免每次请求都重新初始化
 */
let vectorSearchInstance: VectorSearchService | null = null;

/**
 * 获取或创建向量搜索服务实例
 */
async function getVectorSearchService(): Promise<VectorSearchService> {
  if (!vectorSearchInstance) {
    vectorSearchInstance = new VectorSearchService({
      enableRedis: process.env.ENABLE_REDIS === 'true',
      redisConfig: process.env.REDIS_URL
        ? {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
          }
        : undefined,
      dimension: parseInt(process.env.VECTOR_DIMENSION || '384'),
    });

    await vectorSearchInstance.initialize();
  }

  return vectorSearchInstance;
}

/**
 * API 示例 1: 搜索表
 *
 * 使用方法:
 * GET /api/vector/search/tables?q=用户信息&limit=10&threshold=0.5
 */
export async function searchTablesAPI(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { q, limit = 10, threshold = 0.5 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
      });
    }

    const vectorSearch = await getVectorSearchService();

    const results = await vectorSearch.searchTables(q, {
      limit: parseInt(limit as string),
      threshold: parseFloat(threshold as string),
    });

    res.status(200).json({
      success: true,
      query: q,
      results: results.map(r => ({
        table: {
          id: r.item.id,
          name: r.item.tableName,
          database: r.item.databaseName,
          comment: r.item.tableComment,
          description: r.item.semanticDescription,
        },
        score: r.score,
        metadata: r.metadata,
      })),
      total: results.length,
    });
  } catch (error: any) {
    console.error('搜索表时出错:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * API 示例 2: 搜索字段
 *
 * 使用方法:
 * GET /api/vector/search/columns?q=用户ID&limit=10&threshold=0.5
 */
export async function searchColumnsAPI(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { q, limit = 10, threshold = 0.5 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
      });
    }

    const vectorSearch = await getVectorSearchService();

    const results = await vectorSearch.searchColumns(q, {
      limit: parseInt(limit as string),
      threshold: parseFloat(threshold as string),
    });

    res.status(200).json({
      success: true,
      query: q,
      results: results.map(r => ({
        column: {
          id: r.item.id,
          name: r.item.columnName,
          table: r.item.tableName,
          database: r.item.databaseName,
          type: r.item.dataType,
          comment: r.item.columnComment,
          description: r.item.semanticDescription,
        },
        score: r.score,
        metadata: r.metadata,
      })),
      total: results.length,
    });
  } catch (error: any) {
    console.error('搜索字段时出错:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * API 示例 3: 获取索引统计信息
 *
 * 使用方法:
 * GET /api/vector/stats
 */
export async function getStatsAPI(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const vectorSearch = await getVectorSearchService();
    const stats = await vectorSearch.getStats();

    res.status(200).json({
      success: true,
      stats: {
        tables: {
          count: stats.tables.totalItems,
          dimension: stats.tables.dimension,
          sizeKB: (stats.tables.sizeBytes / 1024).toFixed(2),
          lastUpdated: stats.tables.lastUpdated,
        },
        columns: {
          count: stats.columns.totalItems,
          dimension: stats.columns.dimension,
          sizeKB: (stats.columns.sizeBytes / 1024).toFixed(2),
          lastUpdated: stats.columns.lastUpdated,
        },
        total: {
          items: stats.total.items,
          sizeKB: (stats.total.sizeBytes / 1024).toFixed(2),
        },
      },
    });
  } catch (error: any) {
    console.error('获取统计信息时出错:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * API 示例 4: 重建索引
 *
 * 使用方法:
 * POST /api/vector/rebuild
 */
export async function rebuildIndexAPI(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const vectorSearch = await getVectorSearchService();

    // 重建索引（这是一个耗时操作）
    await vectorSearch.rebuildIndex();

    const stats = await vectorSearch.getStats();

    res.status(200).json({
      success: true,
      message: 'Index rebuilt successfully',
      stats: {
        tables: stats.tables.totalItems,
        columns: stats.columns.totalItems,
        total: stats.total.items,
      },
    });
  } catch (error: any) {
    console.error('重建索引时出错:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * API 示例 5: 更新单个表的向量
 *
 * 使用方法:
 * POST /api/vector/update/table/:tableId
 */
export async function updateTableVectorAPI(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { tableId } = req.query;

    if (!tableId || typeof tableId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Table ID is required',
      });
    }

    const vectorSearch = await getVectorSearchService();
    await vectorSearch.upsertTableVector(parseInt(tableId));

    res.status(200).json({
      success: true,
      message: `Table ${tableId} vector updated successfully`,
    });
  } catch (error: any) {
    console.error('更新表向量时出错:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * 完整的 API 路由示例
 * 文件路径: app/api/vector/search/route.ts
 */
export async function vectorSearchRouteHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { type, action } = req.query;

  try {
    // 路由分发
    if (type === 'tables') {
      return await searchTablesAPI(req, res);
    } else if (type === 'columns') {
      return await searchColumnsAPI(req, res);
    } else if (action === 'stats') {
      return await getStatsAPI(req, res);
    } else if (action === 'rebuild') {
      return await rebuildIndexAPI(req, res);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid endpoint',
      });
    }
  } catch (error: any) {
    console.error('API 处理错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * React 前端集成示例
 */

// 客户端使用示例 1: 搜索表
async function searchTablesFromClient(query: string) {
  const response = await fetch(
    `/api/vector/search?type=tables&q=${encodeURIComponent(query)}&limit=10&threshold=0.5`
  );

  const data = await response.json();

  if (data.success) {
    console.log('找到的表:', data.results);
    return data.results;
  } else {
    console.error('搜索失败:', data.error);
    return [];
  }
}

// 客户端使用示例 2: 搜索字段
async function searchColumnsFromClient(query: string) {
  const response = await fetch(
    `/api/vector/search?type=columns&q=${encodeURIComponent(query)}&limit=10`
  );

  const data = await response.json();

  if (data.success) {
    console.log('找到的字段:', data.results);
    return data.results;
  } else {
    console.error('搜索失败:', data.error);
    return [];
  }
}

// 客户端使用示例 3: 获取统计信息
async function getIndexStatsFromClient() {
  const response = await fetch('/api/vector/search?action=stats');
  const data = await response.json();

  if (data.success) {
    console.log('索引统计:', data.stats);
    return data.stats;
  } else {
    console.error('获取统计失败:', data.error);
    return null;
  }
}

// 客户端使用示例 4: 重建索引
async function rebuildIndexFromClient() {
  const response = await fetch('/api/vector/search?action=rebuild', {
    method: 'POST',
  });

  const data = await response.json();

  if (data.success) {
    console.log('索引重建成功:', data.message);
    return true;
  } else {
    console.error('索引重建失败:', data.error);
    return false;
  }
}

/**
 * React Hook 示例
 */
export function useVectorSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTables = async (query: string, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const results = await searchTablesFromClient(query);
      setLoading(false);
      return results;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      return [];
    }
  };

  const searchColumns = async (query: string, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const results = await searchColumnsFromClient(query);
      setLoading(false);
      return results;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      return [];
    }
  };

  return {
    searchTables,
    searchColumns,
    loading,
    error,
  };
}

// React 组件使用示例
/*
function SearchComponent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const { searchTables, loading, error } = useVectorSearch();

  const handleSearch = async () => {
    const data = await searchTables(query);
    setResults(data);
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索表..."
      />
      <button onClick={handleSearch} disabled={loading}>
        {loading ? '搜索中...' : '搜索'}
      </button>

      {error && <div>错误: {error}</div>}

      <ul>
        {results.map(r => (
          <li key={r.table.id}>
            {r.table.name} - {r.table.database} (相似度: {r.score.toFixed(3)})
          </li>
        ))}
      </ul>
    </div>
  );
}
*/

export {
  searchTablesFromClient,
  searchColumnsFromClient,
  getIndexStatsFromClient,
  rebuildIndexFromClient,
};

// 需要添加这个导入
import { useState } from 'react';
