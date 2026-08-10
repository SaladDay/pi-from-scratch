"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import Check from "lucide-react/dist/esm/icons/check.mjs";
import Code2 from "lucide-react/dist/esm/icons/code-2.mjs";
import FileCode2 from "lucide-react/dist/esm/icons/file-code-2.mjs";
import Folder from "lucide-react/dist/esm/icons/folder.mjs";
import Lock from "lucide-react/dist/esm/icons/lock.mjs";
import LockOpen from "lucide-react/dist/esm/icons/lock-open.mjs";
import Menu from "lucide-react/dist/esm/icons/menu.mjs";
import Moon from "lucide-react/dist/esm/icons/moon.mjs";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open.mjs";
import Sun from "lucide-react/dist/esm/icons/sun.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { fullRepo, lessons, type Lesson } from "./lesson-data";
import NudgeCounter from "./NudgeCounter";
import TraceLab from "./TraceLab";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);

type Screen = Lesson["id"] | "trace";

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.94 10.94 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

function XMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.24 2h3.31l-7.23 8.26L22.82 22h-6.66l-5.21-6.82L4.98 22H1.67l7.73-8.84L1.25 2h6.83l4.71 6.23L18.24 2Zm-1.16 17.93h1.83L7.08 3.96H5.11l11.97 15.97Z" />
    </svg>
  );
}

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

