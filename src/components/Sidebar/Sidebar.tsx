// src/components/Sidebar/Sidebar.tsx
import { AnalyzePanel } from './AnalyzePanel';
import { HistoryPanel } from './HistoryPanel';
import type { AnalysisResponse, PRHistoryItem, SidebarPanel } from '../../types';

interface SidebarProps {
  open:            boolean;
  activePanel:     SidebarPanel;
  onPanelChange:   (panel: SidebarPanel) => void;
  prUrl:           string;
  onPrUrlChange:   (url: string) => void;
  githubToken:     string;                    // ← added
  onTokenChange:   (token: string) => void;   // ← added
  onAnalyze:       () => void;
  loading:         boolean;
  error:           string | null;
  result:          AnalysisResponse | null;
  history:         PRHistoryItem[];
  activeHistoryId: string | null;
  onLoadHistory:   (item: PRHistoryItem) => void;
  onRemoveHistory: (id: string) => void;
  onClearHistory:  () => void;
}

export function Sidebar({
  open, activePanel, onPanelChange,
  prUrl, onPrUrlChange, githubToken, onTokenChange,
  onAnalyze, loading, error, result,
  history, activeHistoryId, onLoadHistory, onRemoveHistory, onClearHistory,
}: SidebarProps) {
  return (
    <div style={{
      width: open ? 300 : 0,
      flexShrink: 0,
      overflow: 'hidden',
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      backgroundColor: 'var(--sidebar-bg)',
      borderRight: open ? '1px solid var(--border)' : 'none',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ width: 300, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['analyze', 'history'] as SidebarPanel[]).map(panel => (
            <button
              key={panel}
              onClick={() => onPanelChange(panel)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                backgroundColor: 'transparent',
                borderBottom: activePanel === panel ? '2px solid var(--accent)' : '2px solid transparent',
                color: activePanel === panel ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}
            >
              {panel === 'analyze'
                ? '🔍 Analyze'
                : `🕐 History${history.length > 0 ? ` (${history.length})` : ''}`}
            </button>
          ))}
        </div>

        {activePanel === 'analyze' && (
          <AnalyzePanel
            prUrl={prUrl}
            onPrUrlChange={onPrUrlChange}
            githubToken={githubToken}       // ← passed through
            onTokenChange={onTokenChange}   // ← passed through
            onAnalyze={onAnalyze}
            loading={loading}
            error={error}
            result={result}
          />
        )}

        {activePanel === 'history' && (
          <HistoryPanel
            history={history}
            activeHistoryId={activeHistoryId}
            onLoad={onLoadHistory}
            onRemove={onRemoveHistory}
            onClear={onClearHistory}
          />
        )}
      </div>
    </div>
  );
}