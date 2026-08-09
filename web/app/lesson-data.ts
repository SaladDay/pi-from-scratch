import { lessonMarkdown, sourceFiles } from "./content.generated";

export type RepoSnapshot = Record<string, string>;

export type Checkpoint = {
  id: string;
  label: string;
  file: string;
  repo: RepoSnapshot;
  focus?: [number, number];
  transfer?: boolean;
};

export type Lesson = {
  id: "chapter1" | "chapter2";
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  readingTime: string;
  markdown: string;
  initialRepo?: RepoSnapshot;
  checkpoints: Checkpoint[];
};

const fullRepo: RepoSnapshot = { ...sourceFiles };

function selectLines(code: string, ranges: Array<[number, number]>): string {
  const lines = code.split("\n");
  return ranges
    .map(([start, end]) => lines.slice(start - 1, end).join("\n"))
    .join("\n")
    .trimEnd() + "\n";
}

function addAnchor(markdown: string, heading: string, id: string): string {
  return markdown.replace(heading, `<!-- checkpoint: ${id} -->\n\n${heading}`);
}

let chapter1Markdown = `<!-- checkpoint: ch1-overview -->\n\n${lessonMarkdown.chapter1}`;
chapter1Markdown = addAnchor(chapter1Markdown, "## llm.ts", "ch1-llm");
chapter1Markdown = addAnchor(chapter1Markdown, "## agent.ts", "ch1-agent");
chapter1Markdown = addAnchor(chapter1Markdown, "## tools.ts", "ch1-tools");
chapter1Markdown = addAnchor(chapter1Markdown, "## tui.ts", "ch1-tui");
chapter1Markdown = addAnchor(chapter1Markdown, "## cli.ts", "ch1-cli");
chapter1Markdown = addAnchor(chapter1Markdown, "## 它们怎么协作", "ch1-cuts");

const repo = (files: RepoSnapshot): RepoSnapshot => ({ ...files });

const llm = sourceFiles["src/llm.ts"];
const agent = sourceFiles["src/agent.ts"];
const tools = sourceFiles["src/tools.ts"];
const tui = sourceFiles["src/tui.ts"];
const cli = sourceFiles["src/cli.ts"];

const chapter1Checkpoints: Checkpoint[] = [
  { id: "ch1-overview", label: "五个文件", file: "src/llm.ts", repo: {} },
  { id: "ch1-llm", label: "LLM 翻译层", file: "src/llm.ts", repo: repo({ "src/llm.ts": "" }) },
  { id: "ch1-agent", label: "Agent Loop", file: "src/agent.ts", repo: repo({ "src/llm.ts": "", "src/agent.ts": "" }) },
  { id: "ch1-tools", label: "四个工具", file: "src/tools.ts", repo: repo({ "src/llm.ts": "", "src/agent.ts": "", "src/tools.ts": "" }) },
  { id: "ch1-tui", label: "终端界面", file: "src/tui.ts", repo: repo({ "src/llm.ts": "", "src/agent.ts": "", "src/tools.ts": "", "src/tui.ts": "" }) },
  { id: "ch1-cli", label: "拼装入口", file: "src/cli.ts", repo: repo({ "src/llm.ts": "", "src/agent.ts": "", "src/tools.ts": "", "src/tui.ts": "", "src/cli.ts": "" }) },
  { id: "ch1-cuts", label: "留下骨架", file: "src/agent.ts", repo: repo({ "src/llm.ts": "", "src/agent.ts": "", "src/tools.ts": "", "src/tui.ts": "", "src/cli.ts": "" }) },
];

// 每个阶段都只挑选最终源码中已经讲到的行。后续阶段只能插入新行，
// 不能删掉或改写旧行，否则编辑器会把原有骨架误判成整段新代码。
const pseudoAgent = selectLines(agent, [
  [1, 5],
  [9, 9],
  [80, 85],
  [88, 89],
  [92, 94],
  [96, 98],
  [119, 123],
  [137, 137],
  [140, 140],
  [142, 148],
  [163, 164],
  [171, 174],
]);

const llmTypes = selectLines(llm, [[1, 49]]);
const llmStream = selectLines(llm, [
  [1, 50],
  [156, 169],
  [172, 172],
  [237, 237],
]);
const llmRequest = selectLines(llm, [
  [1, 50],
  [156, 200],
  [237, 237],
]);
const llmSseParse = selectLines(llm, [
  [1, 50],
  [93, 200],
  [237, 237],
]);
const llmParsed = selectLines(llm, [
  [1, 50],
  [93, 237],
]);
const llmWithContextConversion = selectLines(llm, [[1, 237]]);

const toolsStructure = selectLines(tools, [
  [1, 6],
  [11, 12],
  [33, 44],
  [48, 49],
]);
const toolsRead = selectLines(tools, [
  [1, 6],
  [9, 12],
  [14, 49],
]);
const toolsWrite = selectLines(tools, [
  [1, 6],
  [9, 12],
  [14, 69],
]);
const toolsEdit = selectLines(tools, [
  [1, 6],
  [9, 12],
  [14, 95],
]);

