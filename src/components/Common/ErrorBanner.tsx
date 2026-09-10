// src/components/Common/ErrorBanner.tsx
interface ErrorBannerProps {
  error: string;
  onAddToken?: () => void;
  showTokenButton?: boolean;
}

export function ErrorBanner({ error, onAddToken, showTokenButton }: ErrorBannerProps) {
  return (
    <div style={{
      padding: '10px 20px',
      backgroundColor: 'var(--warn-bg)',
      borderBottom: '1px solid var(--sev1)',
      color: 'var(--sev1)',
      fontSize: 13,
      display: 'flex', alignItems: 'center', gap: 8,
      flexShrink: 0,
    }}>
      <span>⚠️ {error}</span>
      {showTokenButton && onAddToken && (
        <button
          onClick={onAddToken}
          style={{
            marginLeft: 'auto', padding: '3px 10px',
            backgroundColor: 'var(--sev1)', color: '#fff',
            border: 'none', borderRadius: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >
          Add token →
        </button>
      )}
    </div>
  );
}