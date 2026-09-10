// src/components/Graph/FlowVisualization.tsx
import { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  Node, Edge, addEdge, Connection,
  useNodesState, useEdgesState,
  Controls, Background, NodeTypes,
  BackgroundVariant, useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CustomNode }        from './CustomNode';
import { RunHeader }          from './RunHeader';
import { CodeFlowBar }        from './CodeFlowBar';
import { PRActionBar, type PanelTab } from './PRActionBar';
import { TriagePanel }        from './TriagePanel';
import { computeExportScale, willDownscale } from '../../utils/exportScale';
import type { AnalysisFlow, AnalysisStats, Theme } from '../../types';
import type { Finding, RiskDiff } from '../../types/risk';

const nodeTypes: NodeTypes = { custom: CustomNode };

// LEAF nodes (hook/api_call/context_provider) ARE one specific call —
// clicking shows THAT call's own trace. COMPONENT nodes OWN multiple
// outgoing edges — clicking shows a SUMMARY of all of them instead.
const LEAF_TRACE_TYPES = new Set(['hook', 'api_call', 'context_provider']);
const COMPONENT_TYPES  = new Set(['component']);

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
  risks?:          Finding[];
  riskDiff?:       RiskDiff | null;
  githubToken?:    string;
  onBackToHistory: () => void;
  onWriteComplete?: (mode: 'comment' | 'commit') => void;
  aiReviewRan?: boolean;
  onRunInDepth?: () => void;
  inDepthRunning?: boolean;
  autoMinutes?: number;
  onAutoMinutesChange?: (minutes: number) => void;
  changeNotice?: { sha: string; summary: string; at: number } | null;
  onDismissNotice?: () => void;
  /** Bumped when a run is adopted, so views over STORED data recompute. */
  dataVersion?: number;
  tokenOptional?: boolean;
  onNeedToken?: () => void;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  /** Bumped by the detail panel to request a pan to a component by name. */
  locateRequest?: { name: string; nonce: number } | null;
}

