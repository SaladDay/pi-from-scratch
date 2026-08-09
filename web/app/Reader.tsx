"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import {
  Check,
  Code2,
  FileCode2,
  Folder,
  Menu,
  Moon,
  PanelRightOpen,
  Sun,
  X,
} from "lucide-react";
import { fullRepo, lessons, type Lesson } from "./lesson-data";
import TraceLab from "./TraceLab";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);

type Screen = Lesson["id"] | "trace";

const figureDimensions: Record<string, [number, number]> = {
  "/figures/agent-data-flow.png": [1536, 1024],
  "/figures/agent-loop.png": [1536, 1024],
  "/figures/event-consumers.png": [1536, 1024],
  "/figures/full-roundtrip.png": [1536, 1024],
  "/figures/module-architecture.png": [1536, 1024],
  "/figures/task-sequence.png": [1774, 887],
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(markdown: string): string {
  const withAnchors = markdown
    .replace(
      /<!--\s*checkpoint:\s*([a-z0-9-]+)\s*-->/g,
      '<div class="checkpoint-anchor" data-checkpoint="$1" aria-hidden="true"></div>',
    )
    .replace(/^\[图：(.*)\]$/gm, (_, caption: string) => {
      return `<figure class="concept-figure"><div class="concept-mark"><span></span><span></span><span></span></div><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
    });

  const renderer = new marked.Renderer();
  renderer.code = ({ text, lang }) => {
    const language = lang && hljs.getLanguage(lang) ? lang : "typescript";
    const highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value;
    return `<pre class="article-code" data-language="${escapeHtml(lang || "code")}"><code>${highlighted}</code></pre>`;
  };
  renderer.link = ({ href, title, tokens }) => {
    const text = renderer.parser.parseInline(tokens);
    const external = /^https?:\/\//.test(href);
    const attrs = external ? ' target="_blank" rel="noreferrer"' : "";
    return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}${attrs}>${text}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const caption = escapeHtml(text);
    const [width, height] = figureDimensions[href] ?? [1536, 1024];
    return `<figure class="lesson-figure"><img src="${escapeHtml(href)}" alt="${caption}" width="${width}" height="${height}"${title ? ` title="${escapeHtml(title)}"` : ""} loading="lazy" decoding="async"><figcaption>${caption}</figcaption></figure>`;
  };

  return marked.parse(withAnchors, { gfm: true, renderer }) as string;
}

const ArticleBody = memo(function ArticleBody({ html }: { html: string }) {
  return <div className="article-body" dangerouslySetInnerHTML={{ __html: html }} />;
});

function addedLines(previous: string, current: string): Set<number> {
  const before = previous.split("\n");
  const after = current.split("\n");
  if (!previous) return new Set(after.map((_, index) => index + 1));

  const matrix = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let i = 1; i <= before.length; i += 1) {
    for (let j = 1; j <= after.length; j += 1) {
      matrix[i][j] = before[i - 1] === after[j - 1]
        ? matrix[i - 1][j - 1] + 1
        : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    }
  }

  const matched = new Set<number>();
  let i = before.length;
  let j = after.length;
  while (i > 0 && j > 0) {
    if (before[i - 1] === after[j - 1]) {
      matched.add(j);
      i -= 1;
      j -= 1;
    } else if (matrix[i - 1][j] >= matrix[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return new Set(after.map((_, index) => index + 1).filter((line) => !matched.has(line)));
}

function highlightedLine(line: string): string {
  if (!line) return "&nbsp;";
  return hljs.highlight(line, { language: "typescript", ignoreIllegals: true }).value;
}

function Header({ screen, navigate }: { screen: Screen; navigate: (screen: Screen) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystemTheme = (event: MediaQueryListEvent) => {
      let savedTheme: string | null = null;
      try {
        savedTheme = localStorage.getItem("pi-from-scratch-theme");
      } catch {
        savedTheme = null;
      }
      if (savedTheme) return;
      const theme = event.matches ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    };

    media.addEventListener("change", followSystemTheme);
    return () => media.removeEventListener("change", followSystemTheme);
  }, []);

  const go = (next: Screen) => {
    setMenuOpen(false);
    navigate(next);
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    try {
      localStorage.setItem("pi-from-scratch-theme", next);
    } catch {
      return;
    }
  };

  return (
    <header className="site-header">
      <button className="brand" onClick={() => go("chapter1")} aria-label="返回模块地图">
        <span className="brand-mark">π</span>
        <strong>PI from Scratch</strong>
      </button>
      <nav className={`chapter-nav ${menuOpen ? "is-open" : ""}`} aria-label="课程章节">
        <button className={screen === "chapter1" ? "is-active" : ""} onClick={() => go("chapter1")}>模块地图</button>
        <button className={screen === "chapter2" ? "is-active" : ""} onClick={() => go("chapter2")}>nano-pi</button>
        <button className={screen === "trace" ? "is-active" : ""} onClick={() => go("trace")}>trace跟踪</button>
      </nav>
      <div className="header-actions">
        <a
          className="repo-link"
          href="https://github.com/SaladDay/pi-from-scratch"
          target="_blank"
          rel="noreferrer"
          aria-label="打开 GitHub 仓库"
          title="GitHub"
        >
          <Code2 size={16} />
        </a>
        <button className="theme-toggle" onClick={toggleTheme} aria-label="切换浅色或深色模式" title="切换显示模式">
          <Moon className="theme-icon theme-icon-moon" size={16} />
          <Sun className="theme-icon theme-icon-sun" size={16} />
        </button>
        <button
          className="menu-button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "关闭章节菜单" : "打开章节菜单"}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
    </header>
  );
}

function CodePanel({
  lesson,
  activeIndex,
  panelRef,
}: {
  lesson: Lesson;
  activeIndex: number;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const checkpoint = activeIndex >= 0 ? lesson.checkpoints[activeIndex] : null;
  const previous = activeIndex > 0 ? lesson.checkpoints[activeIndex - 1] : null;
  const initialRepo = lesson.initialRepo ?? {};
  const repo = checkpoint?.repo ?? initialRepo;
  const [fileChoice, setFileChoice] = useState<{ checkpointId: string; file: string } | null>(null);
  const [suppressedAnimationPhases, setSuppressedAnimationPhases] = useState<ReadonlySet<string>>(() => new Set());
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef(new Map<string, { top: number; left: number }>());

  const files = Object.keys(repo);
  const previousRepo = previous?.repo ?? initialRepo;
  const newFiles = new Set(files.filter((file) => !(file in previousRepo)));
  const phaseId = checkpoint?.id ?? "initial";
  const selectedFile = fileChoice && fileChoice.checkpointId === phaseId && fileChoice.file in repo
    ? fileChoice.file
    : checkpoint?.file ?? files[0] ?? "";
  const hasSelectedFile = selectedFile in repo;
  const code = selectedFile ? repo[selectedFile] ?? "" : "";
  const previousCode = previousRepo[selectedFile] ?? "";
  const selectedKey = `${phaseId}:${selectedFile}`;
  const shouldAnimate = Boolean(
    checkpoint
    && selectedFile === checkpoint.file
    && !suppressedAnimationPhases.has(phaseId),
  );
  const changed = (() => {
    if (!checkpoint || selectedFile !== checkpoint.file) return new Set<number>();
    if (checkpoint.focus) {
      const [start, end] = checkpoint.focus;
      return new Set(Array.from({ length: end - start + 1 }, (_, index) => start + index));
    }
    return addedLines(previousCode, code);
  })();
  const changedOrder = new Map(Array.from(changed).sort((a, b) => a - b).map((line, index) => [line, index]));
  const currentFileIsNew = newFiles.has(selectedFile);
  const writeLead = currentFileIsNew ? 820 : 120;

  const focusLine = changed.size ? Math.min(...changed) : 1;
  useLayoutEffect(() => {
    const container = codeScrollRef.current;
    if (!container || !selectedFile) return;
    const positions = scrollPositionsRef.current;

    const saved = positions.get(selectedKey);
    if (saved) {
      container.scrollTo({ top: saved.top, left: saved.left, behavior: "auto" });
    } else if (checkpoint && selectedFile === checkpoint.file && code) {
      const target = container.querySelector<HTMLElement>(`[data-line="${focusLine}"]`);
      if (target) {
        container.scrollTo({
          top: Math.max(0, target.offsetTop - container.clientHeight * 0.28),
          left: 0,
          behavior: "auto",
        });
      }
    }

    return () => {
      positions.set(selectedKey, {
        top: container.scrollTop,
        left: container.scrollLeft,
      });
    };
  }, [checkpoint, code, focusLine, selectedFile, selectedKey]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const keepWheelInsideIde = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      const target = event.target instanceof Element ? event.target : null;
      const scroller = target?.closest<HTMLElement>(".code-scroll, .file-tree");
      const canScroll = scroller
        && (scroller.scrollHeight > scroller.clientHeight || scroller.scrollWidth > scroller.clientWidth);

      // Let scrollable IDE surfaces use the browser's native trackpad/wheel
      // physics. Only swallow wheel input over non-scrollable IDE chrome so it
      // never leaks through to the article behind it.
      if (!canScroll) event.preventDefault();
    };

    panel.addEventListener("wheel", keepWheelInsideIde, { passive: false });
    return () => panel.removeEventListener("wheel", keepWheelInsideIde);
  }, [panelRef]);

  return (
    <aside className="code-panel" ref={panelRef} aria-label="随阅读演进的代码仓库">
      <div className="panel-heading">
        <strong>nanopi /</strong>
        <span>{checkpoint?.label ?? "editor"}</span>
      </div>
      <div className="repo-workspace">
        <nav className="file-tree" aria-label="仓库文件">
          <div className="tree-root"><Folder size={14} /> src</div>
          {files.length ? files.map((file) => {
            const name = file.replace("src/", "");
            const complete = fullRepo[file] === repo[file];
            const isNewFile = newFiles.has(file);
            return (
              <button
                key={file}
                className={`${selectedFile === file ? "is-active" : ""} ${isNewFile ? "is-new-file" : ""}`}
                onClick={() => {
                  setSuppressedAnimationPhases((phases) => {
                    const next = new Set(phases);
                    next.add(phaseId);
                    return next;
                  });
                  setFileChoice({ checkpointId: phaseId, file });
                }}
                title={file}
              >
                <FileCode2 size={14} />
                <span>{name}</span>
                {complete && <Check size={12} className="file-check" aria-label="已完成" />}
              </button>
            );
          }) : <p className="empty-tree">空目录</p>}
        </nav>
        <div className="code-stage">
          {hasSelectedFile ? (
            <>
              <div className="code-tab"><FileCode2 size={13} />{selectedFile.replace("src/", "")}</div>
              <div className="code-scroll" ref={codeScrollRef} key={`${phaseId}-${selectedFile}`}>
                {code.split("\n").map((line, index) => {
                  const lineNumber = index + 1;
                  const isChanged = changed.has(lineNumber);
                  const isEntering = isChanged && shouldAnimate;
                  const writeIndex = changedOrder.get(lineNumber) ?? 0;
                  const writeDelay = writeLead + Math.min(writeIndex * 28, 900);
                  const writeDuration = Math.min(640, Math.max(260, line.length * 10));
                  return (
                    <div
                      className={`code-line ${isChanged ? "is-new" : ""} ${isEntering ? "is-entering" : ""}`}
                      data-line={lineNumber}
                      key={`${lineNumber}-${line}`}
                      style={isEntering ? ({
                        "--write-delay": `${writeDelay}ms`,
                        "--write-duration": `${writeDuration}ms`,
                      } as React.CSSProperties) : undefined}
                    >
                      <span className="line-number">{lineNumber}</span>
                      <code dangerouslySetInnerHTML={{ __html: highlightedLine(line) }} />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-code">
              <Code2 size={20} />
              <strong>仓库还是空的</strong>
              <p>读到第一个 checkpoint，代码才会出现。</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Reader({ lesson, navigate }: { lesson: Lesson; navigate: (screen: Screen) => void }) {
  const articleRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const html = useMemo(() => renderMarkdown(lesson.markdown), [lesson.markdown]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const article = articleRef.current;
      if (!article) return;
      const anchors = Array.from(article.querySelectorAll<HTMLElement>("[data-checkpoint]"));
      const readingLine = window.innerHeight * 0.42;
      let next = -1;
      anchors.forEach((anchor) => {
        if (anchor.getBoundingClientRect().top <= readingLine) {
          const index = lesson.checkpoints.findIndex((item) => item.id === anchor.dataset.checkpoint);
          if (index >= 0) next = index;
        }
      });
      setActiveIndex(next);

      const rect = article.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight * 0.55);
      const progress = Math.min(1, Math.max(0, (-rect.top + 72) / travel));
      if (progressRef.current) progressRef.current.style.width = `${progress * 100}%`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [lesson]);

  const nextScreen: Screen = lesson.id === "chapter1" ? "chapter2" : "trace";
  const nextLabel = lesson.id === "chapter1" ? "进入 nano-pi" : "进入 trace跟踪";
  const completion = lesson.id === "chapter1"
    ? Math.round(((Math.max(0, activeIndex) + 1) / lesson.checkpoints.length) * 100)
    : activeIndex < 0 ? 0 : Math.round(((activeIndex + 1) / lesson.checkpoints.length) * 100);

  return (
    <main className="reader-shell">
      <div className="reading-progress" aria-hidden="true"><span ref={progressRef} /></div>
      <section className="reader-grid">
        <article className="lesson-column" ref={articleRef}>
          <header className="lesson-header">
            <p className="eyebrow">{lesson.number} / {lesson.eyebrow}</p>
            <h1>{lesson.title}</h1>
          </header>
          <ArticleBody html={html} />
          <footer className="lesson-footer">
            <span>{lesson.number} / END</span>
            <button onClick={() => navigate(nextScreen)}>{nextLabel}</button>
          </footer>
        </article>

        <div className={`panel-column ${mobilePanelOpen ? "is-mobile-open" : ""}`}>
          <button className="drawer-close" onClick={() => setMobilePanelOpen(false)} aria-label="关闭右侧面板"><X size={18} /></button>
          <CodePanel lesson={lesson} activeIndex={activeIndex} panelRef={panelRef} />
        </div>
      </section>

      {mobilePanelOpen && <button className="drawer-backdrop" onClick={() => setMobilePanelOpen(false)} aria-label="关闭右侧面板" />}
      <button
        className="mobile-panel-button"
        onClick={() => setMobilePanelOpen(true)}
        aria-expanded={mobilePanelOpen}
      >
        <PanelRightOpen size={17} /> 查看代码 <span>{completion}%</span>
      </button>
    </main>
  );
}

export default function NanopiSite() {
  const [screen, setScreen] = useState<Screen>("chapter1");

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1) as Screen;
      if (hash === "chapter1" || hash === "chapter2" || hash === "trace") setScreen(hash);
      else setScreen("chapter1");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const navigate = (next: Screen) => {
    window.history.pushState(null, "", `#${next}`);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setScreen(next);
  };

  return (
    <>
      <Header screen={screen} navigate={navigate} />
      {screen === "trace"
        ? <TraceLab />
        : <Reader key={screen} lesson={lessons[screen]} navigate={navigate} />}
    </>
  );
}
