// src/components/Sidebar/HistoryPanel.tsx
import type { PRHistoryItem } from '../../types';

interface HistoryPanelProps {
  history: PRHistoryItem[];
  activeHistoryId: string | null;
  onLoad: (item: PRHistoryItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  return `${days}d ago`;
}

export function HistoryPanel({
  history, activeHistoryId, onLoad, onRemove, onClear,
}: HistoryPanelProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{
        padding: '8px 16px 4px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{history.length} saved</span>
        {history.length > 0 && (
          <button
            onClick={onClear}
            style={{
              background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 10,
              color: 'var(--text-muted)', padding: 0,
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {history.length === 0 && (
        <div style={{
          padding: '40px 16px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 12,
        }}>
          No history yet.<br />Analyze a PR to get started.
        </div>
      )}

      {history.map(item => (
        <div
          key={item.id}
          onClick={() => onLoad(item)}
          style={{
            padding: '10px 16px', cursor: 'pointer',
            backgroundColor: activeHistoryId === item.id ? 'var(--history-active)' : 'transparent',
            borderLeft: activeHistoryId === item.id ? '3px solid var(--accent)' : '3px solid transparent',
            position: 'relative',
          }}
          onMouseEnter={e => {
            if (activeHistoryId !== item.id)
              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--history-hover)';
          }}
          onMouseLeave={e => {
            if (activeHistoryId !== item.id)
              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
          }}
        >
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text)',
            marginBottom: 3, paddingRight: 20,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.label}
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            fontSize: 10, color: 'var(--text-muted)',
          }}>
            <span>{item.stats.totalNodes} nodes · {item.stats.totalEdges} edges</span>
            {item.stats.mismatches > 0 && (
              <span style={{ color: 'var(--mismatch)', fontWeight: 600 }}>
                ⚠️ {item.stats.mismatches}
              </span>
            )}
            <span>· {formatTime(item.analyzedAt)}</span>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onRemove(item.id); }}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: 12, padding: 0,
            }}
          >✕</button>
        </div>
      ))}
    </div>
  );
}