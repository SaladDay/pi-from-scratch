import { fullRepo } from "./lesson-data";
import type {
  TraceCallFrame,
  TraceCase,
  TraceContext,
  TraceDebugFrame,
  TraceSource,
} from "./trace-types";

type SourceFile = TraceSource["file"];

type RuntimeState = {
  text: string;
  stopReason: string;
  toolCalls: unknown[];
  results: unknown[];
  ev: unknown;
  signalAborted: boolean;
  loop: number;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function source(file: SourceFile, needle: string, occurrence = 0): TraceSource {
  const matches = (fullRepo[file] ?? "")
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => entry.line.includes(needle));
  const match = occurrence < 0 ? matches.at(occurrence) : matches[occurrence];
  if (!match) throw new Error(`找不到调试源码：${file} / ${needle}`);
  return { file, line: match.number };
}

function sourceLabel(position: TraceSource): string {
  return (fullRepo[position.file] ?? "").split("\n")[position.line - 1]?.trim() || "step";
}

function functionName(file: SourceFile, line: number): string {
  if (file === "src/tui.ts") {
    if (line <= 54) return "Tui.prompt";
    if (line <= 60) return "Tui.setBusy";
    if (line <= 65) return "Tui.printText";
    if (line <= 70) return "Tui.printToolCall";
    if (line <= 75) return "Tui.printToolResult";
    return "Tui.printTurnEnd";
  }
  if (file === "src/cli.ts") return "onPrompt";
  if (file === "src/agent.ts") return line < 71 ? "compactContext" : "runAgent";
  if (file === "src/tools.ts") {
    if (line <= 31) return "truncateOutput";
    if (line <= 49) return "read_file.execute";
    if (line <= 69) return "write_file.execute";
    if (line <= 95) return "edit.execute";
    return "run_bash.execute";
  }
  if (line <= 91) return "contextToOpenAIMessages";
  if (line <= 139) return "handleSSELine";
  if (line <= 154) return "flushToolCalls";
  if (line <= 237) return "stream";
  if (line <= 252) return "buildAssistantMessage";
  return "buildToolResultMessage";
}

function callStack(position: TraceSource): TraceCallFrame[] {
  const frames: TraceCallFrame[] = [{ name: functionName(position.file, position.line), source: position }];
  if (position.file === "src/tui.ts" && position.line <= 54) return frames;
  if (position.file === "src/tui.ts") {
    frames.push({ name: "onPrompt", source: source("src/cli.ts", "for await (const ev of runAgent") });
    return frames;
  }
  if (position.file !== "src/cli.ts") {
    if (position.file === "src/agent.ts" && position.line < 71) {
      frames.push({ name: "runAgent", source: source("src/agent.ts", "await compactContext(model, context, signal)") });
    } else if (position.file !== "src/agent.ts") {
      frames.push({ name: "runAgent", source: source("src/agent.ts", "for await (const ev of stream") });
    }
    frames.push({ name: "onPrompt", source: source("src/cli.ts", "for await (const ev of runAgent") });
  }
  if (position.file === "src/cli.ts") {
    frames.push({ name: "Tui.prompt", source: source("src/tui.ts", "this.onPromptCb?.(text)") });
  }
  return frames;
}

function eventType(step: TraceCase["steps"][number]): string | undefined {
  return typeof step.event?.type === "string" ? step.event.type : undefined;
}

function nextStopReason(traceCase: TraceCase, start: number): string {
  for (let index = start; index < traceCase.steps.length; index += 1) {
    const event = traceCase.steps[index].event;
    if (event?.type === "turn_end" && typeof event.stopReason === "string") return event.stopReason;
    if (event?.type === "tool_result") break;
  }
  return "end_turn";
}

