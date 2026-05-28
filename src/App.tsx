import { useState } from 'react';
import axios from 'axios';
import { FlowVisualization } from './components/Graph/FlowVisualization';
import { useTheme } from './hooks/useTheme';
import { useHistory } from './hooks/useHistory';
import type { PRHistoryItem } from './hooks/useHistory';
import './App.css';

const API = import.meta.env.VITE_API_URL;

interface AnalysisResponse {
  prTitle?: string;   // ← add
  prNumber?: number;   // ← add
  prAuthor?: string;   // ← add
  prState?: string;   // ← add
  visualization?: {
    nodes: any[];
    edges: any[];
    stats: { totalNodes: number; totalEdges: number; mismatches: number; };
  };
  flows?: any[];
  files?: any[];
  warnings?: string[];
  message?: string;
  fromCache?: boolean;
}

const THEME_VARS = {
  light: {
    '--bg': '#f8fafc',
    '--sidebar-bg': '#ffffff',
    '--surface': '#ffffff',
    '--border': '#e2e8f0',
    '--text': '#0f172a',
    '--text-secondary': '#64748b',
    '--text-muted': '#94a3b8',
    '--btn-bg': '#f1f5f9',
    '--input-bg': '#ffffff',
    '--node-bg': '#ffffff',
    '--node-text': '#0f172a',
    '--accent': '#2563eb',
    '--mismatch': '#dc2626',
    '--success': '#16a34a',
    '--warning-bg': '#fefce8',
    '--warning-border': '#eab308',
    '--warning-text': '#713f12',
    '--error-bg': '#fef2f2',
    '--error-border': '#dc2626',
    '--error-text': '#991b1b',
    '--history-hover': '#f1f5f9',
    '--history-active': '#eff6ff',
    '--icon-bar': '#f1f5f9',
  },
  dark: {
    '--bg': '#0f172a',
    '--sidebar-bg': '#1e293b',
    '--surface': '#1e293b',
    '--border': '#334155',
    '--text': '#f1f5f9',
    '--text-secondary': '#94a3b8',
    '--text-muted': '#475569',
    '--btn-bg': '#334155',
    '--input-bg': '#0f172a',
    '--node-bg': '#1e293b',
    '--node-text': '#f1f5f9',
    '--accent': '#3b82f6',
    '--mismatch': '#ef4444',
    '--success': '#22c55e',
    '--warning-bg': '#422006',
    '--warning-border': '#d97706',
    '--warning-text': '#fde68a',
    '--error-bg': '#450a0a',
    '--error-border': '#ef4444',
    '--error-text': '#fca5a5',
    '--history-hover': '#0f172a',
    '--history-active': '#172554',
    '--icon-bar': '#0f172a',
  },
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

// ── Hamburger icon ────────────────────────────────────────────────────────
function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <div style={{ width: 18, height: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
      <span style={{
        display: 'block', height: 2, borderRadius: 2,
        backgroundColor: 'currentColor',
        transform: open ? 'translateY(6px) rotate(45deg)' : 'none',
        transition: 'transform 0.2s',
      }} />
      <span style={{
        display: 'block', height: 2, borderRadius: 2,
        backgroundColor: 'currentColor',
        opacity: open ? 0 : 1,
        transition: 'opacity 0.2s',
      }} />
      <span style={{
        display: 'block', height: 2, borderRadius: 2,
        backgroundColor: 'currentColor',
        transform: open ? 'translateY(-6px) rotate(-45deg)' : 'none',
        transition: 'transform 0.2s',
      }} />
    </div>
  );
}

type SidebarPanel = 'analyze' | 'history';

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { history, addToHistory, removeFromHistory, clearHistory } = useHistory();

  const [prUrl, setPrUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<SidebarPanel>('analyze');

  const tokenIsValid = githubToken.trim().length === 0 ||
    /^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})$/.test(githubToken.trim());

  const handleAnalyze = async (urlOverride?: string) => {
    const url = urlOverride || prUrl;
    if (!url.trim()) { setError('Please enter a PR URL'); return; }
    if (!url.includes('github.com') || !url.includes('/pull/')) {
      setError('Invalid PR URL. Expected: https://github.com/owner/repo/pull/NUMBER');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setWarnings([]);
    setActiveHistoryId(null);

    try {
      const response = await axios.post(`${API}/analyze`, {
        url,
        token: githubToken.trim() || undefined,
      });
      setResult(response.data);
      setWarnings(response.data.warnings || []);
      if (response.data.visualization?.nodes?.length > 0) {
        addToHistory(url, response.data);
      }
    } catch (err: any) {
      let msg = 'Failed to analyze PR';
      if (err.response?.status === 429) msg = `Too many requests. Wait ${err.response.data.retryAfter}s.`;
      else if (err.response?.status === 404) msg = 'PR not found. Check the URL and verify repo access.';
      else if (err.response?.status === 401) msg = githubToken ? 'Token rejected — may be expired or missing repo scope.' : 'Auth failed. This may be a private repo — add your token.';
      else if (err.response?.status === 403) msg = 'Access forbidden. Check repo permissions or rate limits.';
      else if (err.response?.status === 422) msg = err.response.data.error || 'PR is too large to analyze.';
      else if (err.code === 'ERR_NETWORK') msg = 'Cannot reach backend. Please try again in a moment.';
      else msg = err.response?.data?.error || err.message || msg;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: PRHistoryItem) => {
    setResult(item.result);
    setPrUrl(item.url);
    setError(null);
    setWarnings([]);
    setActiveHistoryId(item.id);
  };

  const vars = THEME_VARS[theme];

  return (
    <div style={{
      ...vars as any,
      display: 'flex', flexDirection: 'column', height: '100vh',
      backgroundColor: 'var(--bg)', color: 'var(--text)',
      fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '14px',
    }}>

      {/* ── Top nav ── */}
      <header style={{
        height: 48, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px',
        backgroundColor: 'var(--sidebar-bg)',
        borderBottom: '1px solid var(--border)', flexShrink: 0, zIndex: 10,
      }}>

        {/* ✅ Hamburger button */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          style={{
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6, cursor: 'pointer',
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          <HamburgerIcon open={sidebarOpen} />
        </button>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>PR Analyzer</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, backgroundColor: 'var(--accent)', color: '#fff' }}>v2</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        <button onClick={toggleTheme} style={{
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: 12,
        }}>
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar (slides in/out smoothly) ── */}
        <div style={{
          width: sidebarOpen ? 300 : 0,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
          backgroundColor: 'var(--sidebar-bg)',
          borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Inner — fixed 300px so content doesn't squish during animation */}
          <div style={{ width: 300, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Tab switcher */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {(['analyze', 'history'] as SidebarPanel[]).map(panel => (
                <button
                  key={panel}
                  onClick={() => setActivePanel(panel)}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                    backgroundColor: 'transparent',
                    borderBottom: activePanel === panel ? `2px solid var(--accent)` : '2px solid transparent',
                    color: activePanel === panel ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}
                >
                  {panel === 'analyze' ? '🔍 Analyze' : `🕐 History${history.length > 0 ? ` (${history.length})` : ''}`}
                </button>
              ))}
            </div>

            {/* ── Analyze panel ── */}
            {activePanel === 'analyze' && (
              <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
                <input
                  type="text"
                  placeholder="github.com/owner/repo/pull/123"
                  value={prUrl}
                  onChange={e => setPrUrl(e.target.value)}
                  disabled={loading}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 7,
                    border: `1px solid ${error ? 'var(--error-border)' : 'var(--border)'}`,
                    backgroundColor: 'var(--input-bg)', color: 'var(--text)',
                    fontSize: 12, fontFamily: 'monospace',
                    boxSizing: 'border-box', outline: 'none', marginBottom: 8,
                  }}
                />
                <button
                  onClick={() => handleAnalyze()}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '9px 0',
                    backgroundColor: loading ? 'var(--btn-bg)' : 'var(--accent)',
                    color: loading ? 'var(--text-muted)' : '#fff',
                    border: 'none', borderRadius: 7,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: 600, fontSize: 13, marginBottom: 12,
                  }}
                >
                  {loading ? '⏳ Analyzing...' : '🔍 Analyze PR'}
                </button>

                {/* Token */}
                <button
                  onClick={() => setShowToken(!showToken)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11,
                    color: githubToken ? (tokenIsValid ? 'var(--success)' : '#d97706') : 'var(--text-muted)',
                    textDecoration: 'underline',
                  }}
                >
                  🔑 {githubToken ? (tokenIsValid ? '✅ Token set — private repos enabled' : '⚠️ Invalid token format') : 'Add token for private repos'}
                </button>

                {showToken && (
                  <>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <input
                        type="password"
                        placeholder="ghp_..."
                        value={githubToken}
                        onChange={e => setGithubToken(e.target.value)}
                        style={{
                          flex: 1, padding: '5px 8px', borderRadius: 6,
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--input-bg)', color: 'var(--text)',
                          fontSize: 11, fontFamily: 'monospace',
                        }}
                      />
                      {githubToken && (
                        <button onClick={() => setGithubToken('')} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', backgroundColor: 'var(--btn-bg)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11 }}>✕</button>
                      )}
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      Token stays in memory only — cleared on tab close. Never stored or logged.
                    </p>
                  </>
                )}

                {/* Results summary */}
                {result?.visualization && result.visualization.nodes.length > 0 && (
                  <div style={{ marginTop: 16, padding: 12, backgroundColor: 'var(--btn-bg)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                      Analysis Results
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>
                      📊 {result.visualization.stats.totalNodes} nodes · {result.visualization.stats.totalEdges} edges
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: result.visualization.stats.mismatches > 0 ? 'var(--mismatch)' : 'var(--success)' }}>
                      {result.visualization.stats.mismatches > 0
                        ? `⚠️ ${result.visualization.stats.mismatches} type mismatch${result.visualization.stats.mismatches > 1 ? 'es' : ''} found`
                        : '✅ No type mismatches'}
                    </div>
                    {result.fromCache && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>⚡ Cached result</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── History panel ── */}
            {activePanel === 'history' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{history.length} saved</span>
                  {history.length > 0 && (
                    <button onClick={clearHistory} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)', padding: 0 }}>Clear all</button>
                  )}
                </div>

                {history.length === 0 && (
                  <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    No history yet.<br />Analyze a PR to get started.
                  </div>
                )}

                {history.map(item => (
                  <div
                    key={item.id}
                    onClick={() => loadFromHistory(item)}
                    style={{
                      padding: '10px 16px', cursor: 'pointer',
                      backgroundColor: activeHistoryId === item.id ? 'var(--history-active)' : 'transparent',
                      borderLeft: activeHistoryId === item.id ? '3px solid var(--accent)' : '3px solid transparent',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (activeHistoryId !== item.id) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--history-hover)'; }}
                    onMouseLeave={e => { if (activeHistoryId !== item.id) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 3, paddingRight: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>{item.stats.totalNodes} nodes · {item.stats.totalEdges} edges</span>
                      {item.stats.mismatches > 0 && <span style={{ color: 'var(--mismatch)', fontWeight: 600 }}>⚠️ {item.stats.mismatches}</span>}
                      <span>· {formatTime(item.analyzedAt)}</span>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        removeFromHistory(item.id);
                        if (activeHistoryId === item.id) { setResult(null); setActiveHistoryId(null); }
                      }}
                      style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Main content ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Error */}
          {error && (
            <div style={{ padding: '10px 20px', backgroundColor: 'var(--error-bg)', borderBottom: `1px solid var(--error-border)`, color: 'var(--error-text)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span>⚠️ {error}</span>
              {error.includes('private repo') && !showToken && (
                <button onClick={() => { setShowToken(true); setActivePanel('analyze'); setSidebarOpen(true); }} style={{ marginLeft: 'auto', padding: '3px 10px', backgroundColor: 'var(--mismatch)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  Add token →
                </button>
              )}
            </div>
          )}

          {/* Warning */}
          {warnings.length > 0 && (
            <div style={{ padding: '10px 20px', backgroundColor: 'var(--warning-bg)', borderBottom: `1px solid var(--warning-border)`, color: 'var(--warning-text)', fontSize: 13, flexShrink: 0 }}>
              ⚠️ {warnings.join(' · ')}
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && !error && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 12, textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 52 }}>🔍</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-secondary)' }}>Paste a GitHub PR URL to get started</div>
              <div style={{ fontSize: 13 }}>Works with JavaScript, TypeScript, PHP & Laravel (Prisma, Mongoose, TypeORM)</div>
              <div style={{ fontSize: 12 }}>Add your token in the sidebar for private repos</div>
            </div>
          )}

          {/* No PHP files */}
          {result?.message && result.visualization?.nodes.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8 }}>
              <div style={{ fontSize: 36 }}>📭</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No supported files found</div>
              <div style={{ fontSize: 12 }}>{result.message}</div>
            </div>
          )}

          {/* Graph */}
          {result?.visualization && result.visualization.nodes.length > 0 && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <FlowVisualization
                nodes={result.visualization.nodes}
                edges={result.visualization.edges}
                theme={theme}
                flows={result.flows}
                prTitle={result.prTitle}   // ← was getPRTitle(prUrl), now real title from API
                prUrl={prUrl}
                stats={result.visualization.stats}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}