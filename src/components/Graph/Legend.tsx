// src/components/Graph/Legend.tsx
import { LEGEND } from '../../constants/legend';

export function Legend() {
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