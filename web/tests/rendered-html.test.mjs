import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  return readFile(new URL("../.next-test/server/app/index.html", import.meta.url), "utf8");
}

test("server-renders the preface as the entry", async () => {
  const html = await render();
  assert.match(html, /<html[^>]*lang="zh-CN"/i);
  assert.match(html, /<title>PI from Scratch · 创造属于你的pi-agent<\/title>/i);
  assert.match(html, /先导/);
  assert.match(html, /nano-pi/);
  assert.match(html, /催一下/);
  assert.match(html, /次催更留在了这里/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps lesson content generated from the teaching sources", async () => {
  const [generated, reader, nudgeCounter, lessonData, traceLab, traceDebugger, traceData, layout, styles, page, packageJson] = await Promise.all([
    readFile(new URL("../app/content.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/Reader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/NudgeCounter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lesson-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/TraceLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/trace-debugger.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/trace-data.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(generated, /checkpoint: pseudo-loop/);
  assert.match(generated, /checkpoint: cli-session/);
  assert.match(generated, /src\/agent\.ts/);
  assert.match(reader, /data-checkpoint/);
  assert.match(reader, /<div class="checkpoint-anchor"/);
  assert.doesNotMatch(reader, /<span class="checkpoint-anchor"/);
  assert.match(reader, /hasSelectedFile/);
  assert.match(reader, /code-tabs/);
  assert.match(reader, /handleCloseFile/);
  assert.match(reader, /codeScrollRefs/);
  assert.match(reader, /data-viewport-pinned/);
  assert.match(reader, /positions\.get\(selectedFile\)/);
  assert.match(reader, /selectionCauseRef/);
  assert.match(reader, /editor-lock/);
  assert.match(reader, /navigationLocked/);
  assert.match(generated, /nudge-counter/);
  assert.match(reader, /<NudgeCounter \/>/);
  assert.match(nudgeCounter, /countapi\.mileshilliard\.com\/api\/v1/);
  assert.match(nudgeCounter, /operation = increment \? "hit" : "get"/);
  assert.match(nudgeCounter, /bellRef\.current\?\.animate/);
  assert.doesNotMatch(nudgeCounter, /key=\{burst\}/);
  assert.match(styles, /\.nudge-button/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 118px/);
  assert.match(lessonData, /"src\/llm\.ts": "", "src\/agent\.ts": ""/);
  assert.match(lessonData, /initialRepo: emptyRepo/);
  assert.match(lessonData, /chapter2Repo/);
  assert.match(reader, /pi-from-scratch-theme/);
  assert.match(reader, /prefers-color-scheme: dark/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(reader, /className="theme-toggle"/);
  assert.match(reader, />trace 跟踪<\/button>/);
  assert.match(traceLab, /toggleBreakpoint/);
  assert.match(traceLab, /has-breakpoint/);
  assert.match(traceLab, /continueToBreakpoint/);
  assert.match(traceLab, /trace-prompt-panel/);
  assert.match(traceLab, /"src\/tui\.ts"/);
  assert.doesNotMatch(traceLab, /trace-page-heading/);
  assert.doesNotMatch(traceLab, /trace-step-list/);
  assert.match(traceDebugger, /buildDebugFrames/);
  assert.match(traceDebugger, /CallFrame|callStack/);
  assert.match(traceData, /"model": "glm-5\.2"/);
  assert.match(traceData, /"liveGenerated": true/);
  assert.equal((traceData.match(/"number": "0[1-6]"/g) ?? []).length, 6);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(styles, /--breakpoint:/);
  assert.match(page, /<NanopiSite \/>/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
