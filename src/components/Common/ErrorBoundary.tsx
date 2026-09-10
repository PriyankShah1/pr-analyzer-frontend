// src/components/Common/ErrorBoundary.tsx
//
// Catches a render crash and shows it, instead of React unmounting the whole
// tree and leaving a white page.
//
// There was none of this before. Any thrown error in any component blanked the
// entire app with nothing in the UI to say what had happened — the user's only
// signal was that the page had vanished, and the only recovery was a reload
// they had to think of themselves.
//
// A class component because that is the only thing React gives error
// boundaries to; there is no hook equivalent.
//
// Two levels are used (see main.tsx and App.tsx). A crash inside the workspace
// should not take the header with it: keeping the header means History and the
// URL bar still work, so the user can move somewhere else rather than reload
// and lose their place.

import { Component, type ErrorInfo, type ReactNode } from 'react';

const MONO = 'var(--font-mono)';

interface Props {
  children: ReactNode;
  /** Names the area that failed, so the message can say WHERE. */
  area?: string;
  /** Offered as a way out that changes state — a plain retry would re-render
   *  the same crash. */
  onRecover?: () => void;
  recoverLabel?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept: the stack is the only thing that makes one of these diagnosable,
    // and it is gone from the UI once the message is rendered.
    console.error('[pr-analyzer] render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { area, onRecover, recoverLabel } = this.props;

    return (
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 32,
      }}>
        <div style={{
          maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12,
          background: 'var(--panel)', border: '1px solid var(--sev1)',
          borderRadius: 10, padding: 20,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em',
            color: 'var(--sev1)',
          }}>
            SOMETHING BROKE{area ? ` IN ${area.toUpperCase()}` : ''}
          </div>

          <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
            This is a bug in the app, not in the code you were reviewing.
            Nothing was written to your pull request.
          </div>

          {/* Shown, not hidden. A message the user can copy into a report is
              worth more than a tidy apology that loses the only useful detail. */}
          <div style={{
            fontFamily: MONO, fontSize: 11, color: 'var(--sev1)',
            background: 'var(--code)', border: '1px solid var(--bd4)',
            borderRadius: 6, padding: '9px 10px', lineHeight: 1.5,
            wordBreak: 'break-word', maxHeight: 160, overflowY: 'auto',
          }}>
            {error.message || String(error)}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onRecover && (
              <button
                onClick={() => { this.setState({ error: null }); onRecover(); }}
                style={{
                  fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                  padding: '7px 12px', borderRadius: 6,
                  background: 'var(--info-bg)', border: '1px solid var(--info-bd)',
                  color: 'var(--info-fg)',
                }}
              >
                {recoverLabel ?? 'Go back'}
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                padding: '7px 12px', borderRadius: 6,
                background: 'transparent', border: '1px solid var(--bd2)',
                color: 'var(--t4)',
              }}
            >
              Reload the page
            </button>
          </div>

          <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--t7)', lineHeight: 1.5 }}>
            Analysis history is stored in this browser and survives a reload.
          </div>
        </div>
      </div>
    );
  }
}
