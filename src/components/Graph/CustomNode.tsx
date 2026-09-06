// src/components/Graph/CustomNode.tsx
// Graph node card, per the Claude Design handoff.
//
// Icons are geometric glyphs, not emoji. Emoji render differently on every
// platform, carry colour we don't control, and read as decoration; a single
// stroke-weight symbol set tinted with the node's own accent reads as a
// legend you can learn. The mock establishes this for the React types and
// this file extends the same language to the backend types.

import { Handle, Position } from 'reactflow';

export type NodeType =
  | 'route' | 'middleware' | 'controller' | 'service' | 'repository'
  | 'model' | 'facade' | 'client' | 'job' | 'event' | 'listener'
  | 'policy' | 'request' | 'resource' | 'observer' | 'command'
  | 'component' | 'hook' | 'api_call' | 'context_provider' | 'context_create'
  | 'deleted' | 'broken';

interface CustomNodeProps {
  data: {
    label: string;
    type: NodeType;
    file?: string | null;
    hasMismatch?: boolean;
    hasTypeMismatch?: boolean;
    hasBrokenProps?: boolean;
    hasMissingDeps?: boolean;
    missingDeps?: string[];
    isDeleted?: boolean;
    isBroken?: boolean;
    isLocated?: boolean;
    isSelected?: boolean;
    /** Index in the layout, used to stagger the entrance animation. */
    order?: number;
  };
}

const NODE_CONFIG: Record<NodeType, { accent: string; icon: string; label: string }> = {
  // React — colours fixed by the handoff
  component:        { accent: 'var(--n-blue)', icon: '⚛', label: 'component' },
  hook:             { accent: 'var(--n-violet)', icon: '⚙', label: 'hook' },
  api_call:         { accent: 'var(--n-green)', icon: '→', label: 'api call' },
  context_provider: { accent: 'var(--n-pink)', icon: '▣', label: 'provider' },
  context_create:   { accent: 'var(--n-purple)', icon: '◈', label: 'context' },

  // Backend — same visual language, extended
  route:      { accent: 'var(--n-blue)', icon: '⇢', label: 'route' },
  middleware: { accent: 'var(--n-orange)', icon: '⬡', label: 'middleware' },
  controller: { accent: 'var(--n-blue)', icon: '◉', label: 'controller' },
  service:    { accent: 'var(--n-green)', icon: '⚙', label: 'service' },
  repository: { accent: 'var(--n-cyan)', icon: '▤', label: 'repository' },
  model:      { accent: 'var(--n-violet)', icon: '◈', label: 'model' },
  facade:     { accent: 'var(--n-grey)', icon: '◫', label: 'facade' },
  client:     { accent: 'var(--n-purple)', icon: '⇄', label: 'client' },
  job:        { accent: 'var(--n-pink)', icon: '⧗', label: 'job' },
  event:      { accent: 'var(--n-orange)', icon: '◇', label: 'event' },
  listener:   { accent: 'var(--n-green)', icon: '◎', label: 'listener' },
  policy:     { accent: 'var(--n-pink)', icon: '⬡', label: 'policy' },
  request:    { accent: 'var(--n-blue)', icon: '▷', label: 'request' },
  resource:   { accent: 'var(--n-green)', icon: '▦', label: 'resource' },
  observer:   { accent: 'var(--n-yellow)', icon: '◎', label: 'observer' },
  command:    { accent: 'var(--n-grey)', icon: '▸', label: 'command' },

  deleted:    { accent: 'var(--n-muted)', icon: '✗', label: 'deleted' },
  broken:     { accent: 'var(--n-red)', icon: '⚠', label: 'broken ref' },
};

const CLICKABLE_TYPES = new Set(['component', 'hook', 'api_call', 'context_provider']);

const MONO = 'var(--font-mono)';

/**
 * The single most important thing wrong with this node.
 *
 * Only ONE badge is ever shown. Stacking three warnings on a 222px card makes
 * every card look equally alarming, which defeats the ranking the triage
 * panel works hard to establish. Order here mirrors triage severity.
 */
function pickBadge(data: CustomNodeProps['data']): string | null {
  if (data.isBroken) return 'BROKEN DEPENDENCY';
  if (data.isDeleted) return 'DELETED IN THIS PR';
  if (data.hasMismatch || data.hasTypeMismatch) return 'TYPE MISMATCH';
  if (data.hasBrokenProps) return 'PROP MISMATCH';
  if (data.hasMissingDeps) {
    const deps = data.missingDeps ?? [];
    return deps.length > 0 ? `MISSING DEP: ${deps.join(', ')}` : 'MISSING DEP';
  }
  return null;
}

export function CustomNode({ data }: CustomNodeProps) {
  const config = NODE_CONFIG[data.type] ?? NODE_CONFIG.service;
  const badge = pickBadge(data);
  const isDeleted = data.isDeleted || data.type === 'deleted';
  const selected = Boolean(data.isSelected);
  const located = Boolean(data.isLocated);
  const clickable = CLICKABLE_TYPES.has(data.type);

  const borderColor = selected
    ? config.accent
    : badge ? 'var(--warn-bd)' : 'var(--bd2)';

  const boxShadow = located
    ? `0 0 0 1px ${config.accent}, var(--shadow-lg)`
    : selected
      ? `0 0 0 1px ${config.accent}, var(--shadow-lg)`
      : 'var(--shadow)';

  return (
    <div
      className={`dc-node${located ? ' dc-node--located' : ''}`}
      style={{
        // Staggered entrance: nodes fade in in layout order so the graph
        // reads as assembling rather than snapping into place.
        animationDelay: `${Math.min(data.order ?? 0, 24) * 28}ms`,
        position: 'relative',
        width: 222,
        padding: '11px 12px',
        borderRadius: 9,
        background: selected ? 'var(--node-on)' : 'var(--node)',
        border: `1px solid ${borderColor}`,
        boxShadow,
        cursor: clickable ? 'pointer' : 'default',
        opacity: isDeleted ? 0.72 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />

      {/* Type accent bar */}
      <span style={{
        position: 'absolute', left: 0, top: 10, bottom: 10,
        width: 2, borderRadius: 2, background: config.accent,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 6 }}>
        <span style={{ fontSize: 12, color: config.accent, lineHeight: 1, flexShrink: 0 }}>
          {config.icon}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span
            title={data.label}
            style={{
              fontFamily: MONO, fontSize: 11.5, fontWeight: 500, color: 'var(--t1)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textDecoration: isDeleted ? 'line-through' : 'none',
            }}
          >
            {data.label}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.07em', color: 'var(--t6)',
          }}>
            {config.label}
            {clickable && <span style={{ color: 'var(--t7)' }}> · click to trace</span>}
          </span>
        </div>
      </div>

      {badge && (
        <div style={{ paddingLeft: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 7,
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em',
            color: 'var(--sev2)', background: 'var(--sev2-bg)',
            border: '1px solid var(--warn-bd)', borderRadius: 4, padding: '2px 5px',
            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {badge}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  );
}
