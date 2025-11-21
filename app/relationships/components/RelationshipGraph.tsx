'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface GraphNode {
  tableId: number;
  tableName: string;
  databaseName: string;
  outDegree: number;
  inDegree: number;
}

interface GraphEdge {
  relationshipId: number;
  sourceTableId: number;
  targetTableId: number;
  sourceColumn: string;
  targetColumn: string;
  confidence: number;
  type: 'explicit' | 'inferred' | 'verified';
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

interface RelationshipGraphProps {
  tableId?: number;
  dataSourceId?: number;
  databaseId?: number;
  depth?: number;
  includeInferred?: boolean;
  minConfidence?: number;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
}

export default function RelationshipGraph({
  tableId,
  dataSourceId,
  databaseId,
  depth = 2,
  includeInferred = true,
  minConfidence = 0.7,
  onNodeClick,
  onEdgeClick,
}: RelationshipGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null>(null);

  // 加载关系图谱数据
  const loadGraph = useCallback(async () => {
    if (!dataSourceId) {
      setError('请指定数据源 (dataSourceId 是必需的)');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        depth: depth.toString(),
        includeInferred: includeInferred.toString(),
        minConfidence: minConfidence.toString(),
      });

      // dataSourceId 是必需的
      params.append('dataSourceId', dataSourceId.toString());

      // databaseId 是可选的，用于过滤数据库
      if (databaseId) {
        params.append('databaseId', databaseId.toString());
      }

      // tableId 是可选的，用于指定中心节点
      if (tableId) {
        params.append('tableId', tableId.toString());
      }

      const response = await fetch(`/api/relationships/graph?${params}`);
      const result = await response.json();

      if (result.status === 'success') {
        setGraphData(result.data);
        convertToReactFlowData(result.data.nodes, result.data.edges);
      } else {
        throw new Error(result.message || '加载关系图谱失败');
      }
    } catch (err) {
      console.error('Error loading graph:', err);
      setError(err instanceof Error ? err.message : '加载关系图谱失败');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, dataSourceId, databaseId, depth, includeInferred, minConfidence]);

