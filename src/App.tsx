import { useState } from 'react';
import axios from 'axios';
import { FlowVisualization } from './FlowVisualization';
import './App.css';

interface AnalysisResponse {
  visualization?: {
    nodes: any[];
    edges: any[];
    stats: {
      totalNodes: number;
      totalEdges: number;
      mismatches: number;
    };
  };
  flows?: any[];
  files?: any[];
  warnings?: string[];
  message?: string;
}

function App() {
  const [prUrl, setPrUrl]               = useState('');
  const [githubToken, setGithubToken]   = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [result, setResult]             = useState<AnalysisResponse | null>(null);
  const [warnings, setWarnings]         = useState<string[]>([]);
  // Add this derived value below your useState declarations
const tokenIsValid = githubToken.trim().length === 0 || 
  /^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})$/.test(githubToken.trim());

  const handleAnalyze = async () => {
    if (!prUrl.trim()) {
      setError('Please enter a PR URL');
      return;
    }

    if (!prUrl.includes('github.com') || !prUrl.includes('/pull/')) {
      setError('Invalid PR URL. Expected format: https://github.com/owner/repo/pull/NUMBER');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setWarnings([]);

    try {
      const response = await axios.post('https://pr-analyzer-backend.onrender.com/analyze', {
        url: prUrl,
        token: githubToken.trim() || undefined,
      });

      setResult(response.data);
      setWarnings(response.data.warnings || []);
    } catch (err: any) {
      let errorMessage = 'Failed to analyze PR';

      if (err.response?.status === 429) {
        errorMessage = `Too many requests. Wait ${err.response.data.retryAfter}s and try again.`;
      } else if (err.response?.status === 404) {
        errorMessage = 'PR not found. Check the URL and verify the repo is public or you have access.';
      } else if (err.response?.status === 401) {
        errorMessage = githubToken
          ? 'Authentication failed. Check your GitHub token — it may be expired or missing repo scope.'
          : 'Authentication failed. This may be a private repo — add your GitHub token below.';
      } else if (err.response?.status === 403) {
        errorMessage = 'Access forbidden. Check repository permissions or rate limits.';
      } else if (err.response?.status === 422) {
        errorMessage = err.response.data.error || 'PR is too large to analyze.';
      } else if (err.code === 'ERR_NETWORK') {
        errorMessage = 'Network error. Is the backend running on https://pr-analyzer-backend.onrender.com?';
      } else {
        errorMessage = err.response?.data?.error || err.message || errorMessage;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      <h1>🔍 PR Analyzer</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>
        Paste a GitHub PR URL to analyze its code flow and detect type mismatches.
      </p>

      {/* ── PR URL input ── */}
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 4,
            border: error ? '2px solid #ef4444' : '1px solid #ccc',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
        />
        <button
          onClick={handleAnalyze}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontWeight: 'bold',
            transition: 'background-color 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '⏳ Analyzing...' : '🔍 Analyze'}
        </button>
      </div>

      {/* ── GitHub token (private repos) ── */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowTokenInput(!showTokenInput)}
          style={{
            background: 'none',
            border: 'none',
            color: githubToken
  ? tokenIsValid ? '#16a34a' : '#d97706'  
  : '#6b7280',
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
🔑 {githubToken
  ? tokenIsValid
    ? '✅ Token set — private repos enabled'
    : '⚠️ Token format looks invalid'
  : 'Add GitHub token for private / company repos'}
        </button>

        {showTokenInput && (
          <>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
              />
              {githubToken && (
                <button
                  onClick={() => { setGithubToken(''); }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: '#374151',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
              🔒 Your token stays in memory only and is cleared when you close this tab.
              It is never stored, logged, or sent anywhere except directly to GitHub.
              Generate one at{' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#3b82f6' }}
              >
                github.com/settings/tokens
              </a>
              {' '}with <code>repo</code> scope.
            </p>
          </>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          padding: 12,
          backgroundColor: '#fee2e2',
          borderLeft: '4px solid #ef4444',
          borderRadius: 4,
          marginBottom: 16,
          color: '#991b1b',
          fontSize: 13,
        }}>
          <strong>⚠️ Error:</strong> {error}
          {/* Nudge toward token if 401 and no token set */}
          {error.includes('private repo') && !showTokenInput && (
            <button
              onClick={() => setShowTokenInput(true)}
              style={{
                marginLeft: 12,
                padding: '2px 8px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Add token →
            </button>
          )}
        </div>
      )}

      {/* ── Warning banner ── */}
      {warnings.length > 0 && (
        <div style={{
          padding: 12,
          backgroundColor: '#fefce8',
          borderLeft: '4px solid #eab308',
          borderRadius: 4,
          marginBottom: 16,
          color: '#713f12',
          fontSize: 13,
        }}>
          <strong>⚠️ Warning:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* ── No PHP files message ── */}
      {result?.message && result.visualization?.nodes.length === 0 && (
        <div style={{
          padding: 12,
          backgroundColor: '#f9fafb',
          borderLeft: '4px solid #d1d5db',
          borderRadius: 4,
          marginBottom: 16,
          color: '#374151',
          fontSize: 13,
        }}>
          ℹ️ {result.message}
        </div>
      )}

      {/* ── Results ── */}
      {result?.visualization && result.visualization.nodes.length > 0 && (
        <div>
          {/* Stats */}
          <div style={{
            marginBottom: 16,
            padding: 12,
            backgroundColor: '#f0f9ff',
            borderRadius: 4,
            border: '1px solid #bfdbfe',
          }}>
            <h3 style={{ margin: '0 0 8px 0' }}>Analysis Summary</h3>
            <p style={{ margin: 0, fontSize: 14 }}>
              Nodes: <strong>{result.visualization.stats.totalNodes}</strong> | Edges:{' '}
              <strong>{result.visualization.stats.totalEdges}</strong> | Mismatches:{' '}
              <strong style={{ color: result.visualization.stats.mismatches > 0 ? '#ef4444' : '#16a34a' }}>
                {result.visualization.stats.mismatches}
              </strong>
            </p>
          </div>

          {/* Graph */}
          <h3>Code Flow Graph</h3>
          <FlowVisualization
            nodes={result.visualization.nodes}
            edges={result.visualization.edges}
          />

          {/* Flow details */}
          {result.flows && result.flows.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3>Flow Details</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {result.flows.map((flow, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      marginBottom: 8,
                      backgroundColor: flow.mismatch ? '#fef2f2' : '#f9fafb',
                      borderLeft: `4px solid ${flow.mismatch ? '#ef4444' : '#d1d5db'}`,
                      borderRadius: 4,
                      fontSize: 13,
                    }}
                  >
                    <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>
                      {flow.from} → {flow.to}
                    </p>
                    <p style={{ margin: 0, color: '#666' }}>
                      Return type: <code>{flow.returnType || 'unknown'}</code>
                      {flow.mismatch && (
                        <span style={{ color: '#ef4444', marginLeft: 8 }}>
                          ❌ {flow.message}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;