import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CustomNode } from './CustomNode';

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

interface VisualizationProps {
  nodes: Node[];
  edges: Edge[];
}

export function FlowVisualization({ nodes, edges }: VisualizationProps) {
  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges);

  const downloadAsPNG = () => {
    const flowEl = document.querySelector('.react-flow') as HTMLElement;
    if (!flowEl) return;

    import('html2canvas').then(({ default: html2canvas }) => {
      html2canvas(flowEl, {
        backgroundColor: '#ffffff',
        scale: 2, // retina quality
        useCORS: true,
      }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'pr-flow-graph.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      });
    });
  };




  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);

  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

return (
  <>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
      <button
        onClick={downloadAsPNG}
        style={{
          padding: '6px 12px',
          backgroundColor: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12,
          color: '#374151',
          fontWeight: 500,
        }}
      >
        📥 Export PNG
      </button>
    </div>
    <div style={{ width: '100%', height: '600px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  </>
);
}
