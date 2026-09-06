// src/components/Graph/DetailPanel.tsx
// The 400px docked inspector, per the Claude Design handoff.
//
// This REPLACES the floating trace card. A card that appears next to the
// cursor has to be dismissed, can cover the node it describes, and has
// nowhere to put anything that doesn't fit. A docked panel is always in the
// same place, so reading a trace stops being a mode you enter and leave.
//
// Tabs are exactly the three the handoff specifies: Data flow · AI
// explanation · Skipped. SQL and AI-review findings are NOT duplicated here —
// they already appear in the triage panel, which is where the v6 fold-in
// belongs. A fourth tab restating them was my addition, not the design's.

import { useState } from 'react';
import type { Edge, Node } from 'reactflow';
import type { AnalysisFlow, AnalysisStats } from '../../types';
import type { VariableUsage, CrossComponentHop } from '../../types/dataFlow';
import { AIExplanation } from './AIExplanation';

const MONO = 'var(--font-mono)';

type Tab = 'trace' | 'ai' | 'skips';

const TYPE_META: Record<string, { accent: string; icon: string; label: string }> = {
  component:        { accent: 'var(--n-blue)', icon: '⚛', label: 'component' },
  hook:             { accent: 'var(--n-violet)', icon: '⚙', label: 'hook' },
  api_call:         { accent: 'var(--n-green)', icon: '→', label: 'api call' },
  context_provider: { accent: 'var(--n-pink)', icon: '▣', label: 'provider' },
  context_create:   { accent: 'var(--n-purple)', icon: '◈', label: 'context' },
  deleted:          { accent: 'var(--n-muted)', icon: '✗', label: 'deleted' },
  broken:           { accent: 'var(--n-red)', icon: '⚠', label: 'broken ref' },
};

const USAGE_COLOR: Record<string, string> = {
  jsx_prop: 'var(--n-blue-2)',
  jsx_expression: 'var(--n-purple-2)',
  condition: 'var(--sev3)',
  assignment: 'var(--ok)',
  property_access: 'var(--n-pink)',
  function_call: 'var(--sev2)',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, letterSpacing: '0.09em', color: 'var(--t6)',
    }}>
      {children}
    </div>
  );
}

function Section({ label, children, last = false }: {
  label?: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{
      padding: '13px 16px',
      borderBottom: last ? 'none' : '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {label && <SectionLabel>{label}</SectionLabel>}
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 11, color: 'var(--t2)', lineHeight: 1.6,
      background: 'var(--code)', border: '1px solid var(--bd4)', borderRadius: 7,
      padding: '9px 10px', wordBreak: 'break-word',
    }}>
      {children}
    </div>
  );
}

// ── Data flow tab ─────────────────────────────────────────────────────────

/** Flatten the recursive hop tree into an ordered, depth-tagged path. */
function buildChain(trace: CrossComponentHop[]): Array<{ name: string; resolved: boolean; reason?: string }> {
  const out: Array<{ name: string; resolved: boolean; reason?: string }> = [];
  function walk(hops: CrossComponentHop[]) {
    for (const hop of hops) {
      const resolved = Boolean(hop.resolved) && !hop.hopBlocked;
      out.push({ name: hop.toComponent, resolved, reason: hop.reason });
      if (resolved && hop.furtherHops?.length) walk(hop.furtherHops);
    }
  }
  walk(trace);
  return out;
}

function countImpact(usages: VariableUsage[], trace: CrossComponentHop[]) {
  const components = new Set<string>();
  let sites = usages.length;
  function walk(hops: CrossComponentHop[]) {
    for (const hop of hops) {
      if (hop.hopBlocked || !hop.resolved) continue;
      components.add(hop.toComponent);
      sites += hop.childLocalUsages?.length ?? 0;
      if (hop.furtherHops?.length) walk(hop.furtherHops);
    }
  }
  walk(trace);
  return { sites, components: [...components] };
}

/**
 * Every edge that describes a value this node PRODUCES.
 *
 * The bug this fixes: the panel used to read only the node's INCOMING edge.
 * That works for a hook node (`CheckoutPanel -> useState()` carries the
 * binding `[total, setTotal]`), but a component is the SOURCE of its hook
 * edges, not their target — and a root component has no incoming edge at all.
 * So clicking the very thing the card invites you to click ("click to trace")
 * produced an empty panel.
 *
 * Both directions are considered now: whichever edge actually carries an
 * `outputBinding` describes what this node produces.
 */
