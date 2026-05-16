// src/components/Common/Pill.tsx
export function Pill({ color, label }: { color: string; label: string }) {
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