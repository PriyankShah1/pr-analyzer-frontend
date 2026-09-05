// src/components/Graph/TriagePanel.tsx
// One ranked list of everything wrong with this PR, per the Claude Design
// handoff, with the v6 finding sources folded in (decision: no new visual
// language — the panel was already "issues ranked by severity").
//
// Two sources feed it and they are shaped differently:
//
//   GRAPH ISSUES come from edge data (broken dependency, prop mismatch,
//   missing dep, type mismatch). They know a node id, so they can offer
//   LOCATE → to pan the canvas.
//
//   FINDINGS come from `result.risks` (SQL rules + the in-depth review). They
//   know a file and line, not a node. LOCATE is only offered when the file
//   actually resolves to a node on the graph — otherwise the row shows
//   `file:line`, because a Locate button that jumps somewhere arbitrary is
//   worse than no button.

import { useState } from 'react';
import type { Edge } from 'reactflow';
import type { Finding, RiskDiff } from '../../types/risk';

const MONO = 'var(--font-mono)';

const SEV_COLOR: Record<number, string> = {
  1: 'var(--sev1)',
  2: 'var(--sev2)',
  3: 'var(--sev3)',
  4: 'var(--sev4)',
};

interface TriageItem {
  severity: 1 | 2 | 3 | 4;
  kind: string;
  title: string;
  detail: string;
  confidence: string;
  nodeId?: string;      // present only when the row can be located on the graph
  location?: string;    // `file:line`, shown when nodeId is absent
}

/**
 * Graph-derived issues. These carry a node id, so they can be located.
 *
 * `nameOf` matters more than it looks: edge.source/edge.target are node IDs
 * ("3", "5"), not labels. Interpolating them straight into a sentence
 * produced rows like "5 does not accept a prop 3 passes" — unreadable, and
 * it made the triage list look broken next to the findings rows.
 */
function itemsFromEdges(edges: Edge[], nameOf: (id: string) => string): TriageItem[] {
  const items: TriageItem[] = [];

  for (const edge of edges) {
    const d: any = edge.data;
    if (!d) continue;
    const targetId = String(edge.target);
    const sourceId = String(edge.source);
    const target = nameOf(targetId);
    const source = nameOf(sourceId);

    if (d.brokenDependency) {
      items.push({
        severity: 1, kind: 'BROKEN DEPENDENCY',
        title: `${source} references ${target}, deleted in this PR`,
        detail: d.message || 'The target was removed in this PR. This will fail at build or run time.',
        confidence: 'certain', nodeId: targetId,
      });
    }

    if (d.typeMismatches?.length > 0) {
      items.push({
        severity: 2, kind: 'TYPE MISMATCH',
        title: d.typeMismatches.map((t: any) => `${t.propName}=${t.rawValue} where ${t.propName}: ${t.declaredType}`).join(', '),
        detail: d.message || 'A literal prop value does not match the declared type.',
        confidence: 'certain', nodeId: targetId,
      });
    } else if (d.propCheckStatus === 'checked_broken') {
      items.push({
        severity: 2, kind: 'PROP MISMATCH',
        title: `${target} does not accept a prop ${source} passes`,
        detail: d.message || '',
        confidence: 'certain', nodeId: targetId,
      });
    }

    if (d.missingDeps?.length > 0) {
      items.push({
        severity: 3, kind: 'MISSING DEP',
        title: `${source}'s hook is missing ${d.missingDeps.join(', ')}`,
        detail: 'The hook body reads these values but they are absent from its dependency array, so it will run against stale values.',
        confidence: 'high', nodeId: targetId,
      });
    }

    if (d.mismatch) {
      items.push({
        severity: 4, kind: 'TYPE MISMATCH',
        title: `${source} → ${target} return type mismatch`,
        detail: d.message || '',
        confidence: 'heuristic', nodeId: targetId,
      });
    }
  }

  return items;
}

/**
 * SQL + AI findings. `severityRank` is already 1–4 on the wire, and
 * `confidence` distinguishes a deterministic rule match (1) from a model
 * inference — worth surfacing, since a reviewer weighs those differently.
 */
function itemsFromFindings(findings: Finding[], nodeIdByFile: Map<string, string>): TriageItem[] {
  return findings.map(f => ({
    severity: (f.severityRank || 4) as 1 | 2 | 3 | 4,
    kind: f.kind.replace(/_/g, ' ').toUpperCase(),
    title: f.title,
    detail: f.suggestion ? `${f.detail} Fix: ${f.suggestion}` : f.detail,
    confidence: f.source === 'sql' ? 'certain' : `${Math.round((f.confidence ?? 0) * 100)}%`,
    nodeId: nodeIdByFile.get(f.file),
    location: f.line ? `${f.file}:${f.line}` : f.file,
  }));
}

