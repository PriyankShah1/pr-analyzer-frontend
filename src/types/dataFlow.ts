// src/types/dataFlow.ts
// Types for Phase 6A/6B/6C data — variable bindings, usage tracing, and
// cross-component chains. Kept in a separate file since this is a distinct,
// fairly deep data shape from the rest of types/index.ts.

export interface OutputBinding {
  pattern: 'array_destructure' | 'object_destructure' | 'single' | 'none';
  names: string[];
}

export type UsageKind =
  | 'jsx_prop' | 'jsx_expression' | 'function_call'
  | 'condition' | 'assignment' | 'property_access';

export interface VariableUsage {
  line: string;
  kind: UsageKind;
  accessedProperty: string | null;
}

export interface CrossComponentHop {
  fromComponent: string;
  toComponent: string;
  propName: string;
  resolved: boolean;
  reason?: string;                    // present when resolved === false
  childLocalUsages?: VariableUsage[]; // present when resolved === true
  furtherHops?: CrossComponentHop[];  // present when resolved === true — recursive chain
  hopBlocked?: boolean;               // present when a cycle was detected
}

export interface EdgeDataFlowInfo {
  outputBinding?: OutputBinding;
  usagesByVar?: Record<string, VariableUsage[]>;
  crossComponentTrace?: Record<string, CrossComponentHop[]>;
}