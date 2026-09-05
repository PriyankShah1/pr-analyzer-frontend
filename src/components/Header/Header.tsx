// src/components/Header/Header.tsx
// Global 56px header, per the Claude Design handoff.
//
// Note on Export PNG: the mock places it here, but it was moved to the
// CODE FLOW row beside the legend (design amendment A1) so the control sits
// directly above the canvas it exports rather than floating globally.
//
// The private-repo token lives HERE, in a bar that slides out under the
// header, rather than in a left rail. That rail is gone from the design
// entirely — removing it gives the graph canvas the full window width, which
// is the one thing this tool never has enough of.

import { forwardRef } from 'react';
import type { Theme } from '../../types';

export type WorkspaceView = 'workspace' | 'history';

interface BackendHealth {
  up: boolean | null;        // null = not called yet
  latencyMs: number | null;
  cached: boolean;
}

interface HeaderProps {
  prUrl: string;
  onPrUrlChange: (value: string) => void;
  onAnalyze: () => void;
  loading: boolean;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  theme: Theme;
  onToggleTheme: () => void;
  health: BackendHealth;
  githubToken: string;
  onTokenChange: (token: string) => void;
  tokenOpen: boolean;
  onToggleToken: () => void;
}

const MONO = 'var(--font-mono)';

/**
 * Live backend state. Deliberately shows nothing until a request has actually
 * happened — the mock's "backend ok · 240ms · cached" is placeholder copy, and
 * claiming a latency we never measured would be a small lie baked into the UI.
 */
function StatusChip({ health }: { health: BackendHealth }) {
  if (health.up === null) return null;

  const dotColor = health.up ? 'var(--ok)' : 'var(--sev1)';
  const parts = [
    health.up ? 'backend ok' : 'backend unreachable',
    health.latencyMs !== null ? `${health.latencyMs}ms` : null,
    health.cached ? 'cached' : null,
  ].filter(Boolean);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontFamily: MONO, fontSize: 10.5, color: 'var(--t5)',
      border: '1px solid var(--bd3)', borderRadius: 6, padding: '5px 8px',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />
      {parts.join(' · ')}
    </div>
  );
}

function ViewToggle({ view, onViewChange }: Pick<HeaderProps, 'view' | 'onViewChange'>) {
  const options: Array<{ key: WorkspaceView; label: string }> = [
    { key: 'workspace', label: 'Workspace' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div style={{
      display: 'flex', gap: 2, padding: 2,
      background: 'var(--input)', border: '1px solid var(--bd2)', borderRadius: 7,
    }}>
      {options.map(opt => {
        const active = view === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onViewChange(opt.key)}
            style={{
              padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 500,
              background: active ? 'var(--panel)' : 'transparent',
              border: `1px solid ${active ? 'var(--bd2)' : 'transparent'}`,
              color: active ? 'var(--t1)' : 'var(--t5)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const Header = forwardRef<HTMLInputElement, HeaderProps>(function Header({
  prUrl, onPrUrlChange, onAnalyze, loading,
  view, onViewChange, theme, onToggleTheme, health,
  githubToken, onTokenChange, tokenOpen, onToggleToken,
}, tokenRef) {
  const isDark = theme === 'dark';

  return (
    <>
    <header style={{
      display: 'flex', alignItems: 'center', gap: 16,
      height: 56, flex: '0 0 56px', padding: '0 18px',
      borderBottom: '1px solid var(--bd)', background: 'var(--panel)',
      position: 'sticky', top: 0, zIndex: 40,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, fontSize: 12, fontWeight: 600, color: 'var(--on-accent)',
        }}>
          P
        </div>
        <div style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>PR Analyzer</div>
        <div style={{
          fontFamily: MONO, fontSize: 10, color: 'var(--t5)',
          border: '1px solid var(--bd3)', borderRadius: 4, padding: '2px 5px',
        }}>
          v6
        </div>
      </div>

      {/* URL + Analyze */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, maxWidth: 620 }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          height: 34, padding: '0 10px',
          background: 'var(--input)', border: '1px solid var(--bd2)', borderRadius: 7,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--t9)' }}>git</span>
          <input
            value={prUrl}
            onChange={e => onPrUrlChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) onAnalyze(); }}
            placeholder="https://github.com/owner/repo/pull/1521"
            spellCheck={false}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 0,
              color: 'var(--t1)', fontFamily: MONO, fontSize: 11.5,
            }}
          />
        </div>
        <button
          onClick={onAnalyze}
          disabled={loading}
          style={{
            height: 34, padding: '0 15px', border: 0, borderRadius: 7,
            background: loading ? 'var(--bd-strong)' : 'var(--accent)',
            color: 'var(--on-accent)', fontFamily: 'var(--font-sans)',
            fontSize: 12, fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>

      </div>

      {/* Private-repo token. A filled token shows a dot so the state is
          visible without opening the bar — otherwise a pasted token is
          invisible and a user cannot tell whether it survived a reload. */}
      <button
        onClick={onToggleToken}
        title="Private repo token"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 34, padding: '0 11px', borderRadius: 7, cursor: 'pointer',
          background: tokenOpen ? 'var(--sel-bg)' : 'var(--input)',
          border: `1px solid ${tokenOpen ? 'var(--sel-bd)' : 'var(--bd2)'}`,
          color: tokenOpen ? 'var(--t1)' : 'var(--t4)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11 }}>{tokenOpen ? '✕' : '⛿'}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, whiteSpace: 'nowrap' }}>
          {tokenOpen ? 'Close' : 'Token'}
        </span>
        {!tokenOpen && githubToken.trim() && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--ok)', flex: '0 0 5px',
          }} />
        )}
      </button>

      {/* Right cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <StatusChip health={health} />
        <ViewToggle view={view} onViewChange={onViewChange} />
        <button
          onClick={onToggleTheme}
          title="Toggle theme"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 30, padding: '0 10px',
            border: '1px solid var(--bd2)', borderRadius: 6,
            background: 'var(--input)', color: 'var(--t3)',
            fontFamily: MONO, fontSize: 11, cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 12 }}>{isDark ? '◑' : '◐'}</span>
          <span>{isDark ? 'Dark' : 'Light'}</span>
        </button>
      </div>
    </header>

    {tokenOpen && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 18px', borderBottom: '1px solid var(--bd)',
        background: 'var(--sub)', flex: '0 0 auto',
      }}>
        <span style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.09em',
          color: 'var(--t6)', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          Private repo token
        </span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 31,
          padding: '0 10px', background: 'var(--input)',
          border: '1px solid var(--bd2)', borderRadius: 6, width: 300,
        }}>
          <input
            ref={tokenRef}
            type="password"
            value={githubToken}
            onChange={e => onTokenChange(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
            spellCheck={false}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 0,
              color: 'var(--t3)', fontFamily: MONO, fontSize: 11,
            }}
          />
        </div>
        <span style={{ fontSize: 11, color: 'var(--t6)', lineHeight: 1.5 }}>
          Kept for this browser tab only — cleared when you close it. Never written
          to disk, never logged, never sent anywhere except GitHub.
        </span>
      </div>
    )}
    </>
  );
});