  // 转换为 ReactFlow 数据格式
  const convertToReactFlowData = (
    graphNodes: GraphNode[],
    graphEdges: GraphEdge[]
  ) => {
    // 计算布局（简单的力导向布局）
    const layoutNodes = calculateLayout(graphNodes, graphEdges);

    // 按数据库分组节点（用于跨库关系识别和颜色分配）
    const databaseGroups = new Map<string, number>();
    const databaseColors = [
      '#3b82f6', // blue
      '#8b5cf6', // violet
      '#ec4899', // pink
      '#f59e0b', // amber
      '#10b981', // emerald
      '#06b6d4', // cyan
    ];

    // 按数据库分组节点位置（用于绘制分组背景）
    const nodesByDatabase = new Map<string, typeof layoutNodes>();
    layoutNodes.forEach((node) => {
      if (!nodesByDatabase.has(node.databaseName)) {
        nodesByDatabase.set(node.databaseName, []);
      }
      nodesByDatabase.get(node.databaseName)!.push(node);
    });

    graphNodes.forEach((node) => {
      if (!databaseGroups.has(node.databaseName)) {
        databaseGroups.set(node.databaseName, databaseGroups.size);
      }
    });

    // 计算每个数据库组的边界框（用于绘制分组背景）
    const databaseBounds = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
    nodesByDatabase.forEach((nodes, dbName) => {
      const positions = nodes.map(n => n.position);
      const minX = Math.min(...positions.map(p => p.x)) - 100;
      const minY = Math.min(...positions.map(p => p.y)) - 80;
      const maxX = Math.max(...positions.map(p => p.x)) + 280;
      const maxY = Math.max(...positions.map(p => p.y)) + 80;
      databaseBounds.set(dbName, { minX, minY, maxX, maxY });
    });

    // 添加数据库分组背景节点（仅在多数据库时显示）
    const groupBackgroundNodes: Node[] = [];
    if (databaseGroups.size > 1) {
      databaseBounds.forEach((bounds, dbName) => {
        const dbIndex = databaseGroups.get(dbName) || 0;
        const dbColor = databaseColors[dbIndex % databaseColors.length];

        groupBackgroundNodes.push({
          id: `db-group-${dbName}`,
          type: 'default',
          data: {
            label: `📁 ${dbName}`,
            databaseName: dbName,
          },
          position: { x: bounds.minX, y: bounds.minY },
          draggable: false,
          selectable: false,
          style: {
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
            background: `${dbColor}08`, // 极淡的背景色
            border: `2px dashed ${dbColor}40`,
            borderRadius: '12px',
            padding: '20px',
            fontSize: '14px',
            fontWeight: 'bold',
            color: dbColor,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            zIndex: -1,
            pointerEvents: 'none',
          },
          zIndex: -1,
        });
      });
    }

    // 转换表节点
    const flowNodes: Node[] = layoutNodes.map((node) => {
      const dbIndex = databaseGroups.get(node.databaseName) || 0;
      const dbColor = databaseColors[dbIndex % databaseColors.length];
      const isCenterNode = node.tableId === tableId;

      return {
        id: node.tableId.toString(),
        type: 'default',
        data: {
          label: `${node.tableName}${databaseGroups.size === 1 ? `\n${node.databaseName}` : ''}`,
          tableId: node.tableId,
          databaseName: node.databaseName,
          tableName: node.tableName,
        },
        position: node.position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: isCenterNode ? dbColor : '#ffffff',
          color: isCenterNode ? '#ffffff' : '#000000',
          border: `2px solid ${dbColor}`,
          borderRadius: '8px',
          padding: '10px 12px',
          width: 180,
          fontSize: '12px',
          fontWeight: isCenterNode ? 'bold' : 'normal',
          textAlign: 'center' as const,
          whiteSpace: 'pre-line' as const,
          boxShadow: isCenterNode ? '0 4px 6px rgba(0, 0, 0, 0.1)' : 'none',
          zIndex: 10,
        },
      };
    });

    // 合并背景节点和表节点
    const allNodes = [...groupBackgroundNodes, ...flowNodes];

    // 转换边
    const flowEdges: Edge[] = graphEdges.map((edge, index) => {
      const isExplicit = edge.type === 'explicit';
      const isVerified = edge.type === 'verified';

      // 判断是否为跨库关系
      const sourceNode = graphNodes.find((n) => n.tableId === edge.sourceTableId);
      const targetNode = graphNodes.find((n) => n.tableId === edge.targetTableId);
      const isCrossDatabase = sourceNode && targetNode &&
        sourceNode.databaseName !== targetNode.databaseName;

      // 跨库关系使用更粗的线条和特殊颜色
      const strokeWidth = isCrossDatabase ? 3 : 2;
      const strokeColor = isCrossDatabase
        ? '#dc2626' // 跨库关系用红色
        : isExplicit
        ? '#10b981' // 显式关系用绿色
        : isVerified
        ? '#f59e0b' // 已验证推断关系用橙色
        : '#94a3b8'; // 未验证推断关系用灰色

      return {
        id: `edge-${edge.sourceTableId}-${edge.targetTableId}-${index}`,
        source: edge.sourceTableId.toString(),
        target: edge.targetTableId.toString(),
        type: 'smoothstep',
        animated: isCrossDatabase || (!isExplicit && !isVerified),
        style: {
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isExplicit ? '0' : '5,5',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
        label: edge.confidence
          ? `${edge.sourceColumn} → ${edge.targetColumn}\n${isCrossDatabase ? '🔗 跨库 ' : ''}(${(edge.confidence * 100).toFixed(0)}%)`
          : `${edge.sourceColumn} → ${edge.targetColumn}${isCrossDatabase ? '\n🔗 跨库关系' : ''}`,
        labelStyle: {
          fontSize: 10,
          fill: isCrossDatabase ? '#dc2626' : '#000',
          fontWeight: isCrossDatabase ? 600 : 500,
        },
        labelBgStyle: {
          fill: '#fff',
          fillOpacity: 0.95,
        },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 4,
        data: {
          type: edge.type,
          relationshipType: edge.relationshipType,
          confidence: edge.confidence,
          sourceColumn: edge.sourceColumn,
          targetColumn: edge.targetColumn,
          isVerified: edge.type === 'verified',
          isCrossDatabase,
        },
      };
    });

    setNodes(allNodes);
    setEdges(flowEdges);
  };