/** Compact "what changed since last review" strip. */
function ReReviewStrip({ diff, onShowHistory }: { diff: RiskDiff; onShowHistory: () => void }) {
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '8px 13px', borderTop: '1px solid var(--line)',
    fontFamily: MONO, fontSize: 10.5,
  };

  // Saying "this is the baseline" beats rendering nothing. Before, a first
  // review showed no strip at all, so the whole resolve/regress feature was
  // invisible until you happened to analyze the same PR twice.
  if (diff.isFirstReview) {
    return (
      <div style={rowStyle}>
        <span style={{ color: 'var(--t6)', letterSpacing: '0.06em' }}>BASELINE</span>
        <span style={{ color: 'var(--t5)' }}>
          First review of this PR — hit Refresh after a push to see what got fixed.
        </span>
      </div>
    );
  }

  const cells = [
    { n: diff.counts.resolved,   label: 'fixed',      color: 'var(--ok)' },
    { n: diff.counts.persisting, label: 'still open', color: 'var(--t4)' },
    { n: diff.counts.introduced, label: 'new',        color: 'var(--sev2)' },
    { n: diff.counts.regressed,  label: 'regressed',  color: 'var(--sev1)' },
  ].filter(c => c.n > 0);

  return (
    <div style={rowStyle}>
      <span style={{ color: 'var(--t6)', letterSpacing: '0.06em' }}>
        SINCE {diff.previousSha ? diff.previousSha.slice(0, 7) : 'LAST REVIEW'}
      </span>
      {cells.length === 0
        ? <span style={{ color: 'var(--t5)' }}>No change since the last review.</span>
        : cells.map(c => (
            <span key={c.label} style={{ color: c.color }}>
              {c.n} {c.label}
            </span>
          ))}
      {/* A count is not trackable on its own. This is the way through to WHICH
          findings moved, which is the question the numbers provoke. */}
      <button
        onClick={onShowHistory}
        style={{
          fontFamily: MONO, fontSize: 10, color: 'var(--info-fg)',
          background: 'transparent', border: 0, padding: 0,
          cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        which ones? →
      </button>
    </div>
  );
}

interface TriagePanelProps {
  edges: Edge[];
  risks?: Finding[];
  riskDiff?: RiskDiff | null;
  nodes?: Array<{ id: string; data?: any }>;
  onLocateNode: (nodeId: string) => void;
  prUrl?: string;
  githubToken?: string;
  onWriteComplete?: () => void;
  /** Opens the Review history panel in the PR action bar. */
  onShowHistory?: () => void;
}

export function TriagePanel({
  edges, risks = [], riskDiff, nodes = [], onLocateNode,
  prUrl, githubToken = '', onWriteComplete, onShowHistory,
}: TriagePanelProps) {
  const [open, setOpen] = useState(true);

  // Findings know a file; the graph knows node labels. Match them so a SQL or
  // AI finding in a file that IS on the graph can still offer Locate.
  const nodeIdByFile = new Map<string, string>();
  for (const n of nodes) {
    const file = n.data?.file;
    if (typeof file === 'string') nodeIdByFile.set(file, n.id);
  }

  const nameById = new Map<string, string>();
  for (const n of nodes) nameById.set(String(n.id), String(n.data?.label ?? n.id));
  const nameOf = (id: string) => nameById.get(id) ?? id;

  const items = [...itemsFromEdges(edges, nameOf), ...itemsFromFindings(risks, nodeIdByFile)]
    .sort((a, b) => a.severity - b.severity);

  if (items.length === 0) return null;

  return (
    <div style={{
      margin: '12px 16px 0', border: '1px solid var(--warn-bd)', borderRadius: 9,
      background: 'var(--warn-bg)', overflow: 'hidden', flex: '0 0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEV_COLOR[items[0].severity] }} />

        <span style={{
          fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.08em', color: 'var(--sev2)',
        }}>
          TRIAGE
        </span>
        <span style={{ fontSize: 12, color: 'var(--warn-t)' }}>
          {items.length} {items.length === 1 ? 'issue' : 'issues'}, ranked by severity
          {items.some(i => i.nodeId) ? ' — click Locate to jump to the node' : ''}
        </span>

        <div style={{ flex: 1 }} />
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            fontFamily: MONO, fontSize: 10, color: 'var(--t6)',
            background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
          }}
        >
          {open ? 'hide' : 'show'}
        </button>
      </div>

      {open && (
        /* Capped and scrolled INTERNALLY. Unbounded, a 16-issue list pushed the
           canvas entirely off-screen — the graph was only reachable by zooming
           the browser out. The cap is viewport-relative so a tall screen still
           shows more rows, and the canvas keeps the majority of the space. */
        <div style={{
          display: 'flex', flexDirection: 'column',
          maxHeight: 'min(24vh, 260px)', overflowY: 'auto',
        }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 11, padding: '11px 13px',
              borderTop: '1px solid var(--line)', alignItems: 'flex-start',
            }}>
              <span style={{
                width: 3, alignSelf: 'stretch', borderRadius: 2,
                background: SEV_COLOR[item.severity], flex: '0 0 3px',
              }} />
              <span style={{
                fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em',
                color: SEV_COLOR[item.severity],
                border: `1px solid ${SEV_COLOR[item.severity]}`,
                background: 'transparent', borderRadius: 4, padding: '3px 6px',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {item.kind}
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, color: 'var(--t1)', lineHeight: 1.4 }}>{item.title}</div>
                {item.detail && (
                  <div style={{ fontSize: 11.5, color: 'var(--t4)', lineHeight: 1.55 }}>{item.detail}</div>
                )}
                {!item.nodeId && item.location && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--t6)' }}>{item.location}</div>
                )}
              </div>

              <span style={{
                fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)',
                border: '1px solid var(--bd2)', borderRadius: 4, padding: '3px 6px',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {item.confidence}
              </span>

              {item.nodeId && (
                <button
                  onClick={() => onLocateNode(item.nodeId!)}
                  style={{
                    fontFamily: MONO, fontSize: 10, color: 'var(--info-fg)',
                    border: '1px solid var(--info-bd)', background: 'var(--info-bg)',
                    borderRadius: 5, padding: '5px 9px', cursor: 'pointer',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  LOCATE →
                </button>
              )}
            </div>
          ))}

          {riskDiff && <ReReviewStrip diff={riskDiff} onShowHistory={() => onShowHistory?.()} />}
        </div>
      )}
    </div>
  );
}
