import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the module map as the entry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="zh-CN"/i);
  assert.match(html, /<title>PI from Scratch · 从零手写 Coding Agent<\/title>/i);
  assert.match(html, /模块地图/);
  assert.match(html, /先导/);
  assert.match(html, /nano-pi/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps lesson content generated from the teaching sources", async () => {
  const [generated, reader, lessonData, traceLab, traceDebugger, traceData, layout, styles, page, packageJson] = await Promise.all([
    readFile(new URL("../app/content.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/Reader.tsx", import.meta.url), "utf8"),
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
  assert.match(lessonData, /"src\/llm\.ts": "", "src\/agent\.ts": ""/);
  assert.match(lessonData, /initialRepo: emptyRepo/);
  assert.match(lessonData, /chapter2Repo/);
  assert.match(layout, /pi-from-scratch-theme/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(reader, /className="theme-toggle"/);
  assert.match(reader, />trace跟踪<\/button>/);
  assert.match(traceLab, /toggleBreakpoint/);
  assert.match(traceLab, /has-breakpoint/);
  assert.match(traceLab, /continueToBreakpoint/);
  assert.match(traceLab, /trace-prompt-panel/);
  assert.match(traceLab, /"src\/tui\.ts"/);
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