export function buildDebugFrames(traceCase: TraceCase): TraceDebugFrame[] {
  const frames: TraceDebugFrame[] = [];
  const first = traceCase.steps[0];
  if (!first) return frames;

  let context: TraceContext = clone(first.context);
  const state: RuntimeState = {
    text: "",
    stopReason: "end_turn",
    toolCalls: [],
    results: [],
    ev: null,
    signalAborted: false,
    loop: 1,
  };
  let sequence = 0;
  let toolPhaseStarted = false;
  let abortPrepared = false;

  const push = (
    file: SourceFile,
    needle: string,
    options: {
      occurrence?: number;
      label?: string;
      event?: Record<string, unknown>;
      variables?: Record<string, unknown>;
    } = {},
  ) => {
    const position = source(file, needle, options.occurrence ?? 0);
    const variables = {
      text: state.text,
      stopReason: state.stopReason,
      toolCalls: clone(state.toolCalls),
      results: clone(state.results),
      ev: clone(state.ev),
      "signal.aborted": state.signalAborted,
      "context.messages.length": context.messages.length,
      loop: state.loop,
      ...options.variables,
    };
    frames.push({
      id: `${traceCase.id}-${sequence++}`,
      label: options.label ?? sourceLabel(position),
      source: position,
      event: options.event ? clone(options.event) : undefined,
      context: clone(context),
      variables,
      callStack: callStack(position),
    });
  };

  const enterStream = () => {
    push("src/llm.ts", "const url =", { variables: { model: traceCase.model } });
    push("src/llm.ts", "const messages = contextToOpenAIMessages(context)");
    push("src/llm.ts", "const messages: object[] = []");
    if (context.systemPrompt) push("src/llm.ts", "if (context.systemPrompt)");
    for (const message of context.messages) {
      push("src/llm.ts", "for (const msg of context.messages)", { variables: { msg: message } });
      if (typeof (message as { content?: unknown }).content === "string") {
        push("src/llm.ts", "if (typeof msg.content === 'string')");
        push("src/llm.ts", "messages.push({ role: msg.role, content: msg.content })");
      } else {
        push("src/llm.ts", "const blocks = msg.content");
        if ((message as { role?: unknown }).role === "assistant") {
          push("src/llm.ts", "if (msg.role === 'assistant')");
          push("src/llm.ts", "const toolCalls: object[] = []");
          push("src/llm.ts", "let text = ''");
          for (const block of (message as { content: unknown[] }).content) {
            push("src/llm.ts", "for (const b of blocks)", { variables: { b: block } });
          }
          push("src/llm.ts", "messages.push({ role: 'assistant'");
        } else {
          for (const block of (message as { content: unknown[] }).content) {
            push("src/llm.ts", "for (const b of blocks)", { occurrence: -1, variables: { b: block } });
            if ((block as { type?: unknown }).type === "tool_result") {
              push("src/llm.ts", "messages.push({ role: 'tool'");
            }
          }
        }
      }
    }
    push("src/llm.ts", "return messages");
    push("src/llm.ts", "const body: Record<string, unknown>");
    push("src/llm.ts", "if (model.maxTokens)");
    if (["read-file", "edit-and-check", "tool-error"].includes(traceCase.id)) {
      push("src/llm.ts", "if (opts.tools?.length)");
    }
    push("src/llm.ts", "let response: Response");
    push("src/llm.ts", "response = await fetch(url");
    push("src/llm.ts", "if (!response.ok || !response.body)");
    push("src/llm.ts", "const reader = response.body.getReader()");
    push("src/llm.ts", "const decoder = new TextDecoder()");
    push("src/llm.ts", "let buf = ''");
    push("src/llm.ts", "let stopReason: 'end_turn'");
    push("src/llm.ts", "const toolCallBuffers = new Map");
    push("src/llm.ts", "while (true)");
    push("src/llm.ts", "const { done, value } = await reader.read()");
  };

  const enterAgentLoop = (firstLoop: boolean) => {
    if (firstLoop) {
      push("src/agent.ts", "const toolMap = new Map");
      push("src/agent.ts", "const toolDefs = tools.map");
    }
    push("src/agent.ts", "while (true)", { occurrence: -1 });
    push("src/agent.ts", "await compactContext(model, context, signal)");
    push("src/agent.ts", "if (signal?.aborted) return");
    push("src/agent.ts", "if (context.messages.length < COMPACT_THRESHOLD) return");
    state.text = "";
    push("src/agent.ts", "let text = ''");
    state.stopReason = "end_turn";
    push("src/agent.ts", "let stopReason: 'end_turn'");
    state.toolCalls = [];
    state.results = [];
    toolPhaseStarted = false;
    push("src/agent.ts", "const toolCalls:");
    push("src/agent.ts", "for await (const ev of stream");
    enterStream();
  };

  push("src/tui.ts", "const text = answer.trim()", { variables: { answer: traceCase.prompt } });
  push("src/tui.ts", "if (text)", { variables: { answer: traceCase.prompt } });
  push("src/tui.ts", "this.onPromptCb?.(text)", { variables: { text: traceCase.prompt } });
  push("src/cli.ts", "context.messages.push({ role: 'user', content: text })", { variables: { text: traceCase.prompt } });
  push("src/cli.ts", "tui.setBusy(true)");
  push("src/tui.ts", "this.busy = busy", { variables: { busy: true } });
  push("src/cli.ts", "const ctrl = new AbortController()");
  push("src/cli.ts", "tui.onAbort(() => ctrl.abort())");
  push("src/cli.ts", "for await (const ev of runAgent");
  enterAgentLoop(true);

  for (let stepIndex = 1; stepIndex < traceCase.steps.length; stepIndex += 1) {
    const step = traceCase.steps[stepIndex];
    const type = eventType(step);

    if (type === "assistant_text") {
      const delta = typeof step.event?.delta === "string" ? step.event.delta : "";
      state.ev = { type: "text_delta", delta };
      push("src/llm.ts", "buf += decoder.decode(value");
      push("src/llm.ts", "while ((nl = buf.indexOf" );
      push("src/llm.ts", "const line = buf.slice");
      push("src/llm.ts", "buf = buf.slice");
      push("src/llm.ts", "if (!line.startsWith('data: '))");
      push("src/llm.ts", "const data = line.slice(6)");
      push("src/llm.ts", "if (data === '[DONE]')");
      push("src/llm.ts", "const result = handleSSELine");
      push("src/llm.ts", "let chunk: OpenAIChunk");
      push("src/llm.ts", "const choice = chunk.choices[0]");
      push("src/llm.ts", "let textDelta: string | null");
      push("src/llm.ts", "if (choice.delta?.content)");
      push("src/llm.ts", "return { textDelta, stopReason }");
      push("src/llm.ts", "if (result.textDelta) yield", { event: { type: "text_delta", delta } });
      push("src/agent.ts", "if (ev.type === 'text_delta')");
      state.text += delta;
      push("src/agent.ts", "text += ev.delta");
      state.ev = step.event ?? null;
      push("src/agent.ts", "yield { type: 'assistant_text'", { event: step.event });
      push("src/cli.ts", "case 'assistant_text'", { event: step.event });
      push("src/tui.ts", "process.stdout.write(delta)", { event: step.event, variables: { delta } });
      continue;
    }

    if (type === "tool_call") {
      state.ev = step.event ?? null;
      push("src/llm.ts", "for (const tc of flushToolCalls");
      push("src/llm.ts", "const calls:");
      push("src/llm.ts", "for (const [, tc] of");
      push("src/llm.ts", "let args: unknown");
      push("src/llm.ts", "if (tc.argsBuf)");
      push("src/llm.ts", "calls.push({ id: tc.id");
      push("src/llm.ts", "return calls");
      push("src/llm.ts", "yield { type: 'tool_call'", { event: step.event });
      push("src/agent.ts", "else if (ev.type === 'tool_call')");
      state.toolCalls = [...state.toolCalls, clone(step.event)];
      push("src/agent.ts", "toolCalls.push({ id: ev.id");
      push("src/agent.ts", "yield { type: 'tool_call'", { event: step.event });
      push("src/cli.ts", "case 'tool_call'", { event: step.event });
      push("src/tui.ts", "process.stdout.write(`\\n[tool:", { event: step.event });
      continue;
    }

    if (step.kind === "context") {
      const latest = context.messages.length < step.context.messages.length
        ? step.context.messages.at(-1)
        : undefined;
      if (latest && (latest as { role?: string }).role === "assistant") {
        state.stopReason = state.toolCalls.length ? "tool_use" : nextStopReason(traceCase, stepIndex + 1);
        state.ev = { type: "done", stopReason: state.stopReason };
        if (state.stopReason === "aborted") {
          state.signalAborted = true;
          push("src/llm.ts", "if (opts.signal?.aborted) { yield", { occurrence: 0, event: state.ev as Record<string, unknown> });
          push("src/agent.ts", "else if (ev.type === 'done')");
          push("src/agent.ts", "stopReason = ev.stopReason");
          push("src/agent.ts", "if (ev.stopReason === 'aborted')");
        } else {
          push("src/llm.ts", "yield { type: 'done'", { event: state.ev as Record<string, unknown> });
          push("src/agent.ts", "else if (ev.type === 'done')");
          push("src/agent.ts", "stopReason = ev.stopReason");
        }
        push("src/llm.ts", "const content: ContentBlock[] = []");
        if (state.text) push("src/llm.ts", "if (text) content.push");
        for (const toolCall of state.toolCalls) {
          push("src/llm.ts", "for (const tc of toolCalls)", { variables: { tc: toolCall } });
          push("src/llm.ts", "content.push({ type: 'tool_use'", { variables: { tc: toolCall } });
        }
        context = clone(step.context);
        push("src/llm.ts", "return { role: 'assistant', content }");
        if (state.stopReason === "aborted") {
          push("src/agent.ts", "context.messages.push(buildAssistantMessage(text, []))");
          abortPrepared = true;
        } else {
          push("src/agent.ts", "context.messages.push(buildAssistantMessage(text, toolCalls))");
        }
      } else {
        push("src/agent.ts", "for (const tc of toolCalls.slice(results.length))");
        push("src/agent.ts", "context.messages.push(buildToolResultMessage(results))", { occurrence: -1 });
        push("src/llm.ts", "return {", { occurrence: -1 });
        context = clone(step.context);
        push("src/llm.ts", "content: results.map");
        push("src/agent.ts", "context.messages.push(buildToolResultMessage(results))", { occurrence: -1 });
        state.loop += 1;
        enterAgentLoop(false);
      }
      continue;
    }

    if (type === "tool_result") {
      if (!toolPhaseStarted) {
        push("src/agent.ts", "const reason = stopReason");
        push("src/agent.ts", "if (toolCalls.length === 0)");
        push("src/agent.ts", "const results:");
        toolPhaseStarted = true;
      }
      const name = typeof step.event?.name === "string" ? step.event.name : "tool";
      const args = (state.toolCalls.find((item) => (
        item && typeof item === "object" && (item as { id?: unknown }).id === step.event?.id
      )) as { args?: unknown } | undefined)?.args;
      push("src/agent.ts", "for (const tc of toolCalls)", { variables: { tc: { name, args } } });
      push("src/agent.ts", "const tool = toolMap.get(tc.name)", { variables: { tool: name } });
      push("src/agent.ts", "let result: string");
      push("src/agent.ts", "try {", { occurrence: -1 });
      push("src/agent.ts", "result = await tool.execute", { variables: { args } });

      if (name === "read_file") {
        push("src/tools.ts", "const { path: filePath }", { occurrence: 0, variables: { args } });
        push("src/tools.ts", "const content = await fs.readFile", { variables: { filePath: (args as { path?: unknown })?.path } });
        push("src/tools.ts", "return await truncateOutput(content)");
        push("src/tools.ts", "const lines = content.split");
        push("src/tools.ts", "if (lines.length <= maxLines) return content");
      } else if (name === "edit") {
        push("src/tools.ts", "const { path: filePath, old_string, new_string }", { variables: { args } });
        push("src/tools.ts", "const content = await fs.readFile", { occurrence: 1 });
        push("src/tools.ts", "const count = content.split(old_string)");
        push("src/tools.ts", "if (count === 0)");
        push("src/tools.ts", "if (count > 1)");
        push("src/tools.ts", "const newContent = content.replace");
        push("src/tools.ts", "await fs.writeFile(filePath, newContent");
        push("src/tools.ts", "return `edited ${filePath}");
      } else {
        push("src/agent.ts", "catch (e)", { occurrence: -1 });
        push("src/agent.ts", "result = `error:", { occurrence: -1 });
      }

      state.ev = step.event ?? null;
      state.results = [...state.results, {
        tool_use_id: step.event?.id,
        content: step.event?.result,
      }];
      push("src/agent.ts", "results.push({ tool_use_id:", { event: step.event });
      push("src/agent.ts", "yield { type: 'tool_result'", { occurrence: -1, event: step.event });
      push("src/cli.ts", "case 'tool_result'", { event: step.event });
      push("src/tui.ts", "process.stdout.write(`[result:", { event: step.event });
      continue;
    }

    if (type === "turn_end") {
      const reason = typeof step.event?.stopReason === "string" ? step.event.stopReason : "end_turn";
      state.stopReason = reason;
      state.ev = step.event ?? null;
      if (reason === "aborted") {
        state.signalAborted = true;
        if (!abortPrepared) {
          push("src/llm.ts", "if (opts.signal?.aborted) { yield", { occurrence: 0, event: { type: "done", stopReason: "aborted" } });
          push("src/agent.ts", "else if (ev.type === 'done')");
          push("src/agent.ts", "stopReason = ev.stopReason");
          push("src/agent.ts", "if (ev.stopReason === 'aborted')");
          context = clone(step.context);
          push("src/agent.ts", "context.messages.push(buildAssistantMessage(text, []))");
        }
        push("src/agent.ts", "yield { type: 'turn_end', stopReason: 'aborted'", { event: step.event });
        push("src/agent.ts", "return", { occurrence: 3 });
      } else {
        push("src/agent.ts", "const reason = stopReason");
        push("src/agent.ts", "if (toolCalls.length === 0)");
        push("src/agent.ts", "yield { type: 'turn_end', stopReason: reason", { event: step.event });
        push("src/agent.ts", "return", { occurrence: 5 });
      }
      push("src/cli.ts", "case 'turn_end'", { event: step.event });
      if (reason === "max_tokens") push("src/cli.ts", "if (ev.stopReason === 'max_tokens')");
      if (reason === "error") push("src/cli.ts", "if (ev.stopReason === 'error')");
      push("src/cli.ts", "tui.printTurnEnd()");
      push("src/tui.ts", "process.stdout.write('\\n')", { event: step.event });
      push("src/cli.ts", "await persistSession(context.messages)");
      push("src/cli.ts", "tui.setBusy(false)");
      push("src/tui.ts", "this.busy = busy", { variables: { busy: false } });
      push("src/tui.ts", "if (!busy) this.prompt()", { variables: { busy: false } });
    }
  }

  return frames;
}