const agentToolType = selectLines(agent, [
  [1, 5],
  [9, 9],
  [12, 19],
  [80, 85],
  [88, 89],
  [92, 94],
  [96, 98],
  [119, 123],
  [137, 137],
  [140, 140],
  [142, 148],
  [163, 164],
  [171, 174],
]);

const agentTypes = selectLines(agent, [
  [1, 26],
  [80, 85],
  [88, 89],
  [92, 94],
  [96, 98],
  [119, 123],
  [137, 137],
  [140, 140],
  [142, 148],
  [163, 164],
  [171, 174],
]);

const agentLoop = selectLines(agent, [
  [1, 26],
  [72, 89],
  [92, 106],
  [118, 123],
  [137, 161],
  [163, 164],
  [171, 174],
]);

const agentMaxTokens = selectLines(agent, [
  [1, 26],
  [72, 89],
  [92, 106],
  [118, 161],
  [163, 164],
  [171, 174],
]);

const agentAbort = selectLines(agent, [
  [1, 26],
  [72, 89],
  [92, 112],
  [118, 174],
]);

const agentError = selectLines(agent, [
  [1, 26],
  [72, 89],
  [92, 174],
]);

const cliMain = selectLines(cli, [
  [1, 4],
  [8, 12],
  [16, 18],
  [23, 78],
]);

const emptyRepo: RepoSnapshot = {
  "src/llm.ts": "",
  "src/agent.ts": "",
  "src/tools.ts": "",
  "src/tui.ts": "",
  "src/cli.ts": "",
};

const chapter2Repo = (files: RepoSnapshot): RepoSnapshot => ({ ...emptyRepo, ...files });

const chapter2Checkpoints: Checkpoint[] = [
  {
    id: "pseudo-loop",
    label: "循环骨架",
    file: "src/agent.ts",
    repo: chapter2Repo({ "src/agent.ts": pseudoAgent }),
    transfer: true,
  },
  {
    id: "llm-types",
    label: "定义数据边界",
    file: "src/llm.ts",
    repo: chapter2Repo({ "src/agent.ts": pseudoAgent, "src/llm.ts": llmTypes }),
  },
  {
    id: "llm-stream",
    label: "写下 stream()",
    file: "src/llm.ts",
    repo: chapter2Repo({ "src/agent.ts": pseudoAgent, "src/llm.ts": llmStream }),
    transfer: true,
  },
  {
    id: "llm-request",
    label: "发出 HTTP 请求",
    file: "src/llm.ts",
    repo: chapter2Repo({ "src/agent.ts": pseudoAgent, "src/llm.ts": llmRequest }),
  },
  {
    id: "llm-sse-parse",
    label: "解析 SSE chunk",
    file: "src/llm.ts",
    repo: chapter2Repo({ "src/agent.ts": pseudoAgent, "src/llm.ts": llmSseParse }),
  },
  {
    id: "llm-stream-read",
    label: "读取 SSE 流",
    file: "src/llm.ts",
    repo: chapter2Repo({ "src/agent.ts": pseudoAgent, "src/llm.ts": llmParsed }),
  },
  {
    id: "llm-helpers",
    label: "转换 API 消息",
    file: "src/llm.ts",
    repo: chapter2Repo({ "src/agent.ts": pseudoAgent, "src/llm.ts": llmWithContextConversion }),
  },
  {
    id: "llm-message-builders",
    label: "构建 Context 消息",
    file: "src/llm.ts",
    repo: chapter2Repo({ "src/agent.ts": pseudoAgent, "src/llm.ts": llm }),
  },
  {
    id: "agent-tool-type",
    label: "定义 AgentTool",
    file: "src/agent.ts",
    repo: chapter2Repo({ "src/agent.ts": agentToolType, "src/llm.ts": llm }),
  },
  {
    id: "tools-structure",
    label: "写下工具外壳",
    file: "src/tools.ts",
    repo: chapter2Repo({ "src/agent.ts": agentToolType, "src/llm.ts": llm, "src/tools.ts": toolsStructure }),
  },
  {
    id: "tools-read",
    label: "实现 read_file",
    file: "src/tools.ts",
    repo: chapter2Repo({ "src/agent.ts": agentToolType, "src/llm.ts": llm, "src/tools.ts": toolsRead }),
  },
  {
    id: "tools-write",
    label: "实现 write_file",
    file: "src/tools.ts",
    repo: chapter2Repo({ "src/agent.ts": agentToolType, "src/llm.ts": llm, "src/tools.ts": toolsWrite }),
  },
  {
    id: "tools-edit",
    label: "实现 edit",
    file: "src/tools.ts",
    repo: chapter2Repo({ "src/agent.ts": agentToolType, "src/llm.ts": llm, "src/tools.ts": toolsEdit }),
  },
  {
    id: "tools-bash",
    label: "实现 run_bash",
    file: "src/tools.ts",
    repo: chapter2Repo({ "src/agent.ts": agentToolType, "src/llm.ts": llm, "src/tools.ts": tools }),
  },
  {
    id: "agent-types",
    label: "定义 AgentEvent",
    file: "src/agent.ts",
    repo: chapter2Repo({ "src/agent.ts": agentTypes, "src/llm.ts": llm, "src/tools.ts": tools }),
  },
  {
    id: "agent-loop",
    label: "补完整个循环",
    file: "src/agent.ts",
    repo: chapter2Repo({ "src/agent.ts": agentLoop, "src/llm.ts": llm, "src/tools.ts": tools }),
    transfer: true,
  },
  {
    id: "agent-max-tokens",
    label: "挡住半截参数",
    file: "src/agent.ts",
    repo: chapter2Repo({ "src/agent.ts": agentMaxTokens, "src/llm.ts": llm, "src/tools.ts": tools }),
  },
  {
    id: "agent-abort",
    label: "处理用户中断",
    file: "src/agent.ts",
    repo: chapter2Repo({ "src/agent.ts": agentAbort, "src/llm.ts": llm, "src/tools.ts": tools }),
  },
  {
    id: "agent-error",
    label: "处理请求错误",
    file: "src/agent.ts",
    repo: chapter2Repo({ "src/agent.ts": agentError, "src/llm.ts": llm, "src/tools.ts": tools }),
  },
  {
    id: "agent-compaction",
    label: "压缩 Context",
    file: "src/agent.ts",
    repo: chapter2Repo({ "src/agent.ts": agent, "src/llm.ts": llm, "src/tools.ts": tools }),
  },
  {
    id: "tui",
    label: "接上终端界面",
    file: "src/tui.ts",
    repo: chapter2Repo({ "src/agent.ts": agent, "src/llm.ts": llm, "src/tools.ts": tools, "src/tui.ts": tui }),
  },
  {
    id: "cli-main",
    label: "把模块粘起来",
    file: "src/cli.ts",
    repo: chapter2Repo({ "src/agent.ts": agent, "src/llm.ts": llm, "src/tools.ts": tools, "src/tui.ts": tui, "src/cli.ts": cliMain }),
    transfer: true,
  },
  {
    id: "cli-session",
    label: "保存会话",
    file: "src/cli.ts",
    repo: chapter2Repo(fullRepo),
  },
];

