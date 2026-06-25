// src/components/Graph/FlowDetails.tsx
import { useState } from 'react';
import type { AnalysisFlow } from '../../types';

interface FlowDetailsProps {
  flows: AnalysisFlow[];
}

export function FlowDetails({ flows }: FlowDetailsProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!flows || flows.length === 0) return null;

  const issues = flows.filter(f => f.mismatch || f.brokenDependency || f.deletedSource);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Panel header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', border: 'none', cursor: 'pointer',
          backgroundColor: 'var(--btn-bg)',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text-muted)', fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}
      >
        <span>
          Flow Details
          {issues.length > 0 && (
            <span style={{
              marginLeft: 6, fontSize: 9, fontWeight: 700,
              color: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)',
              padding: '1px 5px', borderRadius: 4,
            }}>
              {issues.length} issue{issues.length > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span>{collapsed ? '▼' : '▲'}</span>
      </button>

      {/* Flow list — no scroll cap, grows with content, page scrolls */}
      {!collapsed && (
        <div>
          {flows.map((flow, idx) => (
            <div key={idx} style={{
              padding: '6px 12px',
              borderBottom: '1px solid var(--border)',
              borderLeft: `2px solid ${
                flow.brokenDependency ? '#f97316' :
                flow.mismatch        ? '#dc2626' :
                flow.deletedSource   ? '#6b7280' : 'transparent'
              }`,
              backgroundColor:
                flow.brokenDependency ? 'rgba(249,115,22,0.04)' :
                flow.mismatch        ? 'rgba(220,38,38,0.04)'  : 'transparent',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                {flow.from} → {flow.to}
              </div>
              <div style={{
                fontSize: 10, color: 'var(--text-secondary)',
                display: 'flex', gap: 6, flexWrap: 'wrap',
              }}>
                <code style={{ backgroundColor: 'var(--btn-bg)', padding: '0 3px', borderRadius: 3 }}>
                  {flow.returnType || 'unknown'}
                </code>
                {flow.brokenDependency && (
                  <span style={{ color: '#f97316', fontWeight: 600 }}>💥 {flow.message}</span>
                )}
                {flow.mismatch && !flow.brokenDependency && (
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>❌ {flow.message}</span>
                )}
                {flow.deletedSource && (
                  <span style={{ color: '#6b7280', fontWeight: 600 }}>🗑️ {flow.message}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}