  // 按数据库分组的布局算法
  const calculateLayout = (
    graphNodes: GraphNode[],
    graphEdges: GraphEdge[]
  ): Array<GraphNode & { position: { x: number; y: number } }> => {
    const nodeCount = graphNodes.length;
    if (nodeCount === 0) return [];

    // 按数据库分组节点
    const nodesByDatabase = new Map<string, GraphNode[]>();
    graphNodes.forEach((node) => {
      const dbName = node.databaseName;
      if (!nodesByDatabase.has(dbName)) {
        nodesByDatabase.set(dbName, []);
      }
      nodesByDatabase.get(dbName)!.push(node);
    });

    const databases = Array.from(nodesByDatabase.keys());
    const databaseCount = databases.length;

    // 布局参数
    const groupSpacing = 400; // 数据库组之间的间距
    const nodeSpacing = 220; // 节点之间的间距
    const groupPadding = 50; // 分组内边距

    const layoutNodes: Array<GraphNode & { position: { x: number; y: number } }> = [];

    // 如果只有一个数据库，使用传统布局
    if (databaseCount === 1) {
      if (tableId) {
        // 中心节点径向布局
        const centerNodeIndex = graphNodes.findIndex((n) => n.tableId === tableId);
        const centerNode = graphNodes[centerNodeIndex];
        const otherNodes = graphNodes.filter((n) => n.tableId !== tableId);

        const radius = 250;
        const angleStep = (2 * Math.PI) / Math.max(otherNodes.length, 1);

        if (centerNode) {
          layoutNodes.push({
            ...centerNode,
            position: { x: 400, y: 300 },
          });
        }

        otherNodes.forEach((node, index) => {
          const angle = index * angleStep;
          layoutNodes.push({
            ...node,
            position: {
              x: 400 + radius * Math.cos(angle),
              y: 300 + radius * Math.sin(angle),
            },
          });
        });

        return layoutNodes;
      } else {
        // 网格布局
        const cols = Math.ceil(Math.sqrt(nodeCount));
        return graphNodes.map((node, index) => ({
          ...node,
          position: {
            x: (index % cols) * nodeSpacing + 100,
            y: Math.floor(index / cols) * nodeSpacing + 100,
          },
        }));
      }
    }

    // 多数据库分组布局
    // 计算每列的布局（每列代表一个数据库）
    if (databaseCount <= 4) {
      // 水平排列（适合 2-4 个数据库）
      databases.forEach((dbName, dbIndex) => {
        const nodesInDb = nodesByDatabase.get(dbName)!;
        const x = dbIndex * groupSpacing + 150;

        nodesInDb.forEach((node, nodeIndex) => {
          const y = nodeIndex * nodeSpacing + 100;
          layoutNodes.push({
            ...node,
            position: { x, y },
          });
        });
      });
    } else {
      // 网格排列（适合 5+ 个数据库）
      const dbCols = Math.ceil(Math.sqrt(databaseCount));

      databases.forEach((dbName, dbIndex) => {
        const nodesInDb = nodesByDatabase.get(dbName)!;

        // 计算数据库组的基础位置
        const dbCol = dbIndex % dbCols;
        const dbRow = Math.floor(dbIndex / dbCols);
        const baseX = dbCol * groupSpacing + 150;
        const baseY = dbRow * groupSpacing + 100;

        nodesInDb.forEach((node, nodeIndex) => {
          const nodeCols = Math.ceil(Math.sqrt(nodesInDb.length));
          const nodeCol = nodeIndex % nodeCols;
          const nodeRow = Math.floor(nodeIndex / nodeCols);

          layoutNodes.push({
            ...node,
            position: {
              x: baseX + nodeCol * nodeSpacing,
              y: baseY + nodeRow * nodeSpacing,
            },
          });
        });
      });
    }

    return layoutNodes;
  };

