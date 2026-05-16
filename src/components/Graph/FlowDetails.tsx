// src/components/Graph/FlowDetails.tsx
import type { AnalysisFlow } from '../../types';

interface FlowDetailsProps {
  flows: AnalysisFlow[];
}

export function FlowDetails({ flows }: FlowDetailsProps) {
  if (!flows || flows.length === 0) return null;

  return (
    <div style={{
      maxHeight: '200px', overflowY: 'auto',
      borderTop: '1px solid var(--border)',
      flexShrink: 0, backgroundColor: 'var(--surface)',
    }}>
      <div style={{
        padding: '8px 16px 4px', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--text-muted)',
      }}>
        Flow Details
      </div>

      {flows.map((flow, idx) => (
        <div key={idx} style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
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
  );
}