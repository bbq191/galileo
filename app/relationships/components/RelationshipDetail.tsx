'use client';

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

interface RelationshipDetailProps {
  selectedNode?: GraphNode | null;
  selectedEdge?: GraphEdge | null;
  onClose?: () => void;
  onSetAsCenter?: (tableId: number, databaseId: number) => void;
}

export default function RelationshipDetail({
  selectedNode,
  selectedEdge,
  onClose,
  onSetAsCenter,
}: RelationshipDetailProps) {
  // 如果没有选择任何内容
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="text-center py-8">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 mx-auto text-base-300 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-bold mb-2">选择节点或关系</h3>
            <p className="text-base-content/60">
              点击图谱中的节点或关系线查看详细信息
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 节点详情
  if (selectedNode) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title">表详情</h2>
            {onClose && (
              <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          <div className="space-y-4">
            {/* 表名 */}
            <div>
              <div className="text-sm text-base-content/60 mb-1">表名</div>
              <div className="text-lg font-bold">{selectedNode.label}</div>
            </div>

            {/* 数据库 */}
            <div>
              <div className="text-sm text-base-content/60 mb-1">所属数据库</div>
              <div className="flex items-center gap-2">
                <span className="badge badge-primary">{selectedNode.databaseName}</span>
                <span className="text-xs text-base-content/40">
                  ID: {selectedNode.databaseId}
                </span>
              </div>
            </div>

            {/* 表ID */}
            <div>
              <div className="text-sm text-base-content/60 mb-1">表 ID</div>
              <div className="font-mono text-sm">{selectedNode.tableId}</div>
            </div>

            {/* 操作按钮 */}
            <div className="divider"></div>
            <div className="flex gap-2 flex-col">
              <a
                href={`/metadata?tableId=${selectedNode.tableId}`}
                className="btn btn-primary btn-sm w-full"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                查看元数据
              </a>
              <button
                className="btn btn-outline btn-sm w-full"
                onClick={() => {
                  if (onSetAsCenter) {
                    onSetAsCenter(selectedNode.tableId, selectedNode.databaseId);
                  }
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                以此表为中心
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 关系详情
  if (selectedEdge) {
    const relationshipTypeMap = {
      'one-to-one': '一对一',
      'one-to-many': '一对多',
      'many-to-many': '多对多',
    };

    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title">关系详情</h2>
            {onClose && (
              <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          <div className="space-y-4">
            {/* 关系类型标识 */}
            <div className="flex gap-2">
              {selectedEdge.type === 'explicit' ? (
                <span className="badge badge-success gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  显式关系 (外键)
                </span>
              ) : selectedEdge.isVerified ? (
                <span className="badge badge-warning gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  已验证推断关系
                </span>
              ) : (
                <span className="badge badge-ghost gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  推断关系
                </span>
              )}
            </div>

            {/* 关系类型 */}
            <div>
              <div className="text-sm text-base-content/60 mb-1">关系类型</div>
              <div className="badge badge-outline badge-lg">
                {relationshipTypeMap[selectedEdge.relationshipType]}
              </div>
            </div>

            {/* 字段映射 */}
            <div>
              <div className="text-sm text-base-content/60 mb-2">字段映射</div>
              <div className="bg-base-200 p-3 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-xs text-base-content/60">源字段</div>
                    <div className="font-mono text-sm font-bold">
                      {selectedEdge.sourceColumn}
                    </div>
                  </div>
                  <div className="text-2xl text-base-content/40">→</div>
                  <div className="flex-1 text-right">
                    <div className="text-xs text-base-content/60">目标字段</div>
                    <div className="font-mono text-sm font-bold">
                      {selectedEdge.targetColumn}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 置信度（仅推断关系） */}
            {selectedEdge.type === 'inferred' && selectedEdge.confidence && (
              <div>
                <div className="text-sm text-base-content/60 mb-2">置信度</div>
                <div className="flex items-center gap-2">
                  <progress
                    className="progress progress-primary w-full"
                    value={selectedEdge.confidence * 100}
                    max="100"
                  ></progress>
                  <span className="text-sm font-bold">
                    {(selectedEdge.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            {/* 关系ID */}
            <div>
              <div className="text-sm text-base-content/60 mb-1">关系 ID</div>
              <div className="font-mono text-xs text-base-content/60">
                {selectedEdge.id}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
