// src/components/Common/WarningBanner.tsx
interface WarningBannerProps {
  warnings: string[];
}

export function WarningBanner({ warnings }: WarningBannerProps) {
  if (warnings.length === 0) return null;
  return (
    // Compact on purpose: this sits above the canvas, and every row of chrome
    // here is a row the graph does not get. Long text is clamped to two lines
    // with the full text on hover rather than pushing the canvas down.
    <div
      title={warnings.join(' · ')}
      style={{
        padding: '6px 16px',
        backgroundColor: 'var(--warn-bg)',
        borderBottom: '1px solid var(--warn-bd)',
        color: 'var(--warn-t)',
        fontSize: 11.5, lineHeight: 1.45, flexShrink: 0,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      ⚠ {warnings.join(' · ')}
    </div>
  );
}