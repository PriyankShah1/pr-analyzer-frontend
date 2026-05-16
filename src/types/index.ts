// src/types/index.ts
// All shared TypeScript interfaces and types

export interface AnalysisStats {
  totalNodes: number;
  totalEdges: number;
  mismatches: number;
  brokenDependencies?: number;
  deletedClasses?: number;
  staticCalls?: number;
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
  visualization?: AnalysisVisualization;
  flows?:         AnalysisFlow[];
  files?:         { filename: string; truncated: boolean }[];
  warnings?:      string[];
  message?:       string;
  fromCache?:     boolean;
  deletedClasses?: string[];
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