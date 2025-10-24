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
  id: number;
  label: string;
  type: 'table';
  databaseId: number;
  databaseName: string;
  tableId: number;
}

interface GraphEdge {
  id: string;
  source: number;
  target: number;
  type: 'explicit' | 'inferred';
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
  confidence?: number;
  sourceColumn: string;
  targetColumn: string;
  isVerified?: boolean;
}

interface RelationshipGraphProps {
  tableId?: number;
  databaseId?: number;
  depth?: number;
  includeInferred?: boolean;
  minConfidence?: number;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
}

export default function RelationshipGraph({
  tableId,
  databaseId,
  depth = 2,
  includeInferred = true,
  minConfidence = 0.7,
  onNodeClick,
  onEdgeClick,
}: RelationshipGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null>(null);

  // 加载关系图谱数据
  const loadGraph = useCallback(async () => {
    if (!tableId && !databaseId) {
      setError('请指定 tableId 或 databaseId');
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

      if (tableId) {
        params.append('tableId', tableId.toString());
      } else if (databaseId) {
        params.append('databaseId', databaseId.toString());
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
  }, [tableId, databaseId, depth, includeInferred, minConfidence]);

  // 转换为 ReactFlow 数据格式
  const convertToReactFlowData = (
    graphNodes: GraphNode[],
    graphEdges: GraphEdge[]
  ) => {
    // 计算布局（简单的力导向布局）
    const layoutNodes = calculateLayout(graphNodes, graphEdges);

    // 转换节点
    const flowNodes: Node[] = layoutNodes.map((node) => ({
      id: node.id.toString(),
      type: 'default',
      data: {
        label: `${node.label}\n${node.databaseName}`,
        tableId: node.tableId,
        databaseId: node.databaseId,
        databaseName: node.databaseName,
        tableName: node.label,
      },
      position: node.position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: node.id === tableId ? '#3b82f6' : '#ffffff',
        color: node.id === tableId ? '#ffffff' : '#000000',
        border: '2px solid #3b82f6',
        borderRadius: '8px',
        padding: '10px 12px',
        width: 180,
        fontSize: '12px',
        fontWeight: node.id === tableId ? 'bold' : 'normal',
        textAlign: 'center' as const,
        whiteSpace: 'pre-line' as const,
      },
    }));

    // 转换边
    const flowEdges: Edge[] = graphEdges.map((edge) => {
      const isExplicit = edge.type === 'explicit';
      const isVerified = edge.isVerified;

      return {
        id: edge.id,
        source: edge.source.toString(),
        target: edge.target.toString(),
        type: 'smoothstep',
        animated: !isExplicit && !isVerified,
        style: {
          stroke: isExplicit ? '#10b981' : isVerified ? '#f59e0b' : '#94a3b8',
          strokeWidth: 2,
          strokeDasharray: isExplicit ? '0' : '5,5',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isExplicit ? '#10b981' : isVerified ? '#f59e0b' : '#94a3b8',
        },
        label: edge.confidence
          ? `${edge.sourceColumn} → ${edge.targetColumn} (${(edge.confidence * 100).toFixed(0)}%)`
          : `${edge.sourceColumn} → ${edge.targetColumn}`,
        labelStyle: {
          fontSize: 10,
          fill: '#000',
          fontWeight: 500,
        },
        labelBgStyle: {
          fill: '#fff',
          fillOpacity: 0.9,
        },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 4,
        data: {
          type: edge.type,
          relationshipType: edge.relationshipType,
          confidence: edge.confidence,
          sourceColumn: edge.sourceColumn,
          targetColumn: edge.targetColumn,
          isVerified: edge.isVerified,
        },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // 简单的力导向布局算法
  const calculateLayout = (
    graphNodes: GraphNode[],
    graphEdges: GraphEdge[]
  ): Array<GraphNode & { position: { x: number; y: number } }> => {
    const nodeCount = graphNodes.length;
    if (nodeCount === 0) return [];

    // 如果有中心节点,使用径向布局
    if (tableId) {
      const centerNodeIndex = graphNodes.findIndex((n) => n.id === tableId);
      const centerNode = graphNodes[centerNodeIndex];
      const otherNodes = graphNodes.filter((n) => n.id !== tableId);

      const radius = 250;
      const angleStep = (2 * Math.PI) / Math.max(otherNodes.length, 1);

      const layoutNodes: Array<GraphNode & { position: { x: number; y: number } }> = [];

      // 中心节点
      if (centerNode) {
        layoutNodes.push({
          ...centerNode,
          position: { x: 400, y: 300 },
        });
      }

      // 环形布局其他节点
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
      const spacing = 250;

      return graphNodes.map((node, index) => ({
        ...node,
        position: {
          x: (index % cols) * spacing + 100,
          y: Math.floor(index / cols) * spacing + 100,
        },
      }));
    }
  };

  // 处理节点点击
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const originalNode = graphData?.nodes.find((n) => n.id.toString() === node.id);
      if (originalNode && onNodeClick) {
        onNodeClick(originalNode);
      }
    },
    [graphData, onNodeClick]
  );

  // 处理边点击
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const originalEdge = graphData?.edges.find((e) => e.id === edge.id);
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

      {/* 图例 */}
      <div className="absolute bottom-4 right-4 bg-base-100 p-4 rounded-lg shadow-lg border border-base-300">
        <div className="text-sm font-bold mb-2">图例</div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-12 h-0.5 bg-green-500"></div>
            <span>显式关系 (外键)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-12 h-0.5 bg-orange-500"></div>
            <span>已验证推断关系</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-12 h-0.5 bg-gray-400 border-dashed border-t-2 border-gray-400"></div>
            <span>未验证推断关系</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-500 rounded border-2 border-blue-500"></div>
            <span>中心节点</span>
          </div>
        </div>
      </div>
    </div>
  );
}
