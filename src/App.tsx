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
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      fontSize: '14px',
      overflow: 'hidden', // ← outer shell never scrolls
    }}>

      {/* ── Header — sticky, never moves ── */}
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* ── Body row ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar — sticky, never moves ── */}
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

        {/* ── Main content — this is the ONLY thing that scrolls ── */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',   // ← only this scrolls
          overflowX: 'hidden',
        }}>

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
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              gap: 12,
              textAlign: 'center',
              padding: 24,
              minHeight: '100%',
            }}>
              <div style={{ fontSize: 52 }}>🔍</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-secondary)' }}>
                Paste a GitHub PR URL to get started
              </div>
              <div style={{ fontSize: 13 }}>
                Works with JavaScript, TypeScript, PHP &amp; Laravel (Express, NestJS, Prisma, Mongoose, TypeORM)
              </div>
              <div style={{ fontSize: 12 }}>Add your token in the sidebar for private repos</div>
            </div>
          )}

          {/* No supported files */}
          {result?.message && result.visualization?.nodes.length === 0 && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              gap: 8,
              minHeight: '100%',
            }}>
              <div style={{ fontSize: 36 }}>📭</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No supported files found</div>
              <div style={{ fontSize: 12 }}>{result.message}</div>
            </div>
          )}

          {/* Graph + panels — scrolls naturally */}
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