const ArticleBody = memo(function ArticleBody({ before, after }: { before: string; after: string | null }) {
  return (
    <div className="article-body">
      <div className="article-fragment" dangerouslySetInnerHTML={{ __html: before }} />
      {after !== null && <NudgeCounter />}
      {after !== null && <div className="article-fragment" dangerouslySetInnerHTML={{ __html: after }} />}
    </div>
  );
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

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (prefersDark: boolean) => {
      let savedTheme: string | null = null;
      try {
        savedTheme = localStorage.getItem("pi-from-scratch-theme");
      } catch {
        savedTheme = null;
      }
      const theme = savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : prefersDark ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    };
    const followSystemTheme = (event: MediaQueryListEvent) => applyTheme(event.matches);

    applyTheme(media.matches);
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
      <button className="brand" onClick={() => go("chapter1")} aria-label="返回先导">
        <span className="brand-mark">π</span>
        <strong>PI from Scratch</strong>
      </button>
      <nav className={`chapter-nav ${menuOpen ? "is-open" : ""}`} aria-label="课程章节">
        <button className={screen === "chapter1" ? "is-active" : ""} onClick={() => go("chapter1")}>先导</button>
        <button className={screen === "chapter2" ? "is-active" : ""} onClick={() => go("chapter2")}>创造你的 nano-pi</button>
        <button className={screen === "trace" ? "is-active" : ""} onClick={() => go("trace")}>trace 跟踪</button>
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
          <GitHubMark />
        </a>
        <a
          className="repo-link"
          href="https://x.com/saladdayyy"
          target="_blank"
          rel="noreferrer"
          aria-label="打开 SaladDay 的 X 账号"
          title="X / @saladdayyy"
        >
          <XMark />
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
  openFiles,
  setOpenFiles,
  navigationLocked,
  setNavigationLocked,
}: {
  lesson: Lesson;
  activeIndex: number;
  panelRef: React.RefObject<HTMLDivElement | null>;
  openFiles: string[];
  setOpenFiles: React.Dispatch<React.SetStateAction<string[]>>;
  navigationLocked: boolean;
  setNavigationLocked: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const checkpoint = activeIndex >= 0 ? lesson.checkpoints[activeIndex] : null;
  const previous = activeIndex > 0 ? lesson.checkpoints[activeIndex - 1] : null;
  const initialRepo = lesson.initialRepo ?? {};
  const repo = checkpoint?.repo ?? initialRepo;
  const [fileChoice, setFileChoice] = useState<{ checkpointId: string; file: string | null } | null>(null);
  const [suppressedAnimationPhases, setSuppressedAnimationPhases] = useState<ReadonlySet<string>>(() => new Set());
  const codeScrollRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollPositionsRef = useRef(new Map<string, { top: number; left: number }>());

  const files = Object.keys(repo);
  const previousRepo = previous?.repo ?? initialRepo;
  const newFiles = new Set(files.filter((file) => !(file in previousRepo)));
  const phaseId = checkpoint?.id ?? "initial";
  const previousPhaseRef = useRef(phaseId);
  const selectionCauseRef = useRef<"checkpoint" | "manual" | "settled">("checkpoint");
  const selectedFile = fileChoice && (navigationLocked || fileChoice.checkpointId === phaseId)
    ? fileChoice.file && fileChoice.file in repo ? fileChoice.file : ""
    : checkpoint?.file ?? files[0] ?? "";
  const availableOpenFiles = openFiles.filter((file) => file in repo);
  const visibleOpenFiles = selectedFile && !availableOpenFiles.includes(selectedFile)
    ? [...availableOpenFiles, selectedFile]
    : availableOpenFiles;
  const hasSelectedFile = selectedFile in repo;
  const code = selectedFile ? repo[selectedFile] ?? "" : "";
  const changesForFile = (file: string) => {
    if (!checkpoint || file !== checkpoint.file) return new Set<number>();
    if (checkpoint.focus) {
      const [start, end] = checkpoint.focus;
      return new Set(Array.from({ length: end - start + 1 }, (_, index) => start + index));
    }
    return addedLines(previousRepo[file] ?? "", repo[file] ?? "");
  };
  const changed = changesForFile(selectedFile);

  const focusLine = changed.size ? Math.min(...changed) : 1;
  const handleSelectFile = (event: React.MouseEvent<HTMLButtonElement>) => {
    const file = event.currentTarget.dataset.file;
    if (!file) return;
    const container = codeScrollRefs.current.get(selectedFile);
    if (container && selectedFile) {
      scrollPositionsRef.current.set(selectedFile, {
        top: container.scrollTop,
        left: container.scrollLeft,
      });
    }
    selectionCauseRef.current = "manual";
    setSuppressedAnimationPhases((phases) => {
      const next = new Set(phases);
      next.add(phaseId);
      return next;
    });
    setOpenFiles((current) => current.includes(file) ? current : [...current, file]);
    setFileChoice({ checkpointId: phaseId, file });
  };

  const handleCloseFile = (event: React.MouseEvent<HTMLButtonElement>) => {
    const file = event.currentTarget.dataset.file;
    if (!file) return;
    const index = visibleOpenFiles.indexOf(file);
    const remaining = visibleOpenFiles.filter((item) => item !== file);
    setOpenFiles(remaining);
    if (file !== selectedFile) return;

    const container = codeScrollRefs.current.get(selectedFile);
    if (container) {
      scrollPositionsRef.current.set(selectedFile, {
        top: container.scrollTop,
        left: container.scrollLeft,
      });
    }
    selectionCauseRef.current = "manual";
    setSuppressedAnimationPhases((phases) => {
      const next = new Set(phases);
      next.add(phaseId);
      return next;
    });
    setFileChoice({
      checkpointId: phaseId,
      file: remaining[Math.min(index, remaining.length - 1)] ?? null,
    });
  };

  const handleNavigationLock = () => {
    const container = codeScrollRefs.current.get(selectedFile);
    if (container && selectedFile) {
      scrollPositionsRef.current.set(selectedFile, {
        top: container.scrollTop,
        left: container.scrollLeft,
      });
    }

    if (navigationLocked) {
      const checkpointFile = checkpoint?.file;
      if (checkpointFile) {
        setOpenFiles((current) => current.includes(checkpointFile) ? current : [...current, checkpointFile]);
      }
      selectionCauseRef.current = "checkpoint";
      setFileChoice(null);
      setNavigationLocked(false);
      return;
    }

    selectionCauseRef.current = "settled";
    setFileChoice({ checkpointId: phaseId, file: selectedFile || null });
    setNavigationLocked(true);
  };

  useLayoutEffect(() => {
    if (previousPhaseRef.current === phaseId) return;
    previousPhaseRef.current = phaseId;
    selectionCauseRef.current = navigationLocked ? "settled" : "checkpoint";
  }, [navigationLocked, phaseId]);

  useLayoutEffect(() => {
    const container = codeScrollRefs.current.get(selectedFile);
    if (!container || !selectedFile) return;
    const positions = scrollPositionsRef.current;

    const saved = positions.get(selectedFile);
    const followsCheckpoint = !navigationLocked
      && selectionCauseRef.current === "checkpoint"
      && checkpoint
      && selectedFile === checkpoint.file;
    if (followsCheckpoint && code) {
      const target = container.querySelector<HTMLElement>(`[data-line="${focusLine}"]`);
      if (target) {
        container.scrollTo({
          top: Math.max(0, target.offsetTop - container.clientHeight * 0.28),
          left: 0,
          behavior: "auto",
        });
      }
    } else if (saved) {
      container.scrollTo({ top: saved.top, left: saved.left, behavior: "auto" });
    }
    selectionCauseRef.current = "settled";

    return () => {
      positions.set(selectedFile, {
        top: container.scrollTop,
        left: container.scrollLeft,
      });
    };
  }, [checkpoint, code, focusLine, navigationLocked, phaseId, selectedFile]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const keepWheelInsideIde = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      const target = event.target instanceof Element ? event.target : null;
      const scroller = target?.closest<HTMLElement>(".code-scroll, .file-tree");
      const canScroll = scroller
        && (scroller.scrollHeight > scroller.clientHeight || scroller.scrollWidth > scroller.clientWidth);

      const hitsVerticalEdge = Boolean(scroller) && (
        (event.deltaY < 0 && scroller!.scrollTop <= 0)
        || (event.deltaY > 0 && scroller!.scrollTop + scroller!.clientHeight >= scroller!.scrollHeight - 1)
      );
      const hitsHorizontalEdge = Boolean(scroller) && (
        (event.deltaX < 0 && scroller!.scrollLeft <= 0)
        || (event.deltaX > 0 && scroller!.scrollLeft + scroller!.clientWidth >= scroller!.scrollWidth - 1)
      );

      // Let scrollable IDE surfaces use the browser's native trackpad/wheel
      // physics. Only swallow wheel input over non-scrollable IDE chrome so it
      // never leaks through to the article behind it.
      if (!canScroll || hitsVerticalEdge || hitsHorizontalEdge) event.preventDefault();
    };

    panel.addEventListener("wheel", keepWheelInsideIde, { passive: false });
    return () => panel.removeEventListener("wheel", keepWheelInsideIde);
  }, [panelRef]);

  return (
    <aside className="code-panel" ref={panelRef} aria-label="随阅读演进的代码仓库">
      <div className="panel-heading">
        <strong>nanopi /</strong>
        <button
          className={`editor-lock ${navigationLocked ? "is-active" : ""}`}
          onClick={handleNavigationLock}
          aria-pressed={navigationLocked}
          aria-label={navigationLocked ? "解除编辑器锁定并继续跟随阅读" : "锁定编辑器，停止自动导航"}
          title={navigationLocked ? "继续跟随阅读" : "停止跟随阅读"}
        >
          {navigationLocked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
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
                data-file={file}
                onClick={handleSelectFile}
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
              <div className="code-tabs" role="tablist" aria-label="已打开的文件">
                {visibleOpenFiles.map((file) => (
                  <div className={`code-tab ${selectedFile === file ? "is-active" : ""}`} role="presentation" key={file}>
                    <button
                      className="code-tab-select"
                      role="tab"
                      aria-selected={selectedFile === file}
                      data-file={file}
                      onClick={handleSelectFile}
                    >
                      <FileCode2 size={13} />
                      <span>{file.replace("src/", "")}</span>
                    </button>
                    <button className="code-tab-close" data-file={file} onClick={handleCloseFile} aria-label={`关闭 ${file}`}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {visibleOpenFiles.map((file) => {
                const fileCode = repo[file] ?? "";
                const fileChanges = changesForFile(file);
                const changedOrder = new Map(Array.from(fileChanges).sort((a, b) => a - b).map((line, index) => [line, index]));
                const shouldAnimate = Boolean(
                  checkpoint
                  && file === checkpoint.file
                  && !suppressedAnimationPhases.has(phaseId),
                );
                const writeLead = newFiles.has(file) ? 820 : 120;
                return (
                  <div
                    className={`code-scroll ${selectedFile === file ? "is-active" : ""}`}
                    data-editor-file={file}
                    aria-hidden={selectedFile !== file}
                    ref={(node) => {
                      if (node) codeScrollRefs.current.set(file, node);
                      else codeScrollRefs.current.delete(file);
                    }}
                    key={file}
                  >
                    {fileCode.split("\n").map((line, index) => {
                      const lineNumber = index + 1;
                      const isChanged = fileChanges.has(lineNumber);
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
                );
              })}
            </>
          ) : (
            <div className="empty-code">
              <Code2 size={20} />
              <strong>{files.length ? "没有打开的文件" : "仓库还是空的"}</strong>
              <p>{files.length ? "从左侧文件树打开一个文件。" : "读到第一个 checkpoint，代码才会出现。"}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Reader({ lesson, navigate }: { lesson: Lesson; navigate: (screen: Screen) => void }) {
  const articleRef = useRef<HTMLElement>(null);
  const panelColumnRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const activeIndexRef = useRef(-1);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const articleHtml = useMemo(() => {
    const marker = "<!-- nudge-counter -->";
    const markerIndex = lesson.markdown.indexOf(marker);
    if (markerIndex < 0) return { before: renderMarkdown(lesson.markdown), after: null };
    return {
      before: renderMarkdown(lesson.markdown.slice(0, markerIndex)),
      after: renderMarkdown(lesson.markdown.slice(markerIndex + marker.length)),
    };
  }, [lesson.markdown]);

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
      if (next !== activeIndexRef.current) {
        activeIndexRef.current = next;
        setActiveIndex(next);
        const nextFile = next >= 0 ? lesson.checkpoints[next]?.file : null;
        if (nextFile && !navigationLocked) {
          setOpenFiles((current) => current.includes(nextFile) ? current : [...current, nextFile]);
        }
      }

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
  }, [lesson, navigationLocked]);

  useLayoutEffect(() => {
    const column = panelColumnRef.current;
    const panel = panelRef.current;
    if (!column || !panel) return;

    const desktop = window.matchMedia("(min-width: 1181px)");
    const syncPanelFrame = () => {
      if (!desktop.matches) {
        panel.removeAttribute("data-viewport-pinned");
        panel.style.removeProperty("--panel-fixed-left");
        panel.style.removeProperty("--panel-fixed-width");
        return;
      }

      const rect = column.getBoundingClientRect();
      panel.style.setProperty("--panel-fixed-left", `${rect.left}px`);
      panel.style.setProperty("--panel-fixed-width", `${rect.width}px`);
      panel.setAttribute("data-viewport-pinned", "true");
    };

    const observer = new ResizeObserver(syncPanelFrame);
    observer.observe(column);
    desktop.addEventListener("change", syncPanelFrame);
    window.addEventListener("resize", syncPanelFrame);
    syncPanelFrame();

    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", syncPanelFrame);
      window.removeEventListener("resize", syncPanelFrame);
    };
  }, [lesson]);

  const nextScreen: Screen = lesson.id === "chapter1" ? "chapter2" : "trace";
  const nextLabel = lesson.id === "chapter1" ? "创造你的 nano-pi" : "进入 trace 跟踪";
  const completion = lesson.id === "chapter1"
    ? Math.round(((Math.max(0, activeIndex) + 1) / lesson.checkpoints.length) * 100)
    : activeIndex < 0 ? 0 : Math.round(((activeIndex + 1) / lesson.checkpoints.length) * 100);

  return (
    <main className="reader-shell">
      <div className="reading-progress" aria-hidden="true"><span ref={progressRef} /></div>
      <section className="reader-grid">
        <article className="lesson-column" ref={articleRef}>
          <header className="lesson-header">
            <h1>{lesson.title}</h1>
          </header>
          <ArticleBody before={articleHtml.before} after={articleHtml.after} />
          <footer className="lesson-footer">
            <button onClick={() => navigate(nextScreen)}>{nextLabel}</button>
          </footer>
        </article>

        <div ref={panelColumnRef} className={`panel-column ${mobilePanelOpen ? "is-mobile-open" : ""}`}>
          <button className="drawer-close" onClick={() => setMobilePanelOpen(false)} aria-label="关闭右侧面板"><X size={18} /></button>
          <CodePanel
            lesson={lesson}
            activeIndex={activeIndex}
            panelRef={panelRef}
            openFiles={openFiles}
            setOpenFiles={setOpenFiles}
            navigationLocked={navigationLocked}
            setNavigationLocked={setNavigationLocked}
          />
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
