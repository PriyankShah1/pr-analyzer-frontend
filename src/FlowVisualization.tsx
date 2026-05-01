import { useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  Node, Edge, addEdge, Connection,
  useNodesState, useEdgesState,
  Controls, Background, NodeTypes,
  BackgroundVariant, useReactFlow,
  ReactFlowProvider, getRectOfNodes,
  getTransformForBounds,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CustomNode } from './CustomNode';

const nodeTypes: NodeTypes = { custom: CustomNode };

interface VisualizationProps {
  nodes: Node[];
  edges: Edge[];
  theme: 'light' | 'dark';
  flows?: any[];
  prTitle?: string;
  prUrl?: string;
  stats?: {
    totalNodes: number;
    totalEdges: number;
    mismatches: number;
    brokenDependencies?: number;
    deletedClasses?: number;
  };
}

// ── Color legend ──────────────────────────────────────────────────────────
const LEGEND = [
  { color: '#2563eb', label: 'Controller',   dot: false },
  { color: '#0d9488', label: 'Service',      dot: false },
  { color: '#4f46e5', label: 'Route',        dot: false },
  { color: '#d97706', label: 'Middleware',   dot: false },
  { color: '#92400e', label: 'Model',        dot: false },
  { color: '#475569', label: 'Facade',       dot: false },
  { color: '#0891b2', label: 'Repository',   dot: false },
  { color: '#7c3aed', label: 'Client',       dot: false },
  { color: '#dc2626', label: 'Type Mismatch', dot: true },
  { color: '#f97316', label: 'Broken Dependency',   dot: true  },
  { color: '#6b7280', label: 'Deleted',      dot: true  },
];

