// src/App.tsx
import { useState } from 'react';
import { Header }            from './components/Header/Header';
import { Sidebar }           from './components/Sidebar/Sidebar';
import { FlowVisualization } from './components/Graph/FlowVisualization';
import { ErrorBanner }       from './components/Common/ErrorBanner';
import { WarningBanner }     from './components/Common/WarningBanner';
import { useTheme }          from './hooks/useTheme';
import { useHistory }        from './hooks/useHistory';
import { useAnalyze }        from './hooks/useAnalyze';
import { THEME_VARS }        from './constants/theme';
import type { PRHistoryItem, SidebarPanel } from './types';
import './App.css';

export default function App() {
  const { theme, toggle: toggleTheme }                               = useTheme();
  const { history, addToHistory, removeFromHistory, clearHistory }   = useHistory();
  const { loading, error, warnings, result, analyze, setResult, setError, setWarnings } = useAnalyze();

  const [prUrl,           setPrUrl]           = useState('');
  const [githubToken,     setGithubToken]     = useState('');
  const [sidebarOpen,     setSidebarOpen]     = useState(true);
  const [activePanel,     setActivePanel]     = useState<SidebarPanel>('analyze');
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const vars = THEME_VARS[theme];

  const handleAnalyze = async () => {
    if (!prUrl.trim()) { setError('Please enter a PR URL'); return; }
    if (!prUrl.includes('github.com') || !prUrl.includes('/pull/')) {
      setError('Invalid PR URL. Expected: https://github.com/owner/repo/pull/NUMBER');
      return;
    }
    setActiveHistoryId(null);
    const data = await analyze(prUrl, githubToken);
    if ((data?.visualization?.nodes?.length ?? 0) > 0) {
      addToHistory(prUrl, data);
    }
  };

  const loadFromHistory = (item: PRHistoryItem) => {
    setResult(item.result);
    setPrUrl(item.url);
    setError(null);
    setWarnings([]);
    setActiveHistoryId(item.id);
  };

  const handleRemoveHistory = (id: string) => {
    removeFromHistory(id);
    if (activeHistoryId === id) {
      setResult(null);
      setActiveHistoryId(null);
    }
  };

  return (
    <div style={{
      ...vars as any,
      minHeight: '100vh',               // ← was height: 100vh — now page can grow
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      fontSize: '14px',
    }}>

      {/* Header — stays at top, not sticky (scrolls with page) */}
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div style={{ display: 'flex', flex: 1 }}>  {/* ← removed overflow: hidden */}

        {/* Sidebar — scrolls with page */}
        <Sidebar
          open={sidebarOpen}
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          prUrl={prUrl}
          onPrUrlChange={setPrUrl}
          githubToken={githubToken}
          onTokenChange={setGithubToken}
          onAnalyze={handleAnalyze}
          loading={loading}
          error={error}
          result={result}
          history={history}
          activeHistoryId={activeHistoryId}
          onLoadHistory={loadFromHistory}
          onRemoveHistory={handleRemoveHistory}
          onClearHistory={clearHistory}
        />

        {/* Main content — no overflow hidden, scrolls naturally */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {error && (
            <ErrorBanner
              error={error}
              showTokenButton={error.includes('private repo')}
              onAddToken={() => { setSidebarOpen(true); setActivePanel('analyze'); }}
            />
          )}

          <WarningBanner warnings={warnings} />

          {/* Empty state */}
          {!result && !loading && !error && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', gap: 12,
              textAlign: 'center', padding: 24,
              minHeight: 'calc(100vh - 48px)',
            }}>
              <div style={{ fontSize: 52 }}>🔍</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-secondary)' }}>
                Paste a GitHub PR URL to get started
              </div>
              <div style={{ fontSize: 13 }}>
                Works with JavaScript, TypeScript, PHP &amp; Laravel (Prisma, Mongoose, TypeORM, NestJS)
              </div>
              <div style={{ fontSize: 12 }}>Add your token in the sidebar for private repos</div>
            </div>
          )}

          {/* No supported files found */}
          {result?.message && result.visualization?.nodes.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', gap: 8,
              minHeight: 'calc(100vh - 48px)',
            }}>
              <div style={{ fontSize: 36 }}>📭</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No supported files found</div>
              <div style={{ fontSize: 12 }}>{result.message}</div>
            </div>
          )}

          {/* Graph — full width, scrolls naturally with page */}
          {result?.visualization && result.visualization.nodes.length > 0 && (
            <FlowVisualization
              nodes={result.visualization.nodes}
              edges={result.visualization.edges}
              theme={theme}
              flows={result.flows}
              prTitle={result.prTitle}
              prUrl={prUrl}
              stats={result.visualization.stats}
              codeLanguage={result.language}
              codeContext={result.codeContext}
              aiExplanations={result.aiExplanations}
            />
          )}
        </main>
      </div>
    </div>
  );
}