function FlowInner({
  nodes, edges, theme, flows, prTitle, prUrl, stats,
  codeLanguage, codeContext, aiExplanations,
  risks = [], riskDiff, githubToken, onBackToHistory, onWriteComplete,
  aiReviewRan, onRunInDepth, inDepthRunning, tokenOptional, onNeedToken,
  autoMinutes, onAutoMinutesChange, changeNotice, onDismissNotice, dataVersion,
  onReanalyze, reanalyzing,
  selectedNodeId, onSelectNode, locateRequest,
}: FlowVisualizationProps) {
  const [exporting, setExporting] = useState(false);
  // Set when the graph exceeded the canvas limit and the PNG was shrunk to
  // fit, so the export can say so instead of quietly handing over a smaller
  // image than the graph on screen.
  const [exportNote, setExportNote] = useState<string | null>(null);
  // Owned here so the triage strip's "which ones?" link and the action bar's
  // Review history button open the same panel.
  // A counter, not a flag: the triage strip may ask for the history again
  // after the panel has been closed, and a boolean already set to true would
  // swallow the second request.
  const [historyRequest, setHistoryRequest] = useState(0);
  // Which view the action bar is showing. Owned here because opening one
  // REPLACES the triage list and canvas rather than stacking above them.
  const [panelTab, setPanelTab] = useState<PanelTab>(null);
  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges);
  const { getNodes, flowToScreenPosition, setCenter, fitView } = useReactFlow();
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  // Briefly highlighted node id, set when "Locate" is clicked from the
  // triage panel — gives a visible pulse so the reviewer can find it even
  // in a large graph, distinct from the click-to-open-trace-card state.
  const [locatedNodeId, setLocatedNodeId] = useState<string | null>(null);


  // Without these two, React Flow would keep the copy it took on mount and a
  // Refresh would leave stale badges on the graph while the triage list moved on.
  useEffect(() => { setNodes(nodes); }, [nodes, setNodes]);
  useEffect(() => { setEdges(edges); }, [edges, setEdges]);

  // `fitView` on <ReactFlow> only runs at init. When a re-analysis changes
  // WHICH nodes exist, the layout is recomputed and the old viewport can leave
  // the new graph half off-screen — so refit, but only then. Refitting on every
  // refresh would yank the view away from someone who had deliberately panned
  // to a node, and a badge changing does not move anything.
  const nodeIdsKey = nodes.map(n => n.id).join('|');
  const previousNodeIds = useRef(nodeIdsKey);
  useEffect(() => {
    if (previousNodeIds.current === nodeIdsKey) return;
    previousNodeIds.current = nodeIdsKey;
    // Let the new nodes commit and be measured before framing them.
    const id = requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
    return () => cancelAnimationFrame(id);
  }, [nodeIdsKey, fitView]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge(connection, eds)),
    [setEdges]
  );

  // The panel is docked, so a click only needs to record WHICH node is
  // selected. All the screen-space math the floating card required (and the
  // graph-space/screen-space bug it caused) is gone with it.
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    onSelectNode(node.id === selectedNodeId ? null : node.id);
  }, [onSelectNode, selectedNodeId]);

  // Called from TriagePanel's "Locate →" button. Pans/zooms the graph to
  // center the target node (using ReactFlow's own setCenter, which handles
  // the graph-space→screen-space conversion correctly, unlike the earlier
  // buggy manual approach), and briefly highlights it with a pulse so it's
  // findable even in a large, zoomed-out graph.
  const onLocateNode = useCallback((nodeId: string) => {
    const target = nodesState.find(n => n.id === nodeId);
    if (!target) return;

    setCenter(target.position.x + 90, target.position.y + 40, { zoom: 1.1, duration: 500 });
    setLocatedNodeId(nodeId);
    setTimeout(() => setLocatedNodeId(prev => (prev === nodeId ? null : prev)), 2000);
  }, [nodesState, setCenter]);

  // The trace card knows component NAMES; the graph is keyed by node id.
  // Bridge the two so a chip in the trace can pan to the real node, reusing
  // the same pulse the triage panel's "Locate" already uses.
  const onLocateComponent = useCallback((componentName: string) => {
    const target = nodesState.find(n => n.data?.label === componentName);
    if (target) onLocateNode(target.id);
  }, [nodesState, onLocateNode]);

  // The panel lives outside this subtree and cannot reach ReactFlow's
  // context, so it raises a request and this effect performs the pan.
  useEffect(() => {
    if (locateRequest?.name) onLocateComponent(locateRequest.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateRequest?.nonce]);

  // Merge the "located" pulse state into node data without mutating the
  // original nodesState array — CustomNode reads data.isLocated to render
  // a temporary highlight ring.
  const nodesWithLocateState = nodesState.map((n, i) => ({
    ...n,
    data: {
      ...n.data,
      order: i,
      isLocated: n.id === locatedNodeId,
      isSelected: n.id === selectedNodeId,
    },
  }));

  /**
   * Back to the whole graph after a Locate.
   *
   * Clears the selection and the located pulse as well as refitting — leaving
   * a node highlighted after zooming out makes it look like it is still the
   * subject of whatever panel is open.
   */
  const resetView = useCallback(() => {
    onSelectNode(null);
    setLocatedNodeId(null);
    fitView({ padding: 0.2, duration: 400 });
  }, [fitView, onSelectNode]);

  const downloadAsPNG = useCallback(async () => {
    const allNodes = getNodes();
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;

    // Bail BEFORE claiming the exporting state. The previous version set it
    // first and returned early on these two cases, leaving the button stuck
    // reading "Exporting…" with nothing in flight.
    if (allNodes.length === 0 || !viewport) return;

    setExporting(true);

    // Measure from the nodes themselves rather than the visible viewport, so
    // the export contains the WHOLE graph regardless of the current pan/zoom.
    // React Flow only fills width/height once a node has been measured, so an
    // unmeasured node falls back to the card size the UI actually renders —
    // without that, a node contributes zero size and the image crops.
    const FALLBACK_W = 222;
    const FALLBACK_H = 96;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of allNodes) {
      const w = n.width ?? FALLBACK_W;
      const h = n.height ?? FALLBACK_H;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }

    const PADDING = 60;
    const exportW = Math.round(maxX - minX + PADDING * 2);
    const exportH = Math.round(maxY - minY + PADDING * 2);

    // Translate only — no scaling. Rendering the graph at its natural 1:1 size
    // and letting html2canvas supersample is what keeps text crisp; scaling the
    // DOM first and then rasterising is what made the old export look soft.
    const offscreen = document.createElement('div');
    offscreen.style.cssText = `
      position: fixed; top: -9999px; left: -9999px;
      width: ${exportW}px; height: ${exportH}px;
      overflow: hidden;
      background: ${theme === 'dark' ? '#0f172a' : '#ffffff'};
      z-index: -1; pointer-events: none;
    `;

    const clone = viewport.cloneNode(true) as HTMLElement;
    clone.style.transform       = `translate(${PADDING - minX}px, ${PADDING - minY}px)`;
    clone.style.transformOrigin = '0 0';
    offscreen.appendChild(clone);
    document.body.appendChild(offscreen);

    // Let the clone lay out (fonts, SVG edge paths) before rasterising.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

    try {
      const { default: html2canvas } = await import('html2canvas');

      // Supersample for a sharp image, but keep the result inside the ~16k px
      // limit browsers enforce on a single canvas — beyond it toDataURL
      // returns a blank image, which would look like a silent failure.
      // See utils/exportScale: this used to clamp the scale UP to 1, which
      // defeated the cap on exactly the oversized graphs it was guarding.
      const scale = computeExportScale(exportW, exportH, window.devicePixelRatio || 1);
      setExportNote(
        willDownscale(exportW, exportH)
          ? `Graph is ${Math.round(exportW)}×${Math.round(exportH)}px — PNG scaled to ${Math.round(scale * 100)}% to fit`
          : null,
      );

      const canvas = await html2canvas(offscreen, {
        backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
        width: exportW, height: exportH, scale,
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
      setExporting(false);
    }
  }, [theme, getNodes, prTitle]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      <RunHeader
        prUrl={prUrl}
        prTitle={prTitle}
        stats={stats}
        issueCount={stats?.totalRisks ?? risks.length}
        apiCalls={(flows ?? []).filter(f => f.type === 'api_call').length}
        onBackToHistory={onBackToHistory}
      />

      {/* The PR's own actions: in-depth review, post comments, suggest fixes,
          refresh. Between the run header and the triage list — they belong to
          the PR, not to the app chrome above and not to the issue list below. */}
      {/* The anchor is a PROP, not a wrapper element: a bare <span> is
          display:inline, so it became the flex child and PRActionBar's
          `flex: 1 1 auto` / `minHeight: 0` stopped applying — the panel no
          longer filled the column or scrolled inside itself. */}
      <PRActionBar
        dataTour="action-bar"
        prUrl={prUrl}
        token={githubToken ?? ''}
        risks={risks}
        aiReviewRan={aiReviewRan}
        onRunInDepth={onRunInDepth ?? (() => {})}
        inDepthRunning={inDepthRunning}
        onReanalyze={onReanalyze ?? (() => {})}
        reanalyzing={reanalyzing}
        tokenOptional={tokenOptional}
        onNeedToken={onNeedToken}
        onDone={mode => onWriteComplete?.(mode)}
        historyRequest={historyRequest}
        panelTab={panelTab}
        onPanelTabChange={setPanelTab}
        autoMinutes={autoMinutes}
        onAutoMinutesChange={onAutoMinutesChange}
        changeNotice={changeNotice}
        onDismissNotice={onDismissNotice}
        dataVersion={dataVersion}
      />

      {/* The graph half of the column. Hidden — not unmounted — while a view
          is open: React Flow re-measures and re-runs its entrance animation on
          remount, so unmounting would make every Close flash the graph back in
          as if it had just been analyzed. */}
      <div
        data-tour="canvas"
        style={{
          display: panelTab ? 'none' : 'flex',
          flexDirection: 'column', flex: 1, minHeight: 0,
        }}
      >
      <TriagePanel
        edges={edgesState}
        risks={risks}
        riskDiff={riskDiff}
        nodes={nodesState}
        onLocateNode={onLocateNode}
        prUrl={prUrl}
        onShowHistory={() => setHistoryRequest(n => n + 1)}
      />

      <CodeFlowBar
        dataTour="export"
        onExportPNG={downloadAsPNG}
        exporting={exporting}
        exportNote={exportNote}
        onResetView={resetView}
      />

      <div
        ref={canvasContainerRef}
        style={{
          // `flex: 1 1 0` + `minHeight: 0` is load-bearing. A flex item defaults
          // to `min-height: auto`, and the old explicit `minHeight: 420` made
          // that worse: when the rows above left less than 420px the canvas
          // refused to shrink, overflowed `main` (overflow:hidden) and the
          // graph was simply cut off at the fold. The canvas pans internally,
          // so it can take whatever height is left and still be usable.
          // A floor, so the canvas is never squeezed to nothing by whatever is
          // stacked above it. The column scrolls when the total exceeds the
          // viewport, which is why this can no longer clip the way it did
          // before the panels above were capped.
          flex: '1 1 auto', minHeight: 340, position: 'relative', overflow: 'hidden',
          margin: '0 16px 16px', borderRadius: 10,
          border: '1px solid var(--bd)', background: 'var(--canvas)',
        }}
      >
        <ReactFlow
          nodes={nodesWithLocateState}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          preventScrolling={false}
          zoomOnScroll={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="var(--canvas-dot)"
            gap={24}
            size={1}
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      </div>


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