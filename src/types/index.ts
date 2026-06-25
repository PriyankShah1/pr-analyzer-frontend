// src/types/index.ts
// All shared TypeScript interfaces and types

export interface AnalysisStats {
  totalNodes: number;
  totalEdges: number;
  mismatches: number;
  brokenDependencies?: number;
  deletedClasses?: number;
  staticCalls?: number;
  ormCalls?: number;
}

export interface AnalysisVisualization {
  nodes: any[];
  edges: any[];
  stats: AnalysisStats;
}

export interface AnalysisFlow {
  from: string;
  to: string;
  type?: string;
  returnType?: string;
  mismatch?: boolean;
  brokenDependency?: boolean;
  deletedSource?: boolean;
  message?: string;
  file?: string;
}

export interface AnalysisResponse {
  prTitle?:    string;
  prNumber?:   number;
  prAuthor?:   string;
  prState?:    string;
  prMerged?:   boolean;
  language?:   string; // code language: 'php' | 'javascript' | 'none'
  visualization?: AnalysisVisualization;
  flows?:         AnalysisFlow[];
  files?:         { filename: string; truncated: boolean }[];
  warnings?:      string[];
  message?:       string;
  fromCache?:     boolean;
  deletedClasses?: string[];
  codeContext?:    string;                  // real code snippets used for AI explanation
  aiExplanations?: Record<string, string>;  // langCode -> explanation text
}

export interface PRHistoryItem {
  id:          string;
  url:         string;
  label:       string;
  analyzedAt:  number;
  stats: {
    totalNodes: number;
    totalEdges: number;
    mismatches: number;
  };
  result: AnalysisResponse;
}

export type Theme = 'light' | 'dark';
export type SidebarPanel = 'analyze' | 'history';

// AI explanation language — fetched dynamically from GET /explain/languages,
// this type is intentionally loose (string) since the backend config is the
// single source of truth and can grow without frontend type changes.
export interface ExplanationLanguage {
  code: string;
  label: string;
  nativeLabel: string;
  isDefault: boolean;
}