function bindingEdges(incoming: Edge | undefined, outgoing: Edge[]): Edge[] {
  const all = [...(incoming ? [incoming] : []), ...outgoing];
  return all.filter(e => {
    const names = e.data?.outputBinding?.names;
    return Array.isArray(names) && names.length > 0;
  });
}

function DataFlowTab({ incoming, outgoing, nameOf, onLocateComponent }: {
  incoming: Edge | undefined;
  outgoing: Edge[];
  /** Node id -> label. Edge endpoints are IDs; printing them raw gave rows
   *  like "5 · checked_broken" instead of a component name. */
  nameOf: (id: string) => string;
  onLocateComponent: (name: string) => void;
}) {
  // Prefer an incoming binding (this node IS the produced value, e.g. a hook)
  // and otherwise fall back to what this node produces through its outgoing
  // edges (a component owning hooks).
  const sources = bindingEdges(incoming, outgoing);
  const edgeData: any = sources[0]?.data;

  const binding = edgeData?.outputBinding;
  const usagesByVar: Record<string, VariableUsage[]> = edgeData?.usagesByVar ?? {};
  const traceByVar: Record<string, CrossComponentHop[]> = edgeData?.crossComponentTrace ?? {};

  const hooks = outgoing.filter(e => e.data?.flowType === 'hook');
  const apis  = outgoing.filter(e => e.data?.flowType === 'api_call');
  const renders = outgoing.filter(e => e.data?.flowType === 'renders');

  const varNames: string[] = binding?.names ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Section label="OUTPUT BINDING">
        {binding && varNames.length > 0 ? (
          <>
            <div>
              <span style={{
                fontFamily: MONO, fontSize: 9.5, color: 'var(--violet)',
                border: '1px solid var(--violet-bd)', background: 'var(--violet-bg)',
                borderRadius: 4, padding: '2px 6px',
              }}>
                {binding.pattern}
              </span>
            </div>
            <CodeBlock>{varNames.join(', ')}</CodeBlock>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--t5)', lineHeight: 1.55 }}>
            This call captures no value — it runs for its side effect only, so there is
            no variable to follow.
          </div>
        )}
      </Section>

      {varNames.map(varName => {
        const usages = usagesByVar[varName] ?? [];
        const trace = traceByVar[varName] ?? [];
        const chain = buildChain(trace);
        const impact = countImpact(usages, trace);

        return (
          <div key={varName}>
            <Section>
              <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: 'var(--t1)' }}>
                {varName}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <span style={{
                  fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em',
                  color: 'var(--info-fg)', border: '1px solid var(--info-bd)',
                  background: 'var(--info-bg)', borderRadius: 4, padding: '3px 6px',
                  whiteSpace: 'nowrap',
                }}>
                  IMPACT
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.55 }}>
                  {impact.components.length > 0
                    ? `Changing this affects ${impact.sites} place${impact.sites === 1 ? '' : 's'} across ${impact.components.length + 1} components`
                    : `Used in ${impact.sites} place${impact.sites === 1 ? '' : 's'}, all inside this component`}
                </span>
              </div>
            </Section>

            {usages.length > 0 && (
              <Section label={`USAGES (${usages.length})`}>
                {usages.map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{
                      fontFamily: MONO, fontSize: 9.5,
                      color: USAGE_COLOR[u.kind] ?? 'var(--t4)',
                      border: `1px solid ${USAGE_COLOR[u.kind] ?? 'var(--t4)'}44`,
                      borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {u.kind}
                    </span>
                    <span style={{
                      fontFamily: MONO, fontSize: 10.5, color: 'var(--t2)',
                      lineHeight: 1.6, wordBreak: 'break-word', minWidth: 0,
                    }}>
                      {u.line}
                    </span>
                  </div>
                ))}
              </Section>
            )}

            {chain.length > 0 && (
              <Section label="PROPAGATION CHAIN">
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    fontFamily: MONO, fontSize: 10.5, color: 'var(--t3)',
                    background: 'var(--chip)', border: '1px solid var(--bd2)',
                    borderRadius: 5, padding: '4px 7px',
                  }}>
                    here
                  </span>
                  {chain.map((c, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: 'var(--t6)' }}>→</span>
                      <button
                        onClick={() => c.resolved && onLocateComponent(c.name)}
                        title={c.resolved ? `Find ${c.name} on the graph` : c.reason}
                        style={{
                          fontFamily: MONO, fontSize: 10.5,
                          color: c.resolved ? 'var(--accent)' : 'var(--t6)',
                          background: 'var(--chip)',
                          border: `1px ${c.resolved ? 'solid var(--bd2)' : 'dashed var(--bd2)'}`,
                          borderRadius: 5, padding: '4px 7px',
                          cursor: c.resolved ? 'pointer' : 'default',
                        }}
                      >
                        {c.resolved ? c.name : `${c.name} ?`}
                      </button>
                    </span>
                  ))}
                </div>
                {chain.some(c => !c.resolved) && (
                  <div style={{ fontSize: 10.5, color: 'var(--t6)', lineHeight: 1.5 }}>
                    Dashed hops could not be followed — the reason is on hover.
                  </div>
                )}
              </Section>
            )}
          </div>
        );
      })}

      {/* PROPS / HOOKS / API CALLS, per the handoff. Every child name is
          resolved through nameOf — edge endpoints are node IDs, and printing
          them raw produced rows like "5 · checked_broken". */}
      {(hooks.length > 0 || apis.length > 0 || renders.length > 0) && (
        <Section label="OUTGOING" last>
          {renders.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SectionLabel>PROPS</SectionLabel>
              {renders.map(e => {
                const passed: string[] = e.data?.passedProps ?? [];
                const broken: string[] = e.data?.brokenProps ?? [];
                const mistyped: string[] = (e.data?.typeMismatches ?? [])
                  .map((t: any) => t.propName);
                return (
                  <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      onClick={() => onLocateComponent(nameOf(String(e.target)))}
                      title="Locate this component on the graph"
                      style={{
                        alignSelf: 'flex-start', fontFamily: MONO, fontSize: 10.5,
                        color: 'var(--accent)', background: 'transparent',
                        border: 0, padding: 0, cursor: 'pointer', lineHeight: 1.7,
                      }}
                    >
                      {nameOf(String(e.target))}
                    </button>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.7, paddingLeft: 8 }}>
                      {passed.length === 0
                        ? <span style={{ color: 'var(--t6)' }}>no props passed</span>
                        : passed.map((p, i) => {
                            // Colour marks WHY a prop is flagged: an unaccepted
                            // name and a wrong literal type are different bugs
                            // and get different fixes.
                            const color = broken.includes(p) ? 'var(--sev2)'
                              : mistyped.includes(p) ? 'var(--sev3)'
                              : 'var(--t3)';
                            return (
                              <span key={p} style={{ color }}>
                                {p}{i < passed.length - 1 ? ', ' : ''}
                              </span>
                            );
                          })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {hooks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SectionLabel>HOOKS</SectionLabel>
              {hooks.map(e => (
                <div key={e.id} style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--t3)', lineHeight: 1.7 }}>
                  {nameOf(String(e.target))}
                  {(e.data?.missingDeps ?? []).length > 0 && (
                    <span style={{ color: 'var(--sev3)' }}>
                      {' '}· missing {(e.data.missingDeps as string[]).join(', ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {apis.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SectionLabel>API CALLS</SectionLabel>
              {apis.map(e => (
                <div key={e.id} style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--ok)', lineHeight: 1.7 }}>
                  {e.data?.apiEndpoint ?? nameOf(String(e.target))}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ── Findings tab ──────────────────────────────────────────────────────────

// ── Skipped tab ───────────────────────────────────────────────────────────

function SkippedTab({ edges }: { edges: Edge[] }) {
  const skipped = edges
    .filter(e => typeof e.data?.propCheckStatus === 'string' && e.data.propCheckStatus.startsWith('skipped_'))
    .map(e => ({
      label: e.data.propCheckStatus as string,
      where: `${String(e.source)} → ${String(e.target)}`,
      why: (e.data.message as string) ?? '',
    }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '13px 16px', borderBottom: '1px solid var(--line)',
        fontSize: 11.5, color: 'var(--t4)', lineHeight: 1.6,
      }}>
        Accuracy over coverage. Every case the analyzer could not resolve is listed
        here with its reason — nothing is guessed.
      </div>

      {skipped.length === 0 ? (
        <div style={{ padding: '13px 16px', fontSize: 11.5, color: 'var(--t5)', lineHeight: 1.6 }}>
          Nothing was skipped — every prop relationship in this PR was resolved.
        </div>
      ) : (
        skipped.map((s, i) => (
          <div key={i} style={{
            padding: '12px 16px', borderBottom: '1px solid var(--line)',
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: 'var(--t4)',
                border: '1px solid var(--bd5)', borderRadius: 4, padding: '2px 6px',
              }}>
                {s.label}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--t2)' }}>{s.where}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--t5)', lineHeight: 1.6 }}>{s.why}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Panel shell ───────────────────────────────────────────────────────────

interface DetailPanelProps {
  selectedNode: Node | null;
  edges: Edge[];
  /** All graph nodes, used only to turn edge endpoint IDs into readable names. */
  nodes?: Node[];
  onLocateComponent: (name: string) => void;
  prTitle?: string;
  codeLanguage?: string;
  flows?: AnalysisFlow[];
  stats?: AnalysisStats;
  codeContext?: string;
  aiExplanations?: Record<string, string>;
  /** Head SHA, so explanations cache against the revision they describe. */
  prHeadSha?: string | null;
}

export function DetailPanel({
  selectedNode, edges, nodes = [], onLocateComponent,
  prTitle, codeLanguage, flows, stats, codeContext, aiExplanations, prHeadSha,
}: DetailPanelProps) {
  const [tab, setTab] = useState<Tab>('trace');

  const nodeType = (selectedNode?.data?.type as string) ?? 'component';
  const meta = TYPE_META[nodeType] ?? { accent: 'var(--t4)', icon: '◇', label: nodeType };

  // A leaf node's data flow lives on the edge that PRODUCES it.
  const incoming = selectedNode ? edges.find(e => e.target === selectedNode.id) : undefined;
  const outgoing = selectedNode ? edges.filter(e => e.source === selectedNode.id) : [];
  const propStatus = incoming?.data?.propCheckStatus as string | undefined;

  const nameById = new Map<string, string>(
    nodes.map(n => [String(n.id), String((n.data as any)?.label ?? n.id)]),
  );
  const nameOf = (id: string) => nameById.get(id) ?? id;

  const statusColor = propStatus?.startsWith('checked_ok')
    ? 'var(--ok)'
    : propStatus?.startsWith('checked_broken') ? 'var(--sev2)' : 'var(--t4)';

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'trace', label: 'Data flow' },
    { key: 'ai', label: 'AI explanation' },
    { key: 'skips', label: 'Skipped' },
  ];

  return (
    <section style={{
      width: 400, flex: '0 0 400px',
      borderLeft: '1px solid var(--bd)', background: 'var(--panel)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      {/* Selected node header */}
      <div style={{
        padding: '14px 16px 12px', borderBottom: '1px solid var(--bd)',
        display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto',
      }}>
        {selectedNode ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: meta.accent }}>{meta.icon}</span>
              <span style={{
                fontFamily: MONO, fontSize: 13, fontWeight: 600, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {selectedNode.data?.label}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{
                fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: 'var(--t4)',
                border: '1px solid var(--bd2)', borderRadius: 4, padding: '3px 6px',
                whiteSpace: 'nowrap',
              }}>
                {meta.label}
              </span>
            </div>

            <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--t6)', wordBreak: 'break-all' }}>
              {selectedNode.data?.file ?? '—'}
            </div>

            {propStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 2 }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: 'var(--t6)' }}>
                  prop check
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 10, color: statusColor,
                  border: `1px solid ${statusColor}`, borderRadius: 4, padding: '3px 6px',
                }}>
                  {propStatus}
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--t5)', lineHeight: 1.55 }}>
            No node selected. Click a component, hook, or API call on the graph to
            inspect what it produces and where that value travels.
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bd)', flex: '0 0 auto' }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '9px 12px', cursor: 'pointer', fontSize: 12,
                fontFamily: 'var(--font-sans)', background: 'transparent',
                border: 0, borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                color: active ? 'var(--t1)' : 'var(--t5)',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'trace' && (
          selectedNode
            ? <DataFlowTab incoming={incoming} outgoing={outgoing} nameOf={nameOf} onLocateComponent={onLocateComponent} />
            : <Section last><div style={{ fontSize: 11.5, color: 'var(--t5)' }}>Select a node to trace its data.</div></Section>
        )}

        {tab === 'ai' && (
          flows && stats
            ? <AIExplanation
                prTitle={prTitle}
                codeLanguage={codeLanguage}
                flows={flows}
                stats={stats}
                codeContext={codeContext}
                initialExplanations={aiExplanations}
                prHeadSha={prHeadSha}
              />
            : <Section last><div style={{ fontSize: 11.5, color: 'var(--t5)' }}>No explanation available for this run.</div></Section>
        )}

        {tab === 'skips' && <SkippedTab edges={edges} />}
      </div>
    </section>
  );
}
