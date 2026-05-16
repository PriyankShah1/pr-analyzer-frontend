// src/components/Sidebar/AnalyzePanel.tsx
import { useState } from 'react';
import type { AnalysisResponse } from '../../types';

interface AnalyzePanelProps {
  prUrl:          string;
  onPrUrlChange:  (url: string) => void;
  onAnalyze:      () => void;
  loading:        boolean;
  error:          string | null;
  result:         AnalysisResponse | null;
  githubToken:    string;                    // ← lifted to App.tsx
  onTokenChange:  (token: string) => void;   // ← lifted to App.tsx
}

export function AnalyzePanel({
  prUrl, onPrUrlChange, onAnalyze, loading, error, result,
  githubToken, onTokenChange,
}: AnalyzePanelProps) {
  const [showToken, setShowToken] = useState(false);

  const tokenIsValid = githubToken.trim().length === 0 ||
    /^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})$/.test(githubToken.trim());

  return (
    <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
      <input
        type="text"
        placeholder="github.com/owner/repo/pull/123"
        value={prUrl}
        onChange={e => onPrUrlChange(e.target.value)}
        disabled={loading}
        onKeyDown={e => e.key === 'Enter' && onAnalyze()}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 7,
          border: `1px solid ${error ? 'var(--error-border)' : 'var(--border)'}`,
          backgroundColor: 'var(--input-bg)', color: 'var(--text)',
          fontSize: 12, fontFamily: 'monospace',
          boxSizing: 'border-box', outline: 'none', marginBottom: 8,
        }}
      />

      <button
        onClick={onAnalyze}
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

      {/* Token input */}
      <button
        onClick={() => setShowToken(!showToken)}
        style={{
          background: 'none', border: 'none', padding: 0,
          cursor: 'pointer', fontSize: 11,
          color: githubToken
            ? (tokenIsValid ? 'var(--success)' : '#d97706')
            : 'var(--text-muted)',
          textDecoration: 'underline',
        }}
      >
        🔑 {githubToken
          ? (tokenIsValid ? '✅ Token set — private repos enabled' : '⚠️ Invalid token format')
          : 'Add token for private repos'}
      </button>

      {showToken && (
        <>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <input
              type="password"
              placeholder="ghp_..."
              value={githubToken}
              onChange={e => onTokenChange(e.target.value)}  // ← uses prop
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 6,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--input-bg)', color: 'var(--text)',
                fontSize: 11, fontFamily: 'monospace',
              }}
            />
            {githubToken && (
              <button
                onClick={() => onTokenChange('')}  // ← uses prop
                style={{
                  padding: '5px 8px', borderRadius: 6,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--btn-bg)',
                  cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11,
                }}
              >✕</button>
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
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8,
          }}>
            Analysis Results
          </div>
          <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>
            📊 {result.visualization.stats.totalNodes} nodes · {result.visualization.stats.totalEdges} edges
          </div>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: result.visualization.stats.mismatches > 0 ? 'var(--mismatch)' : 'var(--success)',
          }}>
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
  );
}