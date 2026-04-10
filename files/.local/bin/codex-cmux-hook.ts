#!/usr/bin/env bun

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

type JsonObject = Record<string, unknown>;
type SessionRegistryEntry = {
  agent: "codex" | "claude";
  sessionId: string;
  cwd: string;
  surfaceRef: string;
  workspaceRef: string;
  updatedAt: string;
};

const HOME = os.homedir();
const HISTORY_FILE = path.join(HOME, ".codex", "history.jsonl");
const SESSION_REGISTRY_FILE = path.join(HOME, ".config", "cmux", "agent-sessions.json");
const EVENT = process.argv[2] ?? "";
const DRY_RUN = process.argv.includes("--dry-run");
const NAME_PROVIDER = process.env.CMUX_NAME_PROVIDER ?? "codex";
const CLAUDE_MODEL = process.env.CMUX_NAME_CLAUDE_MODEL ?? "haiku";
const CODEX_MODEL = process.env.CMUX_NAME_CODEX_MODEL ?? "gpt-5.4";
const DEFAULT_EMOJI = "✨";
const MAX_TASK_WIDTH = 20;
const MAX_BASE_WIDTH = 16;
const LOW_SIGNAL_PROMPTS = new Set([
  "はい",
  "ok",
  "okay",
  "了解",
  "続けて",
  "お願い",
  "お願いします",
  "そうして",
  "開いて",
  "起動して",
  "thanks",
  "thank you",
]);
const EVENT_NAME_MAP: Record<string, string> = {
  SessionStart: "session-start",
  Stop: "stop",
  UserPromptSubmit: "prompt-submit",
};
const EMOJI_RULES: Array<{ emoji: string; patterns: RegExp[] }> = [
  {
    emoji: "🐛",
    patterns: [/bug/iu, /fix/iu, /error/iu, /修正/u, /不具合/u, /壊れ/u, /落ちる/u],
  },
  {
    emoji: "🧪",
    patterns: [/test/iu, /spec/iu, /coverage/iu, /検証/u, /テスト/u, /再現/u],
  },
  {
    emoji: "🔍",
    patterns: [/review/iu, /audit/iu, /investigate/iu, /debug/iu, /調査/u, /確認/u, /原因/u, /解析/u],
  },
  {
    emoji: "📝",
    patterns: [/doc/iu, /readme/iu, /write/iu, /rewrite/iu, /説明/u, /文章/u, /翻訳/u, /まとめ/u],
  },
  {
    emoji: "🎨",
    patterns: [/ui/iu, /ux/iu, /css/iu, /design/iu, /style/iu, /見た目/u, /レイアウト/u, /デザイン/u, /余白/u],
  },
  {
    emoji: "🚀",
    patterns: [/deploy/iu, /release/iu, /ship/iu, /build/iu, /ci/iu, /cd/iu, /infra/iu, /docker/iu, /k8s/iu, /本番/u, /デプロイ/u, /リリース/u],
  },
  {
    emoji: "🗃️",
    patterns: [/db/iu, /sql/iu, /migration/iu, /schema/iu, /database/iu, /query/iu, /データベース/u, /マイグレーション/u],
  },
  {
    emoji: "⚙️",
    patterns: [/config/iu, /setting/iu, /env/iu, /tool/iu, /hook/iu, /automation/iu, /設定/u, /環境/u, /自動化/u],
  },
  {
    emoji: "♻️",
    patterns: [/refactor/iu, /cleanup/iu, /整理/u, /置き換え/u, /リファクタ/u],
  },
];
const MODEL_LABEL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bhook\b/giu, "Hook"],
  [/\breadme\b/giu, "README"],
  [/\btypescript\b/giu, "TS"],
  [/\bjavascript\b/giu, "JS"],
  [/\bui\b/giu, "UI"],
  [/\bux\b/giu, "UX"],
  [/\bci\/cd\b/giu, "CI/CD"],
  [/\btest(?:s|ing)?\b/giu, "テスト"],
  [/(?:を)?見直して/gu, "見直し"],
  [/(?:を)?調整して/gu, "調整"],
  [/(?:を)?整理して/gu, "整理"],
  [/(?:を)?修正して/gu, "修正"],
  [/(?:を)?追加して/gu, "追加"],
  [/(?:を)?更新して/gu, "更新"],
  [/(?:を)?改善して/gu, "改善"],
  [/(?:を)?削除して/gu, "削除"],
  [/(?:を)?確認して/gu, "確認"],
  [/(?:を)?調査して/gu, "調査"],
  [/(?:を)?実装して/gu, "実装"],
  [/(?:を)?対応して/gu, "対応"],
  [/(?:を)?導入して/gu, "導入"],
  [/(?:を)?最適化して/gu, "最適化"],
  [/(?:を)?検証して/gu, "検証"],
  [/(?:を)?作成して/gu, "作成"],
  [/(?:を)?翻訳して/gu, "翻訳"],
];

