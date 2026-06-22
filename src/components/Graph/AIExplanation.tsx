// src/components/Graph/AIExplanation.tsx
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { AnalysisFlow, AnalysisStats, ExplanationLanguage } from '../../types';

const API = import.meta.env.VITE_API_URL;

interface AIExplanationProps {
  prTitle?:      string;
  codeLanguage?: string;
  flows:         AnalysisFlow[];
  stats:         AnalysisStats;
  codeContext?:  string;
  // Pre-filled from the initial /analyze response (just the default
  // language, e.g. 'en') — avoids re-fetching what we already have.
  initialExplanations?: Record<string, string>;
}

export function AIExplanation({
  prTitle, codeLanguage, flows, stats, codeContext, initialExplanations,
}: AIExplanationProps) {
  const [languages, setLanguages]       = useState<ExplanationLanguage[]>([]);
  const [activeLang, setActiveLang]     = useState<string>('en');
  const [explanations, setExplanations] = useState<Record<string, string>>(initialExplanations || {});
  const [loadingLang, setLoadingLang]   = useState<string | null>(null);
  const [errorLang, setErrorLang]       = useState<string | null>(null);

  // ── Fetch available languages — dynamic, zero hardcoding ───────────────
  // Adding a 5th language to the backend's languageConfig.js makes a new
  // tab appear here automatically, with no frontend code changes.
  useEffect(() => {
    axios.get(`${API}/explain/languages`)
      .then(res => {
        const langs: ExplanationLanguage[] = res.data.languages || [];
        setLanguages(langs);
        const defaultLang = langs.find(l => l.isDefault);
        if (defaultLang) setActiveLang(defaultLang.code);
      })
      .catch(() => {
        // Network hiccup — fall back to showing whatever we already have
        if (initialExplanations?.en) {
          setLanguages([{ code: 'en', label: 'English', nativeLabel: 'English', isDefault: true }]);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Generate explanation for a language on demand ──────────────────────
  const fetchExplanation = useCallback(async (langCode: string) => {
    setLoadingLang(langCode);
    setErrorLang(null);
    try {
      const res = await axios.post(`${API}/explain`, {
        language: langCode, prTitle, codeLanguage, flows, stats, codeContext,
      });
      setExplanations(prev => ({ ...prev, [langCode]: res.data.explanation }));
    } catch {
      setErrorLang(langCode);
    } finally {
      setLoadingLang(null);
    }
  }, [prTitle, codeLanguage, flows, stats, codeContext]);

  const handleTabClick = (langCode: string) => {
    setActiveLang(langCode);
    // Client-side cache — only fetch if we don't already have it. Switching
    // tabs back and forth within the session never re-calls the API.
    if (!explanations[langCode]) {
      fetchExplanation(langCode);
    }
  };

  // Nothing to explain — skip rendering entirely, no API calls ever made
  if (!stats || stats.totalNodes === 0) return null;
  if (languages.length === 0 && !explanations.en) return null;

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      backgroundColor: 'var(--surface)',
      flexShrink: 0,
    }}>
      <div style={{
        padding: '8px 16px 4px', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)',
      }}>
        ✨ AI Explanation
      </div>

      {/* Language tabs — rendered dynamically from backend config */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 8px', flexWrap: 'wrap' }}>
        {languages.map(lang => (
          <button
            key={lang.code}
            onClick={() => handleTabClick(lang.code)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: `1px solid ${activeLang === lang.code ? 'var(--accent)' : 'var(--border)'}`,
              backgroundColor: activeLang === lang.code ? 'var(--accent)' : 'var(--btn-bg)',
              color: activeLang === lang.code ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {lang.nativeLabel}
          </button>
        ))}
      </div>

      {/* Explanation content */}
      <div style={{ padding: '0 16px 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
        {loadingLang === activeLang && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            ⏳ Generating explanation...
          </div>
        )}

        {errorLang === activeLang && loadingLang !== activeLang && (
          <div style={{ color: 'var(--mismatch)' }}>
            ⚠️ Couldn't generate explanation right now.{' '}
            <button
              onClick={() => fetchExplanation(activeLang)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13 }}
            >
              Retry
            </button>
          </div>
        )}

        {loadingLang !== activeLang && errorLang !== activeLang && explanations[activeLang] && (
          <p style={{ margin: 0 }}>{explanations[activeLang]}</p>
        )}

        {loadingLang !== activeLang && errorLang !== activeLang && !explanations[activeLang] && languages.length > 0 && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Click a language tab to generate the explanation.
          </div>
        )}
      </div>
    </div>
  );
}