// src/hooks/useAnalyze.ts
// All API call logic — extracted from App.tsx

import { useState } from 'react';
import axios from 'axios';
import type { AnalysisResponse } from '../types';

const API = import.meta.env.VITE_API_URL;

export function useAnalyze() {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result,   setResult]   = useState<AnalysisResponse | null>(null);

  const analyze = async (url: string, token?: string): Promise<AnalysisResponse | null> => {
    setLoading(true);
    setError(null);
    setResult(null);
    setWarnings([]);

    try {
      const response = await axios.post(`${API}/analyze`, {
        url,
        token: token?.trim() || undefined,
      });

      setResult(response.data);
      setWarnings(response.data.warnings || []);
      return response.data;

    } catch (err: any) {
      const hasToken = !!token?.trim();
      let msg = 'Failed to analyze PR';

      if (err.response?.status === 429)
        msg = `Too many requests. Wait ${err.response.data.retryAfter}s.`;
      else if (err.response?.status === 404)
        msg = 'PR not found. Check the URL and verify repo access.';
      else if (err.response?.status === 401)
        msg = hasToken
          ? 'Token rejected — may be expired or missing repo scope.'
          : 'Auth failed. This may be a private repo — add your token.';
      else if (err.response?.status === 403)
        msg = 'Access forbidden. Check repo permissions or rate limits.';
      else if (err.response?.status === 422)
        msg = err.response.data.error || 'PR is too large to analyze.';
      else if (err.code === 'ERR_NETWORK')
        msg = 'Cannot reach backend. Please try again in a moment.';
      else
        msg = err.response?.data?.error || err.message || msg;

      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setError(null);
    setResult(null);
    setWarnings([]);
  };

  return { loading, error, warnings, result, analyze, reset, setResult, setError, setWarnings };
}