function jsonOut(payload: JsonObject): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(
  command: string,
  args: string[],
  cwd: string,
  options: { input?: string; timeoutMs?: number } = {},
) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    input: options.input ?? "",
    timeout: options.timeoutMs,
  });
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "{}";
  }
}

function parseJson(raw: string): JsonObject {
  try {
    return JSON.parse(raw || "{}") as JsonObject;
  } catch {
    return {};
  }
}

function readSessionRegistry(): Record<string, SessionRegistryEntry> {
  const parsed = parseJson(readFileSyncSafe(SESSION_REGISTRY_FILE));
  const entries = asObject(parsed.entries);
  const registry: Record<string, SessionRegistryEntry> = {};

  for (const [surfaceRef, value] of Object.entries(entries)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const entry = value as Partial<SessionRegistryEntry>;
    if (!surfaceRef || !entry.sessionId || !entry.agent) {
      continue;
    }
    registry[surfaceRef] = {
      agent: entry.agent === "claude" ? "claude" : "codex",
      sessionId: entry.sessionId,
      cwd: typeof entry.cwd === "string" ? entry.cwd : "",
      surfaceRef,
      workspaceRef: typeof entry.workspaceRef === "string" ? entry.workspaceRef : "",
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
    };
  }

  return registry;
}

function writeSessionRegistry(entries: Record<string, SessionRegistryEntry>): void {
  mkdirSync(path.dirname(SESSION_REGISTRY_FILE), { recursive: true });
  writeFileSync(
    SESSION_REGISTRY_FILE,
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
    "utf8",
  );
}

function readFileSyncSafe(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "{}";
  }
}

function currentCmuxRefs(cwd: string): { surfaceRef: string; workspaceRef: string; rawSurfaceRef: string } {
  const rawSurfaceRef = firstString(process.env.CMUX_SURFACE_ID);
  const rawWorkspaceRef = firstString(process.env.CMUX_WORKSPACE_ID);
  const result = run("cmux", ["identify"], cwd, { timeoutMs: 2000 });
  if (result.status !== 0 || result.error) {
    return {
      surfaceRef: rawSurfaceRef,
      workspaceRef: rawWorkspaceRef,
      rawSurfaceRef,
    };
  }

  const parsed = parseJson(result.stdout);
  const caller = asObject(parsed.caller);
  return {
    surfaceRef: firstString(caller.surface_ref, rawSurfaceRef),
    workspaceRef: firstString(caller.workspace_ref, rawWorkspaceRef),
    rawSurfaceRef,
  };
}

function rememberSession(agent: "codex" | "claude", sessionId: string, cwd: string): void {
  const { surfaceRef, workspaceRef, rawSurfaceRef } = currentCmuxRefs(cwd);
  if (!surfaceRef || !sessionId) {
    return;
  }

  const entries = readSessionRegistry();
  entries[surfaceRef] = {
    agent,
    sessionId,
    cwd,
    surfaceRef,
    workspaceRef,
    updatedAt: new Date().toISOString(),
  };
  if (rawSurfaceRef && rawSurfaceRef !== surfaceRef) {
    delete entries[rawSurfaceRef];
  }
  writeSessionRegistry(entries);
}

function forgetSession(agent: "codex" | "claude", cwd: string): void {
  const { surfaceRef, rawSurfaceRef } = currentCmuxRefs(cwd);
  if (!surfaceRef) {
    return;
  }

  const entries = readSessionRegistry();
  if (entries[surfaceRef]?.agent === agent) {
    delete entries[surfaceRef];
  }
  if (rawSurfaceRef && rawSurfaceRef !== surfaceRef && entries[rawSurfaceRef]?.agent === agent) {
    delete entries[rawSurfaceRef];
  }
  writeSessionRegistry(entries);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
}

function isCombiningCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  );
}

