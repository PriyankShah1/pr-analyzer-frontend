// src/components/Header/TokenGuide.tsx
//
// What a token actually needs, per capability.
//
// This exists because the failure is silent and the settings are
// counter-intuitive. People generate a token, paste it, and the commit button
// fails with a permissions error they cannot act on — the token looked fine,
// GitHub accepted it, and reading worked. The three capabilities need three
// DIFFERENT things:
//
//   read     — nothing at all
//   comment  — authentication, but no repository permission
//   commit   — write access to repository CONTENTS, which is a different
//              permission from Pull requests
//
// The trap worth stating loudly: a fine-grained token scoped to "Public
// repositories" is READ-ONLY. GitHub does not show a Repository permissions
// section for it, so there is nothing to tick and no indication anything is
// missing — it simply cannot comment or commit.

import { useState } from 'react';

const MONO = 'var(--font-mono)';

interface Row {
  what: string;
  classic: string;
  fine: string;
}

/** Derived from what the API actually calls, not from memory:
 *  /comment → issues.createComment + pulls.createReview
 *  /commit  → git.createBlob → createTree → createCommit → updateRef */
const ROWS: Row[] = [
  {
    what: 'Read a public PR',
    classic: 'No token needed',
    fine: 'No token needed',
  },
  {
    what: 'Raise the rate limit (60 → 5,000/hr)',
    classic: 'Any token. No scopes ticked.',
    fine: 'Any token.',
  },
  {
    what: 'Post review comments',
    classic: 'No scopes ticked — works on any public repo',
    fine: 'Pull requests: Read and write, on that repo',
  },
  {
    what: 'Commit a suggested fix',
    classic: 'public_repo (or repo for private)',
    fine: 'Contents: Read and write, on that repo',
  },
  {
    what: 'Analyze a private repo',
    classic: 'repo',
    fine: 'Contents: Read, on that repo',
  },
];

export function TokenGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          alignSelf: 'flex-start',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 0, padding: 0,
          fontFamily: MONO, fontSize: 10.5, color: 'var(--accent)',
          cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>
          ›
        </span>
        Which permissions does my token need?
      </button>

      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: '10px 12px', borderRadius: 7,
          background: 'var(--panel)', border: '1px solid var(--bd2)',
          maxWidth: 640,
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              borderCollapse: 'collapse', width: '100%',
              fontSize: 11, color: 'var(--t4)',
            }}>
              <thead>
                <tr>
                  {['What you want to do', 'Classic token', 'Fine-grained token'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '4px 10px 6px 0',
                      fontFamily: MONO, fontSize: 9.5, fontWeight: 500,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--t7)', borderBottom: '1px solid var(--bd)',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(r => (
                  <tr key={r.what}>
                    <td style={{
                      padding: '6px 10px 6px 0', verticalAlign: 'top',
                      color: 'var(--t3)', borderBottom: '1px solid var(--line)',
                    }}>
                      {r.what}
                    </td>
                    <td style={{
                      padding: '6px 10px 6px 0', verticalAlign: 'top',
                      fontFamily: MONO, fontSize: 10, color: 'var(--t5)',
                      borderBottom: '1px solid var(--line)',
                    }}>
                      {r.classic}
                    </td>
                    <td style={{
                      padding: '6px 0 6px 0', verticalAlign: 'top',
                      fontFamily: MONO, fontSize: 10, color: 'var(--t5)',
                      borderBottom: '1px solid var(--line)',
                    }}>
                      {r.fine}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The one that silently costs people an hour. */}
          <div style={{
            fontSize: 11, lineHeight: 1.55, color: 'var(--t4)',
            background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)',
            borderRadius: 6, padding: '8px 10px',
          }}>
            <strong style={{ color: 'var(--t2)' }}>The one that catches people out:</strong>{' '}
            a fine-grained token set to <em>“Public repositories”</em> is
            read-only. GitHub shows no Repository-permissions section for it, so
            there is nothing to tick and no sign anything is missing — it just
            cannot comment or commit. Use{' '}
            <em>“Only select repositories”</em> and grant the permission above.
          </div>

          <div style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--t5)' }}>
            Committing needs <strong style={{ color: 'var(--t3)' }}>Contents</strong>, not
            Pull requests — a fix is written as a real commit on the PR branch.
            You can only commit to a repository you are able to push to, so a
            fix on someone else’s PR has to be applied by them.
          </div>

          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noreferrer"
            style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--accent)' }}
          >
            github.com/settings/tokens →
          </a>
        </div>
      )}
    </div>
  );
}