function Legend() {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '4px 12px',
      padding: '6px 16px',
      borderBottom: '1px solid var(--border)',
      backgroundColor: 'var(--surface)',
      flexShrink: 0,
    }}>
      {LEGEND.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width:  item.dot ? 8  : 12,
            height: item.dot ? 8  : 3,
            borderRadius: item.dot ? '50%' : 2,
            backgroundColor: item.color,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600,
      backgroundColor: `${color}20`, color,
      border: `1px solid ${color}40`, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function FlowInner({ nodes, edges, theme, flows, prTitle, prUrl, stats }: VisualizationProps) {
  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges);
  const { getNodes } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setNodes(nodes); }, [nodes, setNodes]);
  useEffect(() => { setEdges(edges); }, [edges, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge(connection, eds)),
    [setEdges]
  );

  const downloadAsPNG = useCallback(async () => {
    const allNodes = getNodes();
    if (allNodes.length === 0) return;

    const bounds  = getRectOfNodes(allNodes);
    const padding = 60;
    const exportW = Math.round(bounds.width  + padding * 2);
    const exportH = Math.round(bounds.height + padding * 2);
    const [tx, ty, zoom] = getTransformForBounds(bounds, exportW, exportH, 0.1, 4);

    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!viewport) return;

    const offscreen = document.createElement('div');
    offscreen.style.cssText = `
      position: fixed; top: -9999px; left: -9999px;
      width: ${exportW}px; height: ${exportH}px;
      overflow: hidden;
      background: ${theme === 'dark' ? '#0f172a' : '#ffffff'};
      z-index: -1; pointer-events: none;
    `;

    const clone = viewport.cloneNode(true) as HTMLElement;
    clone.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
    clone.style.transformOrigin = '0 0';
    offscreen.appendChild(clone);
    document.body.appendChild(offscreen);

    await new Promise(r => setTimeout(r, 80));

    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(offscreen, {
        backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
        width: exportW, height: exportH, scale: 2,
        useCORS: true, foreignObjectRendering: false, logging: false,
        x: 0, y: 0, scrollX: 0, scrollY: 0,
        windowWidth: exportW, windowHeight: exportH,
      });

      const link = document.createElement('a');
      link.download = `${prTitle ? prTitle.replace(/[^a-z0-9]/gi, '-') : 'pr-flow-graph'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      document.body.removeChild(offscreen);
    }
  }, [theme, getNodes, prTitle]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        flexShrink: 0,
      }}>

        {/* Row 1: PR Title — big, prominent, full width (AT TOP) */}
        {prTitle ? (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text)',
              textDecoration: 'none',
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
              marginBottom: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}
          >
            {prTitle}
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 400 }}>
              ↗ open on GitHub
            </span>
          </a>
        ) : (
          <div style={{ height: 4 }} /> // spacer when no title
        )}

        {/* Row 2: label + export button */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 4,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-muted)',
          }}>
            Code Flow Graph
          </span>
          <button onClick={downloadAsPNG} style={{
            padding: '4px 10px', backgroundColor: 'var(--btn-bg)',
            border: '1px solid var(--border)', borderRadius: 6,
            cursor: 'pointer', fontSize: 11,
            color: 'var(--text-secondary)', fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>
            📥 Export PNG
          </button>
        </div>

        {/* Row 3: Stats pills */}
        {stats && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Pill color="var(--text-muted)" label={`${stats.totalNodes} nodes`} />
            <Pill color="var(--text-muted)" label={`${stats.totalEdges} edges`} />
            {(stats.mismatches ?? 0) > 0 && (
              <Pill color="#dc2626" label={`⚠️ ${stats.mismatches} mismatch${stats.mismatches > 1 ? 'es' : ''}`} />
            )}
            {(stats.brokenDependencies ?? 0) > 0 && (
              <Pill color="#f97316" label={`💥 ${stats.brokenDependencies} broken`} />
            )}
            {(stats.deletedClasses ?? 0) > 0 && (
              <Pill color="#6b7280" label={`🗑️ ${stats.deletedClasses} deleted`} />
            )}
          </div>
        )}
      </div>

      {/* ── Color legend ── */}
      <Legend />

      {/* ── Graph ── */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodesState}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color={theme === 'dark' ? '#1e293b' : '#e2e8f0'}
            gap={20}
          />
          <Controls />
        </ReactFlow>
      </div>

      {/* ── Flow details ── */}
      {flows && flows.length > 0 && (
        <div style={{
          maxHeight: '200px', overflowY: 'auto',
          borderTop: '1px solid var(--border)',
          flexShrink: 0, backgroundColor: 'var(--surface)',
        }}>
          <div style={{
            padding: '8px 16px 4px', fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)',
          }}>
            Flow Details
          </div>
          {flows.map((flow: any, idx: number) => (
            <div key={idx} style={{
              padding: '8px 16px', borderBottom: '1px solid var(--border)',
              borderLeft: `3px solid ${
                flow.brokenDependency ? '#f97316' :
                flow.mismatch        ? '#dc2626' :
                flow.deletedSource   ? '#6b7280' : 'var(--border)'
              }`,
              backgroundColor:
                flow.brokenDependency ? 'rgba(249,115,22,0.05)' :
                flow.mismatch        ? 'rgba(220,38,38,0.05)'  : 'transparent',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                {flow.from} → {flow.to}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Return type:{' '}
                <code style={{ backgroundColor: 'var(--btn-bg)', padding: '1px 4px', borderRadius: 3 }}>
                  {flow.returnType || 'unknown'}
                </code>
                {flow.brokenDependency && (
                  <span style={{ color: '#f97316', marginLeft: 8, fontWeight: 600 }}>💥 {flow.message}</span>
                )}
                {flow.mismatch && !flow.brokenDependency && (
                  <span style={{ color: '#dc2626', marginLeft: 8, fontWeight: 600 }}>❌ {flow.message}</span>
                )}
                {flow.deletedSource && (
                  <span style={{ color: '#6b7280', marginLeft: 8, fontWeight: 600 }}>🗑️ {flow.message}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlowVisualization(props: VisualizationProps) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}