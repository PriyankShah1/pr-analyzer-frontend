// src/components/Common/AnalyzingState.tsx
//
// What the main column shows while an analysis is running.
//
// It previously showed NOTHING. The empty state was gated on `!loading`, so
// from the moment Analyze was clicked until the response arrived the column was
// blank — several seconds, and longer on a cold backend, during which the app
// looked broken rather than busy.
//
// Two things it deliberately does not do:
//
//   - No progress bar and no percentage. The backend reports no progress, so
//     any bar here would be an animation pretending to know something.
//   - No fake step-by-step ticking. The stages below are what the request
//     actually does, listed so the wait is legible, but none is marked
//     complete because nothing tells us when one finishes.

const MONO = 'var(--font-mono)';

/** The real stages of a POST /analyze, in order. */
const STAGES = [
  'Fetching the pull request from GitHub',
  'Parsing the changed files',
  'Running the static rules',
  'Building the component graph',
];

interface AnalyzingStateProps {
  /** Shown so it is obvious WHICH PR is being waited on. */
  label?: string;
  /** True once the in-depth review is part of this run. */
  inDepth?: boolean;
}

export function AnalyzingState({ label, inDepth }: AnalyzingStateProps) {
  return (
    <div style={{
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        width: '100%', maxWidth: 460,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* The one moving thing. Reuses the graph's `pulseNode` keyframe,
              which index.css now stops under prefers-reduced-motion — that
              rule did not exist until this component needed it, despite §7.5
              recording it as done. */}
          <span style={{
            width: 9, height: 9, borderRadius: '50%',
            background: 'var(--accent)', flex: '0 0 9px',
            animation: 'pulseNode 1.4s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
            Analyzing{label ? ` ${label}` : ''}…
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {STAGES.map(stage => (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: 'var(--bd-strong)', flex: '0 0 4px',
              }} />
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--t6)' }}>
                {stage}
              </span>
            </div>
          ))}
          {inDepth && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: 'var(--bd-strong)', flex: '0 0 4px',
              }} />
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--t6)' }}>
                Reading the diff for what the rules cannot see
              </span>
            </div>
          )}
        </div>

        {/* Skeleton in the shape of the triage rows that are coming, so the
            layout does not jump when they arrive. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              height: 34, borderRadius: 7,
              background: 'var(--chip)', border: '1px solid var(--bd)',
              opacity: 1 - i * 0.25,
            }} />
          ))}
        </div>

        <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)', lineHeight: 1.6 }}>
          A first request after the backend has been idle takes longer — the
          host puts it to sleep.
        </div>
      </div>
    </div>
  );
}