function charWidth(char: string): number {
  const codePoint = char.codePointAt(0);
  if (!codePoint || isCombiningCodePoint(codePoint)) {
    return 0;
  }
  return isWideCodePoint(codePoint) ? 2 : 1;
}

function stringWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += charWidth(char);
  }
  return width;
}

function clip(value: string, maxWidth: number): string {
  if (stringWidth(value) <= maxWidth) {
    return value;
  }

  const suffix = "...";
  const suffixWidth = stringWidth(suffix);
  let width = 0;
  let clipped = "";

  for (const char of value) {
    const nextWidth = width + charWidth(char);
    if (nextWidth + suffixWidth > maxWidth) {
      break;
    }
    clipped += char;
    width = nextWidth;
  }

  return `${clipped}${suffix}`;
}

function normalizePrompt(text: string): string {
  const collapsed = String(text || "")
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[!?！？]+$/gu, "")
    .trim();

  if (!collapsed) {
    return "";
  }

  const firstSentence = collapsed.split(/[\n。.!?！？]/u)[0].trim() || collapsed;
  return clip(firstSentence, MAX_TASK_WIDTH);
}

function isMeaningfulPrompt(rawPrompt: string, normalizedPrompt: string): boolean {
  const trimmed = String(rawPrompt || "").trim();
  if (!normalizedPrompt) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return false;
  }
  return !LOW_SIGNAL_PROMPTS.has(normalizedPrompt.toLowerCase());
}

function detectEmoji(text: string): string {
  for (const rule of EMOJI_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.emoji;
    }
  }
  return DEFAULT_EMOJI;
}