  // 处理节点点击
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const originalNode = graphData?.nodes.find((n) => n.tableId.toString() === node.id);
      if (originalNode && onNodeClick) {
        onNodeClick(originalNode);
      }
    },
    [graphData, onNodeClick]
  );

  // 处理边点击
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const originalEdge = graphData?.edges.find((e) => {
        const edgeId = edge.id;
        const match = edgeId.match(/edge-(\d+)-(\d+)-\d+/);
        if (!match) return false;
        return e.sourceTableId.toString() === match[1] && e.targetTableId.toString() === match[2];
      });
      if (originalEdge && onEdgeClick) {
        onEdgeClick(originalEdge);
      }
    },
    [graphData, onEdgeClick]
  );

  // 初始加载
  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="stroke-current shrink-0 h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{error}</span>
      </div>
    );
  }

  // 计算图例需要显示的内容
  const hasExplicitRelation = edges.some(e => e.data?.type === 'explicit');
  const hasVerifiedRelation = edges.some(e => e.data?.type === 'verified');
  const hasInferredRelation = edges.some(e => e.data?.type === 'inferred');
  const hasCrossDatabase = edges.some(e => e.data?.isCrossDatabase);
  const hasCenterNode = tableId !== undefined;
  const databaseCount = graphData ? new Set(graphData.nodes.map(n => n.databaseName)).size : 0;

  return (
    <div className="w-full h-full bg-base-200 rounded-lg border border-base-300">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.id === tableId?.toString()) return '#3b82f6';
            return '#ffffff';
          }}
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
      </ReactFlow>

      {/* 动态图例 */}
      {(hasExplicitRelation || hasVerifiedRelation || hasInferredRelation || hasCrossDatabase || hasCenterNode) && (
        <div className="absolute bottom-4 right-4 bg-base-100 p-4 rounded-lg shadow-lg border border-base-300 max-w-xs">
          <div className="text-sm font-bold mb-3">图例说明</div>
          <div className="space-y-2 text-xs">
            {/* 关系类型 */}
            {(hasExplicitRelation || hasVerifiedRelation || hasInferredRelation) && (
              <>
                <div className="font-semibold text-xs mb-1">关系类型</div>
                {hasExplicitRelation && (
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-0.5 bg-green-500"></div>
                    <span>显式关系 (外键)</span>
                  </div>
                )}
                {hasVerifiedRelation && (
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-0.5 bg-orange-500"></div>
                    <span>已验证推断关系</span>
                  </div>
                )}
                {hasInferredRelation && (
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-0.5 bg-gray-400 border-dashed border-t-2 border-gray-400"></div>
                    <span>未验证推断关系</span>
                  </div>
                )}
              </>
            )}

            {/* 跨库关系 */}
            {hasCrossDatabase && (
              <div className={`${(hasExplicitRelation || hasVerifiedRelation || hasInferredRelation) ? 'mt-3 pt-3 border-t border-base-300' : ''}`}>
                <div className="font-semibold text-xs mb-1">🔗 跨库关系</div>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-0.5 bg-red-600" style={{ height: '3px' }}></div>
                  <span className="font-medium text-red-600">跨数据库连接</span>
                </div>
                <div className="text-xs text-gray-500 mt-1 ml-14">
                  红色粗线表示跨库关系
                </div>
              </div>
            )}

            {/* 节点样式 */}
            {hasCenterNode && (
              <div className={`${(hasExplicitRelation || hasVerifiedRelation || hasInferredRelation || hasCrossDatabase) ? 'mt-3 pt-3 border-t border-base-300' : ''}`}>
                <div className="font-semibold text-xs mb-1">节点样式</div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-500 rounded border-2 border-blue-500"></div>
                  <span>中心节点</span>
                </div>
                {databaseCount > 1 && (
                  <div className="text-xs text-gray-500 mt-1 ml-8">
                    不同数据库用不同颜色边框
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
