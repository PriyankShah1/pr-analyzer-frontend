// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { Header }            from './components/Header/Header';
import { FlowVisualization } from './components/Graph/FlowVisualization';
import { DetailPanel }       from './components/Graph/DetailPanel';
import { ErrorBanner }       from './components/Common/ErrorBanner';
import { WarningBanner }     from './components/Common/WarningBanner';
import type { WorkspaceView } from './components/Header/Header';
import { HistoryBoard }      from './components/History/HistoryBoard';
import type { RefreshOutcome } from './components/History/HistoryBoard';
import { useTheme }          from './hooks/useTheme';
import { useHistory }        from './hooks/useHistory';
import { useAnalyze }        from './hooks/useAnalyze';
import type { AnalysisResponse, PRHistoryItem } from './types';
import { DEMO_PR_URL } from './constants';
import './App.css';

export default function App() {
  const { theme, toggle: toggleTheme }                               = useTheme();
  const { history, addToHistory, clearHistory, maxHistory } = useHistory();
  const { loading, error, warnings, result, riskDiff, health,
          analyze, reanalyze, adoptRun, setResult, setError, setWarnings } = useAnalyze();

  const [prUrl,           setPrUrl]           = useState('');
  // Kept for the lifetime of the BROWSER TAB, not just the React tree.
  //
  // It used to be plain useState, which meant it vanished on any remount — a
  // dev hot-reload, or anything that re-mounted App — and the user had to
  // paste the PAT again between PRs. sessionStorage is the narrowest thing
  // that fixes that: scoped to this one tab, gone the moment the tab closes,
  // never written to localStorage and never sent anywhere but GitHub.
  //
  // This RELAXES decision B2 ("held in memory only"), so the UI copy under the
  // field was corrected to match — claiming "never stored" while storing it
  // would be the one unacceptable outcome.
  const [githubToken, setGithubToken] = useState(() => {
    try { return sessionStorage.getItem('pr-analyzer-token') ?? ''; }
    catch { return ''; }   // private mode / storage blocked
  });

  useEffect(() => {
    try {
      if (githubToken) sessionStorage.setItem('pr-analyzer-token', githubToken);
      else sessionStorage.removeItem('pr-analyzer-token');
    } catch { /* storage unavailable — the token still works for this session */ }
  }, [githubToken]);
  // The left rail is gone from the design. The token now lives in a bar that
  // slides out under the header, which frees the full window width for the
  // graph canvas — the thing that was most starved for space.
  const [tokenOpen,       setTokenOpen]       = useState(false);
  // Focused when an auth error suggests the user needs to supply a token.
  const tokenInputRef = useRef<HTMLInputElement>(null);
  // Selection lives here, not in FlowVisualization, because the detail panel
  // is a SIBLING of <main> in the design — it spans the full height beside
  // the breadcrumb, triage and canvas, not just beside the canvas.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [locateRequest, setLocateRequest] = useState<{ name: string; nonce: number } | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  // Workspace = graph + panels for one PR. History = the board of past runs.
  const [view,            setView]            = useState<WorkspaceView>('workspace');
  const [reanalyzing,     setReanalyzing]     = useState(false);
  // Set while the in-depth review is being fetched for the open PR.
  const [inDepthRunning,  setInDepthRunning]  = useState(false);


  const handleAnalyze = async (urlOverride?: string, opts: { aiReview?: boolean } = {}) => {
    // Callers that also setPrUrl must pass the URL explicitly: React state
    // updates are asynchronous, so reading prUrl here would analyze whatever
    // was in the box BEFORE the click.
    const prUrlToUse = typeof urlOverride === 'string' ? urlOverride : prUrl;
    if (!prUrlToUse.trim()) { setError('Please enter a PR URL'); return; }
    if (!prUrlToUse.includes('github.com') || !prUrlToUse.includes('/pull/')) {
      setError('Invalid PR URL. Expected: https://github.com/owner/repo/pull/NUMBER');
      return;
    }
    setActiveHistoryId(null);
    setView('workspace');
    setSelectedNodeId(null);
    const data = await analyze(prUrlToUse, githubToken, opts);
    // Every analyzed PR is tracked (§5), including one that produced no graph
    // nodes. A zero-node run is a real answer — "out of detection scope" — and
    // dropping it made the board's own out-of-scope filter unreachable. Only a
    // failed request is not stored, because it analyzed nothing.
    if (data) {
      addToHistory(prUrlToUse, data);
      setActiveHistoryId(prUrlToUse);
    }
  };

  /**
   * Board Refresh: re-analyze one tracked PR at its latest commit.
   *
   * Runs outside the workspace's state on purpose — refreshing a tile must
   * not blank out a different PR the user has open. When the refreshed PR IS
   * the open one, the fresh run is adopted so the graph and the re-review
   * strip do not silently go stale.
   */
  const handleRefresh = async (item: PRHistoryItem): Promise<RefreshOutcome> => {
    const previousSha = item.pr?.headSha ?? item.result?.prHeadSha ?? null;
    try {
      const run = await reanalyze(item.url, githubToken);
      addToHistory(item.url, run.data);

      const sha = run.data.prHeadSha ?? null;
      if (item.id === activeHistoryId) {
        remapSelection(run.data);
        adoptRun(run);
        setPrUrl(item.url);
      }

      return {
        ok: true,
        // 'unknown' whenever either side is missing — reporting "same commit"
        // there would claim there was no push when we simply cannot see one.
        commit: !sha || !previousSha ? 'unknown' : sha === previousSha ? 'same' : 'new',
        sha,
        diff: run.diff,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Refresh failed',
        commit: 'unknown',
        sha: null,
        diff: null,
      };
    }
  };

  /**
   * Carry the current selection across a re-analysis.
   *
   * Node ids are POSITIONAL (visualizer.js numbers them in order), so removing
   * one shifts every id after it. Holding on to the raw id across a refresh
   * would silently point the detail panel at a different component. Labels are
   * stable, so the selection is re-found by name, and dropped when that
   * component is gone from the new graph.
   */
  const remapSelection = (next: AnalysisResponse | null | undefined) => {
    setSelectedNodeId(prev => {
      if (!prev) return null;
      const label = result?.visualization?.nodes
        ?.find((n: any) => n.id === prev)?.data?.label;
      if (!label) return null;
      const match = next?.visualization?.nodes
        ?.find((n: any) => n.data?.label === label);
      return match ? match.id : null;
    });
  };

  /**
   * Re-analyze the PR that is open in the workspace, at its latest commit, and
   * adopt the result. This is the same call the board's Refresh makes — the
   * loop is worth having where the reviewer already is, rather than only on
   * the History board, since "did my fix land?" is asked while looking at the
   * findings.
   */
  const handleReanalyzeCurrent = async () => {
    if (!prUrl.trim() || reanalyzing) return;
    setReanalyzing(true);
    try {
      const run = await reanalyze(prUrl, githubToken, result?.aiReviewRan === true);
      remapSelection(run.data);
      adoptRun(run);
      addToHistory(prUrl, run.data);
      setActiveHistoryId(prUrl);
    } catch (err: any) {
      setError(err?.message || 'Re-analysis failed');
    } finally {
      setReanalyzing(false);
    }
  };

  const loadFromHistory = (item: PRHistoryItem) => {
    setResult(item.result);
    setPrUrl(item.url);
    setError(null);
    setWarnings([]);
    setActiveHistoryId(item.id);
    setView('workspace');
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg)',
      color: 'var(--t1)',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      overflow: 'hidden', // ← outer shell never scrolls
    }}>

      {/* ── Header — sticky, never moves ── */}
      <Header
        ref={tokenInputRef}
        prUrl={prUrl}
        onPrUrlChange={setPrUrl}
        onAnalyze={handleAnalyze}
        loading={loading}
        view={view}
        onViewChange={setView}
        theme={theme}
        onToggleTheme={toggleTheme}
        health={health}
        githubToken={githubToken}
        onTokenChange={setGithubToken}
        tokenOpen={tokenOpen}
        onToggleToken={() => setTokenOpen(o => !o)}
      />

      {/* ── History view — full width, no sidebar ── */}
      {view === 'history' && (
        <HistoryBoard
          history={history}
          activeHistoryId={activeHistoryId}
          onOpen={loadFromHistory}
          onClear={clearHistory}
          onRefresh={handleRefresh}
          maxHistory={maxHistory}
        />
      )}

      {/* ── Workspace view ── */}
      <div style={{ display: view === 'workspace' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>

        {/* ── Main content — this is the ONLY thing that scrolls ── */}
        {/* The canvas fills this column and pans internally, so the column
            itself must NOT scroll — otherwise the graph gets a scrollbar it
            already handles and the viewport fights the pan gesture. */}
        <main style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          // Scrolls rather than clips. Everything above the canvas is capped,
          // so this rarely engages — but when a short window cannot fit the
          // panels AND a usable canvas, reaching the canvas by scrolling beats
          // it being cut off with no way down.
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>

          {error && (
            <ErrorBanner
              error={error}
              showTokenButton={error.includes('private repo')}
              onAddToken={() => {
                // The input only exists while the bar is open, so opening and
                // focusing in the same tick would focus nothing.
                setTokenOpen(true);
                requestAnimationFrame(() => tokenInputRef.current?.focus());
              }}
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
              color: 'var(--t6)',
              gap: 12,
              textAlign: 'center',
              padding: 24,
              // `flex: 1` already fills the column. Adding `minHeight: 100%`
              // on top of it overflows the moment a banner sits above, which
              // is the same defect that was cutting the graph in half.
              minHeight: 0,
              overflowY: 'auto',
            }}>
              <div style={{ fontSize: 52 }}>🔍</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--t3)' }}>
                Paste a GitHub PR URL to get started
              </div>
              <div style={{ fontSize: 13 }}>
                Works with JavaScript, TypeScript, PHP &amp; Laravel (Express, NestJS, Prisma, Mongoose, TypeORM)
              </div>
              <div style={{ fontSize: 12 }}>Add your token in the sidebar for private repos</div>

              {/* The built-in demo PR. Every parser, rule and model call runs
                  for real on it — only the GitHub fetch is replaced — so it
                  needs no token and burns no rate limit. */}
              <button
                onClick={() => { setPrUrl(DEMO_PR_URL); void handleAnalyze(DEMO_PR_URL); }}
                style={{
                  marginTop: 6, padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 11.5,
                  background: 'var(--info-bg)', border: '1px solid var(--info-bd)',
                  color: 'var(--info-fg)',
                }}
              >
                Try the demo PR →
              </button>
              <div style={{ fontSize: 11, color: 'var(--t7)', maxWidth: 460, lineHeight: 1.5 }}>
                Built-in fixture code with planted issues — no token, no rate limit.
                Refresh it from the board to advance a revision and see the re-review diff.
              </div>
            </div>
          )}

          {/* Out of detection scope — the mock's dashed empty state. Worded as
              a deliberate non-result: zero nodes on a framework repo is the
              analyzer declining to guess, not a failure to find anything. */}
          {result && (result.visualization?.nodes.length ?? 0) === 0 && (
            <div style={{
              flex: 1, margin: '0 16px 16px', border: '1px dashed var(--bd2)',
              borderRadius: 10, background: 'var(--canvas)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
            }}>
              <div style={{
                maxWidth: 460, display: 'flex', flexDirection: 'column',
                gap: 9, textAlign: 'center', alignItems: 'center',
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, border: '1px solid var(--bd2)',
                  background: 'var(--chip)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 15, color: 'var(--t5)',
                }}>
                  ∅
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)' }}>
                  Out of detection scope
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--t5)', lineHeight: 1.6 }}>
                  {result.message
                    || 'The analyzer parses application code only — component graphs are not inferred for framework internals, so this PR returns zero nodes by design rather than a guess.'}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t6)',
                  border: '1px solid var(--bd2)', borderRadius: 5,
                  padding: '4px 8px', marginTop: 2,
                }}>
                  accuracy over coverage
                </div>
              </div>
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
              risks={result.risks}
              riskDiff={riskDiff}
              githubToken={githubToken}
              onBackToHistory={() => setView('history')}
              // Only a commit changes the code. Re-analyzing after a comment
              // meant setResult(null), which unmounted the whole workspace —
              // the white flash — to produce an identical result.
              onWriteComplete={mode => {
                if (mode === 'commit') void handleReanalyzeCurrent();
              }}
              aiReviewRan={result.aiReviewRan}
              onRunInDepth={async () => {
                setInDepthRunning(true);
                try { await handleAnalyze(prUrl, { aiReview: true }); }
                finally { setInDepthRunning(false); }
              }}
              inDepthRunning={inDepthRunning}
              onReanalyze={handleReanalyzeCurrent}
              reanalyzing={reanalyzing}
              tokenOptional={prUrl.trim() === DEMO_PR_URL}
              onNeedToken={() => {
                setTokenOpen(true);
                requestAnimationFrame(() => tokenInputRef.current?.focus());
              }}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              locateRequest={locateRequest}
              codeLanguage={result.language}
              codeContext={result.codeContext}
              aiExplanations={result.aiExplanations}
            />
          )}
        </main>

        {result?.visualization && result.visualization.nodes.length > 0 && (
          <DetailPanel
            selectedNode={result.visualization.nodes.find((n: any) => n.id === selectedNodeId) ?? null}
            edges={result.visualization.edges}
            nodes={result.visualization.nodes}
            onLocateComponent={name => setLocateRequest({ name, nonce: Date.now() })}
            prTitle={result.prTitle}
            codeLanguage={result.language}
            flows={result.flows}
            stats={result.visualization.stats}
            codeContext={result.codeContext}
            aiExplanations={result.aiExplanations}
          />
        )}
      </div>
    </div>
  );
}