function splitEmojiTitle(value: string): { emoji: string; label: string } {
  const cleaned = String(value || "")
    .split("\n")[0]
    .trim()
    .replace(/^["'`]+|["'`]+$/gu, "")
    .replace(/\s+/gu, " ");
  const match = cleaned.match(/^(?<emoji>\p{Extended_Pictographic}(?:\uFE0F)?)(?:\s+)?(?<label>.*)$/u);
  if (!match?.groups) {
    return { emoji: "", label: cleaned };
  }
  return {
    emoji: match.groups.emoji.trim(),
    label: match.groups.label.trim(),
  };
}

function compactModelLabel(value: string): string {
  let label = String(value || "")
    .split("\n")[0]
    .trim()
    .replace(/^["'`]+|["'`]+$/gu, "")
    .replace(/\s+/gu, " ");

  for (const [pattern, replacement] of MODEL_LABEL_REPLACEMENTS) {
    label = label.replace(pattern, replacement);
  }

  return label
    .replace(/[をにでへの]/gu, "")
    .replace(/\s*・\s*/gu, "・")
    .replace(/\s+/gu, " ")
    .trim();
}

function isAcceptableModelLabel(label: string): boolean {
  return Boolean(label) && stringWidth(label) <= MAX_TASK_WIDTH && !/(して|してください|下さい|お願いします|お願い|したい|を)/u.test(label);
}

function fallbackTaskTitle(rawPrompt: string): string {
  const label = normalizePrompt(rawPrompt);
  if (!label) {
    return "";
  }
  return `${detectEmoji(rawPrompt)} ${label}`;
}

function cleanModelTitle(value: string, rawPrompt: string): { title: string; valid: boolean } {
  const parts = splitEmojiTitle(value);
  const rawLabel = compactModelLabel(parts.label || normalizePrompt(rawPrompt));
  const label = clip(rawLabel, MAX_TASK_WIDTH);
  if (!label) {
    return { title: "", valid: false };
  }
  return {
    title: `${parts.emoji || detectEmoji(rawPrompt)} ${label}`,
    valid: isAcceptableModelLabel(rawLabel),
  };
}

function buildPromptForModel(userPrompt: string): string {
  return [
    "Turn the user's request into a very short cmux title.",
    "Rules:",
    "- Output one line only.",
    "- Keep the user's language.",
    "- Start with exactly one relevant emoji, then a space.",
    "- Be aggressively concise. Do not copy the full request.",
    "- Prefer a noun phrase or short action phrase, not a question.",
    "- Prefer a compact shorthand that still distinguishes the task.",
    "- Prefer formats like '<subject><action>' or '<subject><action>・<subject><action>'.",
    "- Use at most 12 visible Japanese characters after the emoji, or up to 18 ASCII characters.",
    "- Good examples: '🐛 バグ修正・テスト追加', '⚙️ Hook設定整理', '🎨 余白調整'.",
    "- Avoid particles like 'を' or sentence fragments ending with 'して'.",
    "- Bad: '🎨 デザインを見直して余白調整'. Good: '🎨 余白調整' or '🎨 デザイン調整'.",
    "- No quotes.",
    "- No trailing punctuation.",
    "",
    `User request: ${userPrompt}`,
  ].join("\n");
}

function buildRepairPrompt(userPrompt: string, previousTitle: string): string {
  return [
    "Rewrite the previous cmux title so it is shorter and rule-compliant.",
    "Rules:",
    "- Output one line only.",
    "- Keep the user's language.",
    "- Start with exactly one relevant emoji, then a space.",
    "- Make it shorter than the previous title.",
    "- Avoid particles like 'を' and sentence fragments ending with 'して'.",
    "- Prefer compact labels like 'Hook整理', '余白調整', 'バグ修正・テスト追加'.",
    "- Use at most 12 visible Japanese characters after the emoji, or up to 18 ASCII characters.",
    "",
    `User request: ${userPrompt}`,
    `Previous title: ${previousTitle}`,
  ].join("\n");
}

function titleFromClaude(userPrompt: string, cwd: string): string {
  const result = run(
    "claude",
    [
      "-p",
      "--model",
      CLAUDE_MODEL,
      "--tools",
      "",
      "--output-format",
      "text",
      buildPromptForModel(userPrompt),
    ],
    cwd,
    { timeoutMs: 14000 },
  );

  if (result.status !== 0 || result.error) {
    return "";
  }
  const cleaned = cleanModelTitle(result.stdout, userPrompt);
  return cleaned.title;
}

function runCodexTitlePrompt(prompt: string, cwd: string, userPrompt: string): { title: string; valid: boolean } {
  const tmpDir = path.join(os.tmpdir(), `cmux-title-${Date.now()}`);
  const outputFile = path.join(tmpDir, "last-message.txt");
  mkdirSync(tmpDir, { recursive: true });

  const result = run(
    "codex",
    [
      "exec",
      "--disable",
      "codex_hooks",
      "--skip-git-repo-check",
      "--ephemeral",
      "--color",
      "never",
      "-C",
      cwd,
      "-m",
      CODEX_MODEL,
      "-c",
      'model_reasoning_effort="low"',
      "-o",
      outputFile,
      prompt,
    ],
    cwd,
    { timeoutMs: 14000 },
  );

  let cleaned = { title: "", valid: false };
  if (result.status === 0 && !result.error) {
    try {
      cleaned = cleanModelTitle(readFileSync(outputFile, "utf8"), userPrompt);
    } catch {
      cleaned = { title: "", valid: false };
    }
  }

  rmSync(tmpDir, { recursive: true, force: true });
  return cleaned;
}

function titleFromCodex(userPrompt: string, cwd: string): string {
  const first = runCodexTitlePrompt(buildPromptForModel(userPrompt), cwd, userPrompt);
  if (first.valid) {
    return first.title;
  }
  if (!first.title) {
    return "";
  }

  const repaired = runCodexTitlePrompt(buildRepairPrompt(userPrompt, first.title), cwd, userPrompt);
  return repaired.title || first.title;
}

function generateTaskTitle(userPrompt: string, cwd: string): string {
  if (!userPrompt) {
    return "";
  }

  if (NAME_PROVIDER === "claude") {
    return titleFromClaude(userPrompt, cwd) || fallbackTaskTitle(userPrompt);
  }

  if (NAME_PROVIDER === "codex") {
    return titleFromCodex(userPrompt, cwd) || fallbackTaskTitle(userPrompt);
  }

  return fallbackTaskTitle(userPrompt);
}

function projectLabel(cwd: string): string {
  const repoRoot = run("git", ["rev-parse", "--show-toplevel"], cwd);
  if (repoRoot.status !== 0 || repoRoot.error) {
    const dir = cwd === HOME ? path.basename(HOME) : path.basename(cwd || HOME);
    return dir || "workspace";
  }

  let label = path.basename(repoRoot.stdout.trim());
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const branchName = branch.stdout.trim();
  if (branch.status === 0 && !branch.error && branchName && !["main", "master", "trunk", "HEAD"].includes(branchName)) {
    label = `${label}@${clip(branchName, 18)}`;
  }
  return label;
}

function workspaceLabel(base: string, task: string): string {
  if (!task) {
    return base;
  }
  return `${task} | ${clip(base, MAX_BASE_WIDTH)}`;
}

function readHistoryLines(): string[] {
  try {
    return readFileSync(HISTORY_FILE, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function findLatestMeaningfulPrompt(threadId: string): string {
  if (!threadId) {
    return "";
  }

  const lines = readHistoryLines();
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index]) as { session_id?: string; text?: string };
      if (entry.session_id !== threadId || typeof entry.text !== "string") {
        continue;
      }
      const normalized = normalizePrompt(entry.text);
      if (isMeaningfulPrompt(entry.text, normalized)) {
        return entry.text;
      }
    } catch {
      // Ignore malformed lines.
    }
  }

  return "";
}

function pickPrompt(input: JsonObject, eventName: string): string {
  const rawPrompt = firstString(input.prompt);
  const normalizedPrompt = normalizePrompt(rawPrompt);
  if (eventName === "prompt-submit" && isMeaningfulPrompt(rawPrompt, normalizedPrompt)) {
    return rawPrompt;
  }

  const threadId = firstString(process.env.CODEX_THREAD_ID, input.thread_id, input.session_id, input.sessionId);
  if (!threadId) {
    return "";
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const prompt = findLatestMeaningfulPrompt(threadId);
    if (prompt) {
      return prompt;
    }
    sleepMs(150);
  }

  return "";
}

function renameWorkspace(title: string, cwd: string): void {
  const workspaceId = process.env.CMUX_WORKSPACE_ID;
  if (!workspaceId || !title) {
    return;
  }
  run("cmux", ["rename-workspace", "--workspace", workspaceId, title], cwd);
}

function clearTabName(cwd: string): void {
  const surfaceId = process.env.CMUX_SURFACE_ID;
  if (!surfaceId) {
    return;
  }
  run("cmux", ["tab-action", "--surface", surfaceId, "--action", "clear-name"], cwd);
}

function runCmuxHook(rawInput: string, eventName: string, cwd: string): JsonObject {
  if (!process.env.CMUX_SURFACE_ID) {
    return {};
  }

  const subcommand = EVENT_NAME_MAP[eventName] || eventName;
  if (!subcommand) {
    return {};
  }

  const result = run(
    "cmux",
    ["codex-hook", subcommand],
    cwd,
    {
      input: rawInput.trim() ? rawInput : "{}",
      timeoutMs: 14000,
    },
  );

  if (result.status !== 0 || result.error) {
    return {};
  }
  return parseJson(result.stdout);
}

function mergeOutputs(base: JsonObject, extra: JsonObject): JsonObject {
  const merged: JsonObject = { ...base, ...extra };
  const hookSpecificOutput = {
    ...asObject(base.hookSpecificOutput),
    ...asObject(extra.hookSpecificOutput),
  };

  if (Object.keys(hookSpecificOutput).length > 0) {
    merged.hookSpecificOutput = hookSpecificOutput;
  } else {
    delete merged.hookSpecificOutput;
  }

  return merged;
}

function main(): void {
  const rawInput = readStdin();
  const input = parseJson(rawInput);
  const eventName = EVENT || EVENT_NAME_MAP[firstString(input.hook_event_name)] || "";
  const cwd = firstString(input.cwd) || process.cwd();
  const sessionId = firstString(process.env.CODEX_THREAD_ID, input.thread_id, input.session_id, input.sessionId);
  const base = projectLabel(cwd);
  const rawPrompt = pickPrompt(input, eventName);
  const task = rawPrompt ? generateTaskTitle(rawPrompt, cwd) : "";
  const workspaceTitle = workspaceLabel(base, task);
  const tabTitle = "(cmux default)";
  const sessionTitle = task || base;

  if (DRY_RUN) {
    jsonOut({
      event: eventName,
      cwd,
      sessionId,
      rawPrompt,
      workspaceTitle,
      tabTitle,
      sessionTitle,
    });
    return;
  }

  if (eventName === "stop") {
    forgetSession("codex", cwd);
  } else if ((eventName === "session-start" || eventName === "prompt-submit") && sessionId) {
    rememberSession("codex", sessionId, cwd);
  }

  const cmuxOutput = runCmuxHook(rawInput, eventName, cwd);
  renameWorkspace(workspaceTitle, cwd);
  clearTabName(cwd);

  const output = eventName === "prompt-submit"
    ? mergeOutputs(cmuxOutput, { hookSpecificOutput: { sessionTitle } })
    : cmuxOutput;
  jsonOut(output);
}

main();
