// src/components/Graph/FlowDetails.tsx
import { useState } from 'react';
import type { AnalysisFlow } from '../../types';

interface FlowDetailsProps {
  flows: AnalysisFlow[];
}

export function FlowDetails({ flows }: FlowDetailsProps) {
  const [collapsed, setCollapsed] = useState(true); // default collapsed — gives graph more space

  if (!flows || flows.length === 0) return null;

  const issues = flows.filter(f => f.mismatch || f.brokenDependency || f.deletedSource);

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      backgroundColor: 'var(--surface)',
      flexShrink: 0,
    }}>
      {/* Collapsible header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 16px', border: 'none', cursor: 'pointer',
          backgroundColor: 'transparent', color: 'var(--text-muted)',
          fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}
      >
        <span>
          Flow Details
          {issues.length > 0 && (
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 700,
              color: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)',
              padding: '1px 6px', borderRadius: 4,
            }}>
              {issues.length} issue{issues.length > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {collapsed ? '▼ Show' : '▲ Hide'}
        </span>
      </button>

      {/* Flow list — only visible when expanded */}
      {!collapsed && (
        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
          {flows.map((flow, idx) => (
            <div key={idx} style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--border)',
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
                  <span style={{ color: '#f97316', marginLeft: 8, fontWeight: 600 }}>
                    💥 {flow.message}
                  </span>
                )}
                {flow.mismatch && !flow.brokenDependency && (
                  <span style={{ color: '#dc2626', marginLeft: 8, fontWeight: 600 }}>
                    ❌ {flow.message}
                  </span>
                )}
                {flow.deletedSource && (
                  <span style={{ color: '#6b7280', marginLeft: 8, fontWeight: 600 }}>
                    🗑️ {flow.message}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}