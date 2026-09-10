// src/components/Graph/CodeFlowBar.tsx
// The strip directly above the canvas: section label, edge legend, and the
// Export PNG control.
//
// Export PNG lives here rather than in the global header (design amendment
// A1) so the control sits with the thing it acts on — it exports this canvas,
// and nothing else on the page.

const MONO = 'var(--font-mono)';

/** Matches the stroke treatment applied to edges in visualizer.js. */
const LEGEND = [
  { label: 'broken',         color: 'var(--sev1)', dashed: true },
  { label: 'fetch',          color: 'var(--ok)',   dashed: true },
  { label: 'props / render', color: 'var(--edge)', dashed: false },
];

interface CodeFlowBarProps {
  onExportPNG: () => void;
  exporting?: boolean;
  /**
   * Set when the graph is larger than a canvas can hold, so the PNG is
   * downscaled to fit. Said out loud because the alternative — exporting a
   * blank image and calling it done — is what used to happen.
   */
  exportNote?: string | null;
  /** Tour anchor, set on the root so no wrapper element is needed. */
  dataTour?: string;
  /**
   * Frames the whole graph again.
   *
   * "Locate" pans and zooms to one node and there was no way back — the canvas
   * simply stayed where Locate had left it, and on a large graph that reads as
   * the rest of the diagram having disappeared.
   */
  onResetView?: () => void;
}

export function CodeFlowBar({ onExportPNG, exporting = false, exportNote, dataTour, onResetView }: CodeFlowBarProps) {
  return (
    <div
      data-tour={dataTour}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '13px 16px 8px', flex: '0 0 auto',
      }}
    >
      <span style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.09em', color: 'var(--t6)',
      }}>
        CODE FLOW
      </span>

      {/* The scope caveat from the mock. It also carries what the deleted left
          rail used to say: this graph is application code, so an empty canvas
          on a framework repo is a deliberate non-result, not a miss. */}
      <span style={{
        fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)',
        border: '1px solid var(--bd2)', borderRadius: 4,
        padding: '3px 7px', whiteSpace: 'nowrap',
      }}>
        application code only
      </span>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
        {LEGEND.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 14, height: 0,
              borderTop: `1.4px ${l.dashed ? 'dashed' : 'solid'} ${l.color}`,
            }} />
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t5)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {onResetView && (
        <button
          onClick={onResetView}
          title="Fit the whole graph back on screen"
          style={{
            fontFamily: MONO, fontSize: 10, color: 'var(--t3)',
            border: '1px solid var(--bd2)', background: 'var(--input)',
            borderRadius: 5, padding: '5px 9px', cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          Reset view
        </button>
      )}

      <button
        onClick={onExportPNG}
        disabled={exporting}
        title="Export the graph as a PNG"
        style={{
          marginLeft: 4,
          fontFamily: MONO, fontSize: 10, color: 'var(--t3)',
          border: '1px solid var(--bd2)', background: 'var(--input)',
          borderRadius: 5, padding: '5px 9px',
          cursor: exporting ? 'default' : 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0,
          opacity: exporting ? 0.6 : 1,
        }}
      >
        {exporting ? 'Exporting…' : 'Export PNG'}
      </button>

      {exportNote && (
        <span
          title={exportNote}
          style={{
            fontFamily: MONO, fontSize: 9.5, color: 'var(--t6)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 240,
          }}
        >
          {exportNote}
        </span>
      )}
    </div>
  );
}
