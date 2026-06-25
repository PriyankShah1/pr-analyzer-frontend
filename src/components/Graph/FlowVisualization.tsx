// src/components/Graph/FlowVisualization.tsx
import { useCallback, useEffect } from 'react';
import ReactFlow, {
  Node, Edge, addEdge, Connection,
  useNodesState, useEdgesState,
  Controls, Background, NodeTypes,
  BackgroundVariant, useReactFlow,
  ReactFlowProvider, getRectOfNodes,
  getTransformForBounds,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CustomNode }    from './CustomNode';
import { Legend }        from './Legend';
import { FlowDetails }   from './FlowDetails';
import { AIExplanation } from './AIExplanation';
import { Pill }          from '../Common/Pill';
import type { AnalysisFlow, AnalysisStats, Theme } from '../../types';

const nodeTypes: NodeTypes = { custom: CustomNode };

interface FlowVisualizationProps {
  nodes:    Node[];
  edges:    Edge[];
  theme:    Theme;
  flows?:   AnalysisFlow[];
  prTitle?: string;
  prUrl?:   string;
  stats?:   AnalysisStats;
  codeLanguage?:   string;
  codeContext?:    string;
  aiExplanations?: Record<string, string>;
}

function FlowInner({
  nodes, edges, theme, flows, prTitle, prUrl, stats,
  codeLanguage, codeContext, aiExplanations,
}: FlowVisualizationProps) {
  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges);
  const { getNodes } = useReactFlow();

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
    clone.style.transform       = `translate(${tx}px, ${ty}px) scale(${zoom})`;
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

  const hasBottomPanels = stats && flows && flows.length > 0 && stats.totalNodes > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>  {/* ← no height: 100%, page scrolls */}

      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
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
          }}>
            📥 Export PNG
          </button>
        </div>

        {prTitle && (
          <a
            href={prUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'block', fontSize: 15, fontWeight: 700,
              color: 'var(--text)', textDecoration: 'none',
              letterSpacing: '-0.02em', lineHeight: 1.3, marginBottom: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}
          >
            {prTitle}
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 400 }}>
              ↗ open on GitHub
            </span>
          </a>
        )}

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

      {/* ── Legend ── */}
      <Legend />

      {/* ── Graph — fixed height so ReactFlow renders correctly ── */}
      {/* Height is viewport-based so it always fills the visible screen */}
      <div style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
        <ReactFlow
          nodes={nodesState}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          preventScrolling={false}
          zoomOnScroll={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color={theme === 'dark' ? '#1e293b' : '#e2e8f0'}
            gap={20}
          />
          <Controls />
        </ReactFlow>
      </div>

      {/* ── Bottom panels: AI Explanation | Flow Details side by side ── */}
      {/* Auto height — expands to content, page scrolls to show it */}
      {hasBottomPanels && (
        <div style={{
          display: 'flex',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--surface)',
          minHeight: 200,    // minimum — grows with content
        }}>
          <AIExplanation
            prTitle={prTitle}
            codeLanguage={codeLanguage}
            flows={flows!}
            stats={stats!}
            codeContext={codeContext}
            initialExplanations={aiExplanations}
          />
          <FlowDetails flows={flows!} />
        </div>
      )}
    </div>
  );
}

export function FlowVisualization(props: FlowVisualizationProps) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}