function assertProgressiveCheckpoints(initialRepo: RepoSnapshot, checkpoints: Checkpoint[]): void {
  let previousRepo = initialRepo;

  for (const checkpoint of checkpoints) {
    for (const [file, currentCode] of Object.entries(checkpoint.repo)) {
      const previousLines = (previousRepo[file] ?? "").split("\n");
      const currentLines = currentCode.split("\n");
      let previousIndex = 0;

      for (const line of currentLines) {
        if (line === previousLines[previousIndex]) previousIndex += 1;
      }

      if (previousIndex !== previousLines.length) {
        throw new Error(`Checkpoint ${checkpoint.id} rewrites existing code in ${file}`);
      }
    }

    previousRepo = checkpoint.repo;
  }
}

function assertCheckpointOrder(markdown: string, checkpoints: Checkpoint[]): void {
  const anchorIds = Array.from(
    markdown.matchAll(/<!--\s*checkpoint:\s*([a-z0-9-]+)\s*-->/g),
    (match) => match[1],
  );
  const checkpointIds = checkpoints.map((checkpoint) => checkpoint.id);

  if (anchorIds.join("\n") !== checkpointIds.join("\n")) {
    throw new Error("Chapter 2 checkpoint anchors do not match lesson data");
  }
}

assertProgressiveCheckpoints(emptyRepo, chapter2Checkpoints);
assertCheckpointOrder(lessonMarkdown.chapter2, chapter2Checkpoints);

export const lessons: Record<Lesson["id"], Lesson> = {
  chapter1: {
    id: "chapter1",
    number: "01/",
    eyebrow: "",
    title: "先导",
    description: "先看完整仓库。读到哪个模块，右侧就照亮哪一块。",
    readingTime: "约 8 分钟",
    markdown: chapter1Markdown,
    checkpoints: chapter1Checkpoints,
  },
  chapter2: {
    id: "chapter2",
    number: "02",
    eyebrow: "从空目录开始",
    title: "nano-pi",
    description: "从一个 while 循环出发，沿着数据流把五个文件逐步写出来。",
    readingTime: "约 24 分钟",
    markdown: lessonMarkdown.chapter2,
    initialRepo: emptyRepo,
    checkpoints: chapter2Checkpoints,
  },
};

export const outlineMarkdown = lessonMarkdown.outline;
export { fullRepo };
