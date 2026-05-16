// src/components/Common/WarningBanner.tsx
interface WarningBannerProps {
  warnings: string[];
}

export function WarningBanner({ warnings }: WarningBannerProps) {
  if (warnings.length === 0) return null;
  return (
    <div style={{
      padding: '10px 20px',
      backgroundColor: 'var(--warning-bg)',
      borderBottom: '1px solid var(--warning-border)',
      color: 'var(--warning-text)',
      fontSize: 13, flexShrink: 0,
    }}>
      ⚠️ {warnings.join(' · ')}
    </div>
  );
}