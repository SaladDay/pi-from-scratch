"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import {
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Folder,
  Play,
  RotateCcw,
} from "lucide-react";
import { fullRepo } from "./lesson-data";
import { traceCases } from "./trace-data.generated";
import { buildDebugFrames } from "./trace-debugger";
import type { TraceSource } from "./trace-types";

if (!hljs.getLanguage("typescript")) hljs.registerLanguage("typescript", typescript);

const sourceOrder: TraceSource["file"][] = [
  "src/cli.ts",
  "src/agent.ts",
  "src/llm.ts",
  "src/tools.ts",
  "src/tui.ts",
];

function highlightLine(line: string): string {
  if (!line) return "&nbsp;";
  return hljs.highlight(line, { language: "typescript", ignoreIllegals: true }).value;
}

function breakpointKey(source: TraceSource): string {
  return `${source.file}:${source.line}`;
}

function formatDebugValue(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

export default function TraceLab() {
  const [caseIndex, setCaseIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedFile, setSelectedFile] = useState<TraceSource["file"]>("src/tui.ts");
  const codeScrollRef = useRef<HTMLDivElement>(null);

  const traceCase = traceCases[caseIndex] ?? null;
  const debugFrames = useMemo(() => traceCase ? buildDebugFrames(traceCase) : [], [traceCase]);
  const frame = debugFrames[frameIndex] ?? null;
  const sourceCode = fullRepo[selectedFile] ?? "";
  const sourceLines = useMemo(() => sourceCode.split("\n"), [sourceCode]);
  const executableLines = useMemo(() => new Set(
    debugFrames
      .filter((item) => item.source.file === selectedFile)
      .map((item) => item.source.line),
  ), [debugFrames, selectedFile]);

  const selectCase = (nextIndex: number) => {
    setCaseIndex(nextIndex);
    setFrameIndex(0);
    const first = traceCases[nextIndex] ? buildDebugFrames(traceCases[nextIndex])[0] : null;
    if (first) setSelectedFile(first.source.file);
  };

  const goToFrame = (next: number) => {
    if (!debugFrames.length) return;
    const bounded = Math.max(0, Math.min(debugFrames.length - 1, next));
    setFrameIndex(bounded);
    setSelectedFile(debugFrames[bounded].source.file);
  };

  const continueToBreakpoint = () => {
    if (!debugFrames.length || frameIndex >= debugFrames.length - 1) return;
    const nextHit = debugFrames.findIndex((item, index) => (
      index > frameIndex && breakpoints.has(breakpointKey(item.source))
    ));
    goToFrame(nextHit >= 0 ? nextHit : debugFrames.length - 1);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key === "F10") {
        event.preventDefault();
        goToFrame(frameIndex + 1);
      } else if (event.key === "F5") {
        event.preventDefault();
        continueToBreakpoint();
      } else if (!target?.closest("button, a") && event.key === "ArrowRight") {
        event.preventDefault();
        goToFrame(frameIndex + 1);
      } else if (!target?.closest("button, a") && event.key === "ArrowLeft") {
        event.preventDefault();
        goToFrame(frameIndex - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useLayoutEffect(() => {
    const scroller = codeScrollRef.current;
    if (!scroller || !frame || selectedFile !== frame.source.file) return;
    const line = scroller.querySelector<HTMLElement>(`[data-trace-line="${frame.source.line}"]`);
    if (!line) return;
    scroller.scrollTo({
      top: Math.max(0, line.offsetTop - scroller.clientHeight * 0.38),
      behavior: "auto",
    });
  }, [frame, selectedFile]);

  const toggleBreakpoint = (line: number) => {
    if (!executableLines.has(line)) return;
    const key = breakpointKey({ file: selectedFile, line });
    setBreakpoints((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!traceCase || !frame) {
    return (
      <main className="trace-shell trace-empty">
        <h1>trace跟踪</h1>
        <p>trace 尚未生成。</p>
      </main>
    );
  }

  const eventJson = frame.event ? JSON.stringify(frame.event, null, 2) : null;
  const progress = ((frameIndex + 1) / debugFrames.length) * 100;

  return (
    <main className="trace-shell">
      <header className="trace-page-heading">
        <strong>trace跟踪</strong>
        <span>点击行号设置断点</span>
      </header>

      <section className="trace-workspace">
        <nav className="trace-case-sidebar" aria-label="trace 案例">
          <header className="trace-pane-heading">
            <strong>cases</strong>
            <span>{traceCases.length}</span>
          </header>
          <div className="trace-case-list">
            {traceCases.map((item, index) => (
              <button
                key={item.id}
                className={index === caseIndex ? "is-active" : ""}
                onClick={() => selectCase(index)}
              >
                <span>{item.number}</span>
                {item.title}
              </button>
            ))}
          </div>
        </nav>

        <div className="trace-code-pane">
          <header className="trace-pane-heading">
            <strong>nanopi /</strong>
            <span>{selectedFile}</span>
          </header>
          <div className="trace-repo-workspace">
            <nav className="trace-file-tree" aria-label="trace 源文件">
              <div className="tree-root"><Folder size={14} /> src</div>
              {sourceOrder.map((file) => (
                <button
                  key={file}
                  className={selectedFile === file ? "is-active" : ""}
                  onClick={() => setSelectedFile(file)}
                >
                  <FileCode2 size={14} />
                  <span>{file.replace("src/", "")}</span>
                </button>
              ))}
            </nav>
            <div className="trace-source-stage">
              <div className="code-tab"><FileCode2 size={13} />{selectedFile.replace("src/", "")}</div>
              <div className="trace-code-scroll" ref={codeScrollRef}>
                {sourceLines.map((line, index) => {
                  const lineNumber = index + 1;
                  const lineSource = { file: selectedFile, line: lineNumber };
                  const hasBreakpoint = breakpoints.has(breakpointKey(lineSource));
                  const isExecutable = executableLines.has(lineNumber);
                  const isCurrent = selectedFile === frame.source.file && lineNumber === frame.source.line;
                  return (
                    <div
                      className={`trace-code-line ${isCurrent ? "is-current" : ""} ${isExecutable ? "is-executable" : ""}`}
                      data-trace-line={lineNumber}
                      key={`${lineNumber}-${line}`}
                    >
                      <button
                        className={hasBreakpoint ? "has-breakpoint" : ""}
                        onClick={() => toggleBreakpoint(lineNumber)}
                        disabled={!isExecutable}
                        aria-label={`${hasBreakpoint ? "移除" : "设置"} ${selectedFile} 第 ${lineNumber} 行断点`}
                      >
                        {lineNumber}
                      </button>
                      <code dangerouslySetInnerHTML={{ __html: highlightLine(line) }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <aside className="trace-inspector" aria-label="当前 trace 状态">
          <header className="trace-pane-heading">
            <strong>{String(frameIndex + 1).padStart(2, "0")} / {String(debugFrames.length).padStart(2, "0")}</strong>
            <span>{frame.source.file}:{frame.source.line}</span>
          </header>

          <section className="trace-prompt-panel">
            <h3>prompt</h3>
            <p>{traceCase.prompt}</p>
          </section>

          <div className="trace-inspector-scroll">
            <section className="trace-variable-panel" aria-live="polite">
              <header><h3>Core State</h3><span>{frame.label}</span></header>
              <dl>
                {Object.entries(frame.variables).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd><pre>{formatDebugValue(value)}</pre></dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="trace-stack-panel">
              <h3>Call Stack</h3>
              {frame.callStack.map((item, index) => (
                <button key={`${item.name}-${index}`} onClick={() => setSelectedFile(item.source.file)}>
                  <span>{item.name}</span>
                  <i>{item.source.file}:{item.source.line}</i>
                </button>
              ))}
            </section>

            {eventJson && (
              <section className="trace-event-panel">
                <h3>Event</h3>
                <pre>{eventJson}</pre>
              </section>
            )}

            <section className="trace-context-panel">
              <header><h3>Context</h3><span>{frame.context.messages.length} messages</span></header>
              {frame.context.systemPrompt && (
                <article className="trace-message trace-system-message">
                  <span>system</span>
                  <pre>{frame.context.systemPrompt}</pre>
                </article>
              )}
              {frame.context.messages.map((message, index) => (
                <article className="trace-message" key={`${frame.id}-${index}`}>
                  <span>message {index + 1}</span>
                  <pre>{JSON.stringify(message, null, 2)}</pre>
                </article>
              ))}
            </section>
          </div>
        </aside>

        <footer className="trace-controls">
          <div className="trace-control-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          <button onClick={() => goToFrame(0)} aria-label="重新开始"><RotateCcw size={15} /></button>
          <button onClick={() => goToFrame(frameIndex - 1)} disabled={frameIndex === 0} aria-label="上一步"><ChevronLeft size={17} /></button>
          <button
            className="trace-play"
            onClick={continueToBreakpoint}
            disabled={frameIndex === debugFrames.length - 1}
            aria-label="继续到下一个断点"
          >
            <Play size={16} />
          </button>
          <button
            onClick={() => goToFrame(frameIndex + 1)}
            disabled={frameIndex === debugFrames.length - 1}
            aria-label="单步执行"
          >
            <ChevronRight size={17} />
          </button>
          <span>F5 继续 · F10 单步</span>
        </footer>
      </section>
    </main>
  );
}
