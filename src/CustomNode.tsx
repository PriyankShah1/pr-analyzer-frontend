import { Handle, Position } from 'reactflow';

type NodeType = 'controller' | 'service' | 'route' | 'middleware' | 'model' | 'facade' | 'repository'|'client' | 'job' | 'event';

interface CustomNodeProps {
  data: {
    label: string;
    type: NodeType;
    hasMismatch?: boolean;
  };
}

const NODE_STYLES: Record<NodeType, { bg: string; border: string; color: string; icon: string; label: string }> = {
  route:      { bg: '#ede9fe', border: '#7c3aed', color: '#4c1d95', icon: '🛣️',  label: 'Route'      },
  middleware: { bg: '#ffedd5', border: '#ea580c', color: '#7c2d12', icon: '🔒',  label: 'Middleware' },
  controller: { bg: '#dbeafe', border: '#2563eb', color: '#1e3a8a', icon: '🎮',  label: 'Controller' },
  service:    { bg: '#dcfce7', border: '#16a34a', color: '#14532d', icon: '⚙️',  label: 'Service'    },
  repository: { bg: '#cffafe', border: '#0891b2', color: '#164e63', icon: '🗄️',  label: 'Repository' },
  model:      { bg: '#fef9c3', border: '#ca8a04', color: '#713f12', icon: '📦',  label: 'Model'      },
  facade:     { bg: '#f1f5f9', border: '#64748b', color: '#1e293b', icon: '🏛️',  label: 'Facade'     },
  client:     { bg: '#f0f4ff', border: '#6366f1', color: '#312e81', icon: '🔌', label: 'Client'  },
  job:        { bg: '#fdf4ff', border: '#a855f7', color: '#581c87', icon: '⚡', label: 'Job'     },
  event:      { bg: '#fff7ed', border: '#f97316', color: '#7c2d12', icon: '📡', label: 'Event'   },
};

export function CustomNode({ data }: CustomNodeProps) {
  const style = NODE_STYLES[data.type] ?? NODE_STYLES.service;
  const hasMismatch = data.hasMismatch || false;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        border: hasMismatch
          ? '3px solid #ef4444'
          : `2px solid ${style.border}`,
        backgroundColor: style.bg,
        boxShadow: hasMismatch
          ? '0 0 12px rgba(239, 68, 68, 0.3)'
          : `0 1px 4px rgba(0,0,0,0.08)`,
        minWidth: '160px',
        textAlign: 'center',
        fontWeight: 500,
        fontSize: '13px',
        color: style.color,
      }}
    >
      {/* Type badge */}
      <div style={{ marginBottom: '4px', fontSize: '10px', opacity: 0.75 }}>
        {style.icon} {style.label}
      </div>

      {/* Label */}
      <div style={{ wordBreak: 'break-word', color: style.color }}>
        {data.label}
      </div>

      {/* Mismatch warning */}
      {hasMismatch && (
        <div style={{ marginTop: '6px', fontSize: '10px', color: '#ef4444', fontWeight: 'bold' }}>
          ⚠️ TYPE MISMATCH
        </div>
      )}

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}