export type TraceSource = {
  file: "src/llm.ts" | "src/agent.ts" | "src/tools.ts" | "src/tui.ts" | "src/cli.ts";
  line: number;
};

export type TraceContext = {
  systemPrompt?: string;
  messages: unknown[];
};

export type TraceStep = {
  id: string;
  label: string;
  detail: string;
  kind: "input" | "stream" | "context" | "tool" | "end" | "error";
  source: TraceSource;
  event?: Record<string, unknown>;
  context: TraceContext;
};

export type TraceCallFrame = {
  name: string;
  source: TraceSource;
};

export type TraceDebugFrame = {
  id: string;
  label: string;
  source: TraceSource;
  event?: Record<string, unknown>;
  context: TraceContext;
  variables: Record<string, unknown>;
  callStack: TraceCallFrame[];
};

export type TraceCase = {
  id: string;
  number: string;
  title: string;
  summary: string;
  prompt: string;
  model: string;
  outcome: string;
  steps: TraceStep[];
};

export type TraceMeta = {
  model: string;
  generatedAt: string;
  liveGenerated: boolean;
};
