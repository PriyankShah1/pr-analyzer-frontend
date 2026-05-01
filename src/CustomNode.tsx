// This file defines the CustomNode component used to render each node in the React Flow graph.
import { Handle, Position } from 'reactflow';

export type NodeType =
  | 'controller' | 'service'    | 'route'      | 'middleware'
  | 'model'      | 'facade'     | 'repository' | 'client'
  | 'job'        | 'event'      | 'listener'   | 'policy'
  | 'request'    | 'resource'   | 'observer'   | 'command'
  | 'deleted'    | 'broken';   // ← NEW types

interface CustomNodeProps {
  data: {
    label:      string;
    type:       NodeType;
    hasMismatch?: boolean;
    isDeleted?:   boolean;
    isBroken?:    boolean;
  };
}

const NODE_CONFIG: Record<NodeType, { accent: string; icon: string; label: string }> = {
  route:      { accent: '#4f46e5', icon: '🛣️',  label: 'Route'       },
  middleware: { accent: '#d97706', icon: '🔒',  label: 'Middleware'  },
  controller: { accent: '#2563eb', icon: '🎮',  label: 'Controller'  },
  service:    { accent: '#0d9488', icon: '⚙️',  label: 'Service'     },
  repository: { accent: '#0891b2', icon: '🗄️',  label: 'Repository'  },
  model:      { accent: '#92400e', icon: '📦',  label: 'Model'       },
  facade:     { accent: '#475569', icon: '🏛️',  label: 'Facade'      },
  client:     { accent: '#7c3aed', icon: '🔌',  label: 'Client'      },
  job:        { accent: '#a855f7', icon: '⚡',  label: 'Job'         },
  event:      { accent: '#f97316', icon: '📡',  label: 'Event'       },
  listener:   { accent: '#0f766e', icon: '👂',  label: 'Listener'    },
  policy:     { accent: '#be185d', icon: '🛡️',  label: 'Policy'      },
  request:    { accent: '#1d4ed8', icon: '📨',  label: 'Request'     },
  resource:   { accent: '#047857', icon: '📤',  label: 'Resource'    },
  observer:   { accent: '#b45309', icon: '👁️',  label: 'Observer'    },
  command:    { accent: '#1e293b', icon: '⌨️',  label: 'Command'     },
  // ── New types ─────────────────────────────────────────────────────────
  deleted:    { accent: '#6b7280', icon: '🗑️',  label: 'Deleted'     },
  broken:     { accent: '#f97316', icon: '💥',  label: 'Broken ref'  },
};

export function CustomNode({ data }: CustomNodeProps) {
  const config     = NODE_CONFIG[data.type] ?? NODE_CONFIG.service;
  const hasMismatch = data.hasMismatch || false;
  const isDeleted   = data.isDeleted   || data.type === 'deleted';
  const isBroken    = data.isBroken    || data.type === 'broken';

  // Color priority: broken > mismatch > deleted > normal
  let accent = config.accent;
  if (isBroken)    accent = '#f97316'; // orange
  if (hasMismatch) accent = '#dc2626'; // red
  if (isDeleted)   accent = '#6b7280'; // gray

  return (
    <div style={{
      position: 'relative',
      padding: '10px 14px',
      paddingTop: '14px',
      borderRadius: '10px',
      border: `2px solid ${accent}`,
      backgroundColor: 'var(--node-bg)',
      boxShadow: isBroken
        ? `0 0 0 3px rgba(249,115,22,0.2), 0 2px 8px rgba(0,0,0,0.12)`
        : hasMismatch
          ? `0 0 0 3px rgba(220,38,38,0.15), 0 2px 8px rgba(0,0,0,0.12)`
          : `0 2px 8px rgba(0,0,0,0.08)`,
      minWidth: '160px',
      maxWidth: '220px',
      textAlign: 'center',
      opacity: isDeleted ? 0.65 : 1,  // dim deleted nodes
    }}>

      {/* Accent top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '4px', borderRadius: '8px 8px 0 0',
        backgroundColor: accent,
      }} />

      {/* Type badge */}
      <div style={{
        marginBottom: '5px', fontSize: '10px', fontWeight: 600,
        letterSpacing: '0.05em', textTransform: 'uppercase',
        color: accent,
      }}>
        {config.icon} {config.label}
      </div>

      {/* Label — strikethrough if deleted */}
      <div style={{
        wordBreak: 'break-word', fontSize: '12px', fontWeight: 500,
        color: 'var(--node-text)', lineHeight: 1.4,
        textDecoration: isDeleted ? 'line-through' : 'none',
      }}>
        {data.label}
      </div>

      {/* Status badges */}
      {hasMismatch && !isBroken && (
        <div style={{
          marginTop: '6px', padding: '2px 6px',
          backgroundColor: 'rgba(220,38,38,0.1)',
          borderRadius: '4px', fontSize: '10px',
          color: '#dc2626', fontWeight: 700,
        }}>
          ⚠️ TYPE MISMATCH
        </div>
      )}

      {isBroken && (
        <div style={{
          marginTop: '6px', padding: '2px 6px',
          backgroundColor: 'rgba(249,115,22,0.1)',
          borderRadius: '4px', fontSize: '10px',
          color: '#f97316', fontWeight: 700,
        }}>
          💥 BROKEN DEPENDENCY
        </div>
      )}

      {isDeleted && (
        <div style={{
          marginTop: '6px', padding: '2px 6px',
          backgroundColor: 'rgba(107,114,128,0.1)',
          borderRadius: '4px', fontSize: '10px',
          color: '#6b7280', fontWeight: 700,
        }}>
          🗑️ DELETED IN THIS PR
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: accent, width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: accent, width: 8, height: 8 }}
      />
    </div>
  );
}



