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
  sessionTitle: string;
  workspaceDescription?: string;
  recentPrompts: string[];
  updatedAt: string;
};
type PromptSelection = {
  prompt: string;
  prompts: string[];
  source: "current" | "history" | "none";
};
type SessionLabelDecision = {
  sessionTitle: string;
  workspaceDescription: string;
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
const MAX_TASK_WIDTH = 28;
const MAX_BASE_WIDTH = 20;
const MAX_CONTEXT_PROMPT_WIDTH = 120;
const MAX_SESSION_PROMPTS = 12;
const EVENT_NAME_MAP: Record<string, string> = {
  SessionStart: "session-start",
  Stop: "stop",
  UserPromptSubmit: "prompt-submit",
};

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

function parseJsonObjectLoose(raw: string): JsonObject {
  const direct = parseJson(raw);
  if (Object.keys(direct).length > 0) {
    return direct;
  }

  const trimmed = String(raw || "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return {};
  }

  return parseJson(trimmed.slice(start, end + 1));
}

function liveCmuxRefs(cwd: string): { surfaces: Set<string>; workspaces: Set<string> } {
  const result = run("cmux", ["tree", "--json"], cwd, { timeoutMs: 2000 });
  if (result.status !== 0 || result.error) {
    return {
      surfaces: new Set<string>(),
      workspaces: new Set<string>(),
    };
  }

  const parsed = parseJson(result.stdout);
  const surfaces = new Set<string>();
  const workspaces = new Set<string>();
  const windows = Array.isArray(parsed.windows) ? parsed.windows : [];

  for (const window of windows) {
    const workspacesInWindow = Array.isArray(asObject(window).workspaces) ? asObject(window).workspaces as unknown[] : [];
    for (const workspace of workspacesInWindow) {
      const workspaceObject = asObject(workspace);
      const workspaceRef = firstString(workspaceObject.ref);
      if (workspaceRef) {
        workspaces.add(workspaceRef);
      }

      const panes = Array.isArray(workspaceObject.panes) ? workspaceObject.panes : [];
      for (const pane of panes) {
        const paneObject = asObject(pane);
        const paneSurfaces = Array.isArray(paneObject.surfaces) ? paneObject.surfaces : [];
        for (const surface of paneSurfaces) {
          const surfaceRef = firstString(asObject(surface).ref);
          if (surfaceRef) {
            surfaces.add(surfaceRef);
          }
        }
      }
    }
  }

  return { surfaces, workspaces };
}

function pruneSessionRegistry(entries: Record<string, SessionRegistryEntry>, cwd: string): Record<string, SessionRegistryEntry> {
  const { surfaces, workspaces } = liveCmuxRefs(cwd);
  if (surfaces.size === 0 || workspaces.size === 0) {
    return entries;
  }

  const filtered: Record<string, SessionRegistryEntry> = {};
  let changed = false;

  for (const [surfaceRef, entry] of Object.entries(entries)) {
    if (surfaces.has(surfaceRef) && workspaces.has(entry.workspaceRef)) {
      filtered[surfaceRef] = entry;
      continue;
    }
    changed = true;
  }

  if (changed) {
    writeSessionRegistry(filtered);
  }

  return filtered;
}

function readSessionRegistry(cwd: string): Record<string, SessionRegistryEntry> {
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
      sessionTitle: typeof entry.sessionTitle === "string" ? entry.sessionTitle : "",
      recentPrompts: Array.isArray(entry.recentPrompts)
        ? entry.recentPrompts.filter((value): value is string => typeof value === "string" && value.trim()).slice(-MAX_SESSION_PROMPTS)
        : [],
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
    };
  }

  return pruneSessionRegistry(registry, cwd);
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

function currentWorkspaceDescription(cwd: string): string {
  const { workspaceRef } = currentCmuxRefs(cwd);
  if (!workspaceRef) {
    return "";
  }

  const result = run("cmux", ["tree", "--json"], cwd, { timeoutMs: 2000 });
  if (result.status !== 0 || result.error) {
    return "";
  }

  const parsed = parseJson(result.stdout);
  const windows = Array.isArray(parsed.windows) ? parsed.windows : [];
  for (const window of windows) {
    const workspaces = Array.isArray(asObject(window).workspaces) ? asObject(window).workspaces as unknown[] : [];
    for (const workspace of workspaces) {
      const info = asObject(workspace);
      if (firstString(info.ref) !== workspaceRef) {
        continue;
      }
      return firstString(info.description);
    }
  }

  return "";
}

function currentWorkspaceTitle(cwd: string): string {
  const { workspaceRef } = currentCmuxRefs(cwd);
  if (!workspaceRef) {
    return "";
  }

  const result = run("cmux", ["tree", "--json"], cwd, { timeoutMs: 2000 });
  if (result.status !== 0 || result.error) {
    return "";
  }

  const parsed = parseJson(result.stdout);
  const windows = Array.isArray(parsed.windows) ? parsed.windows : [];
  for (const window of windows) {
    const workspaces = Array.isArray(asObject(window).workspaces) ? asObject(window).workspaces as unknown[] : [];
    for (const workspace of workspaces) {
      const info = asObject(workspace);
      if (firstString(info.ref) !== workspaceRef) {
        continue;
      }
      return firstString(info.title);
    }
  }

  return "";
}

function currentSessionTitle(cwd: string): string {
  const title = currentWorkspaceTitle(cwd);
  if (!title) {
    return "";
  }
  return title.split(" | ")[0]?.trim() ?? "";
}

function isSelectedWorkspaceSurface(cwd: string): boolean {
  const { surfaceRef, workspaceRef } = currentCmuxRefs(cwd);
  if (!surfaceRef || !workspaceRef) {
    return true;
  }

  const result = run("cmux", ["tree", "--json"], cwd, { timeoutMs: 2000 });
  if (result.status !== 0 || result.error) {
    return true;
  }

  const parsed = parseJson(result.stdout);
  const windows = Array.isArray(parsed.windows) ? parsed.windows : [];
  for (const window of windows) {
    const workspaces = Array.isArray(asObject(window).workspaces) ? asObject(window).workspaces as unknown[] : [];
    for (const workspace of workspaces) {
      const workspaceInfo = asObject(workspace);
      if (firstString(workspaceInfo.ref) !== workspaceRef) {
        continue;
      }
      const panes = Array.isArray(workspaceInfo.panes) ? workspaceInfo.panes as unknown[] : [];
      for (const pane of panes) {
        const paneInfo = asObject(pane);
        if (firstString(paneInfo.selected_surface_ref) === surfaceRef) {
          return true;
        }
      }
      return false;
    }
  }

  return true;
}

function findSessionEntry(agent: "codex" | "claude", sessionId: string, cwd: string): SessionRegistryEntry | null {
  if (!sessionId) {
    return null;
  }

  const entries = readSessionRegistry(cwd);
  const { surfaceRef, rawSurfaceRef } = currentCmuxRefs(cwd);
  for (const candidate of [surfaceRef, rawSurfaceRef]) {
    if (!candidate) {
      continue;
    }
    const entry = entries[candidate];
    if (entry?.agent === agent && entry.sessionId === sessionId) {
      return entry;
    }
  }

  for (const entry of Object.values(entries)) {
    if (entry.agent === agent && entry.sessionId === sessionId) {
      return entry;
    }
  }

  return null;
}

function currentSurfaceSessionId(agent: "codex" | "claude", cwd: string): string {
  const entries = readSessionRegistry(cwd);
  const { surfaceRef, rawSurfaceRef } = currentCmuxRefs(cwd);
  for (const candidate of [surfaceRef, rawSurfaceRef]) {
    if (!candidate) {
      continue;
    }
    const entry = entries[candidate];
    if (entry?.agent === agent && entry.sessionId) {
      return entry.sessionId;
    }
  }
  return "";
}

function syntheticSessionId(agent: "codex" | "claude", cwd: string): string {
  const { surfaceRef, rawSurfaceRef } = currentCmuxRefs(cwd);
  const ref = surfaceRef || rawSurfaceRef;
  return ref ? `synthetic:${agent}:${ref}` : "";
}

function rememberSession(
  agent: "codex" | "claude",
  sessionId: string,
  cwd: string,
  options: { sessionTitle?: string; workspaceDescription?: string; recentPrompts?: string[] } = {},
): void {
  const { surfaceRef, workspaceRef, rawSurfaceRef } = currentCmuxRefs(cwd);
  if (!surfaceRef || !sessionId) {
    return;
  }

  const entries = readSessionRegistry(cwd);
  const existing = entries[surfaceRef];
  const previous = existing?.agent === agent && existing.sessionId === sessionId
    ? existing
    : findSessionEntry(agent, sessionId, cwd);
  const sessionTitle = options.sessionTitle || previous?.sessionTitle || "";
  const workspaceDescription = options.workspaceDescription ?? previous?.workspaceDescription ?? "";
  const recentPrompts = options.recentPrompts && options.recentPrompts.length > 0
    ? options.recentPrompts
    : previous?.recentPrompts ?? [];
  entries[surfaceRef] = {
    agent,
    sessionId,
    cwd,
    surfaceRef,
    workspaceRef,
    sessionTitle,
    workspaceDescription,
    recentPrompts,
    updatedAt: new Date().toISOString(),
  };
  if (rawSurfaceRef && rawSurfaceRef !== surfaceRef) {
    delete entries[rawSurfaceRef];
  }
  for (const [key, entry] of Object.entries(entries)) {
    if (key !== surfaceRef && entry.agent === agent && entry.sessionId === sessionId) {
      delete entries[key];
    }
  }
  writeSessionRegistry(entries);
}

function forgetSession(agent: "codex" | "claude", cwd: string): void {
  const { surfaceRef, rawSurfaceRef } = currentCmuxRefs(cwd);
  if (!surfaceRef) {
    return;
  }

  const entries = readSessionRegistry(cwd);
  const sessionId = entries[surfaceRef]?.agent === agent
    ? entries[surfaceRef].sessionId
    : rawSurfaceRef && entries[rawSurfaceRef]?.agent === agent
      ? entries[rawSurfaceRef].sessionId
      : "";

  for (const [key, entry] of Object.entries(entries)) {
    if (entry.agent !== agent) {
      continue;
    }
    if (key === surfaceRef || (rawSurfaceRef && key === rawSurfaceRef) || (sessionId && entry.sessionId === sessionId)) {
      delete entries[key];
    }
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

function firstDefinedString(object: JsonObject, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof object[key] === "string") {
      return String(object[key]).trim();
    }
  }
  return null;
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

function normalizePrompt(text: string, maxWidth = MAX_TASK_WIDTH): string {
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
  return clip(firstSentence, maxWidth);
}

function isMeaningfulPrompt(rawPrompt: string, normalizedPrompt: string): boolean {
  const trimmed = String(rawPrompt || "").trim();
  if (!normalizedPrompt) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return false;
  }
  return true;
}

function detectEmoji(text: string): string {
  void text;
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
  return String(value || "")
    .split("\n")[0]
    .trim()
    .replace(/^["'`]+|["'`]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasEmojiTitle(value: string): boolean {
  return Boolean(splitEmojiTitle(value).emoji);
}

function ensureEmojiTitle(value: string, referenceText: string): string {
  const parts = splitEmojiTitle(value);
  const rawLabel = compactModelLabel(parts.label || String(value || "").trim() || normalizePrompt(referenceText));
  const label = clip(rawLabel, MAX_TASK_WIDTH);
  if (!label) {
    return "";
  }
  return `${parts.emoji || detectEmoji(referenceText || label)} ${label}`;
}

function reusableCurrentTitle(value: string): string {
  const cleaned = String(value || "")
    .split("\n")[0]
    .trim()
    .replace(/\s+/gu, " ");
  if (!cleaned || !hasEmojiTitle(cleaned)) {
    return "";
  }
  return cleaned;
}

function fallbackTaskTitle(referenceText: string): string {
  const label = normalizePrompt(referenceText);
  if (!label) {
    return "";
  }
  return ensureEmojiTitle(label, referenceText);
}

function cleanModelDescription(value: string): string {
  return normalizePrompt(value, MAX_CONTEXT_PROMPT_WIDTH);
}

function buildSessionLabelPrompt(
  base: string,
  currentTitle: string,
  currentDescription: string,
  recentPrompts: string[],
): string {
  return [
    "You maintain cmux workspace labels for one long-lived AI coding session.",
    "Return JSON only on a single line:",
    "{\"title_action\":\"keep|replace\",\"title\":\"...\",\"description_action\":\"keep|replace|clear\",\"description\":\"...\"}",
    "Rules:",
    "- Use the user's language. Prefer Japanese if the prompts are mostly Japanese.",
    "- title is the long-lived session scope, not the latest request.",
    "- If prompts include both an overarching goal and narrower supporting work, keep the title at the overarching goal.",
    "- description is the current narrower phase or subtask.",
    "- Prefer the product, project, workstream, or document over skills, hooks, tooling, summaries, or path corrections.",
    "- Replace the title only if the overall session goal changed. Otherwise keep it.",
    "- title must start with exactly one emoji, then a short stable label.",
    "- title should usually fit within 14 Japanese characters after the emoji, or 24 ASCII characters.",
    "- title must not include repo suffixes, paths, URLs, quotes, or trailing punctuation.",
    "- If unsure, keep the current title and description. If no useful description exists, clear it.",
    "- If title_action is keep, title may be empty. If description_action is keep or clear, description may be empty.",
    "",
    `Base label: ${base}`,
    `Current title: ${currentTitle || "(none)"}`,
    `Current description: ${currentDescription || "(none)"}`,
    "Recent prompts, oldest first:",
    ...recentPrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
  ].join("\n");
}

function decideSessionLabelsWithClaude(
  base: string,
  currentTitle: string,
  currentDescription: string,
  recentPrompts: string[],
  cwd: string,
): SessionLabelDecision {
  const prompt = buildSessionLabelPrompt(base, currentTitle, currentDescription, recentPrompts);
  const raw = runClaudePrompt(prompt, cwd);
  const parsed = parseJsonObjectLoose(raw);
  const referenceText = recentPrompts[recentPrompts.length - 1] || currentDescription || currentTitle || base;
  const titleRaw = firstDefinedString(parsed, "title", "sessionTitle");
  const descriptionRaw = firstDefinedString(parsed, "description", "workspaceDescription");
  const titleAction = (firstDefinedString(parsed, "title_action", "titleAction") || "").toLowerCase();
  const descriptionAction = (firstDefinedString(parsed, "description_action", "descriptionAction") || "").toLowerCase();

  return {
    sessionTitle: titleAction === "keep"
      ? currentTitle || fallbackTaskTitle(referenceText) || ensureEmojiTitle(base, base)
      : titleRaw
        ? cleanModelTitle(titleRaw, referenceText)
        : currentTitle || fallbackTaskTitle(referenceText) || ensureEmojiTitle(base, base),
    workspaceDescription: descriptionAction === "keep"
      ? currentDescription
      : descriptionAction === "clear"
        ? ""
        : descriptionRaw === null
          ? currentDescription
          : cleanModelDescription(descriptionRaw),
  };
}

function decideSessionLabelsWithCodex(
  base: string,
  currentTitle: string,
  currentDescription: string,
  recentPrompts: string[],
  cwd: string,
): SessionLabelDecision {
  const prompt = buildSessionLabelPrompt(base, currentTitle, currentDescription, recentPrompts);
  const raw = runCodexPromptText(prompt, cwd);
  const parsed = parseJsonObjectLoose(raw);
  const referenceText = recentPrompts[recentPrompts.length - 1] || currentDescription || currentTitle || base;
  const titleRaw = firstDefinedString(parsed, "title", "sessionTitle");
  const descriptionRaw = firstDefinedString(parsed, "description", "workspaceDescription");
  const titleAction = (firstDefinedString(parsed, "title_action", "titleAction") || "").toLowerCase();
  const descriptionAction = (firstDefinedString(parsed, "description_action", "descriptionAction") || "").toLowerCase();

  return {
    sessionTitle: titleAction === "keep"
      ? currentTitle || fallbackTaskTitle(referenceText) || ensureEmojiTitle(base, base)
      : titleRaw
        ? cleanModelTitle(titleRaw, referenceText)
        : currentTitle || fallbackTaskTitle(referenceText) || ensureEmojiTitle(base, base),
    workspaceDescription: descriptionAction === "keep"
      ? currentDescription
      : descriptionAction === "clear"
        ? ""
        : descriptionRaw === null
          ? currentDescription
          : cleanModelDescription(descriptionRaw),
  };
}

function decideSessionLabels(
  base: string,
  currentTitle: string,
  currentDescription: string,
  recentPrompts: string[],
  cwd: string,
): SessionLabelDecision {
  if (recentPrompts.length === 0) {
    return {
      sessionTitle: currentTitle || ensureEmojiTitle(base, base),
      workspaceDescription: currentDescription,
    };
  }

  if (NAME_PROVIDER === "claude") {
    return decideSessionLabelsWithClaude(base, currentTitle, currentDescription, recentPrompts, cwd);
  }

  return decideSessionLabelsWithCodex(base, currentTitle, currentDescription, recentPrompts, cwd);
}

function normalizedTopicKey(value: string): string {
  return compactModelLabel(splitEmojiTitle(value).label || value).toLowerCase();
}

function stripRequestSuffix(value: string): string {
  let next = String(value || "").trim();
  const patterns = [
    /^(.*?)(?:について|のこと|の件)?(?:を)?(?:教えて(?:ください)?|調べて(?:ください)?|確認して(?:ください)?|見て(?:みて)?(?:ください)?|直して(?:ください)?|修正して(?:ください)?|作って(?:ください)?|作成して(?:ください)?|追加して(?:ください)?|更新して(?:ください)?|実装して(?:ください)?|説明して(?:ください)?|まとめて(?:ください)?|要約して(?:ください)?|対応して(?:ください)?|整理して(?:ください)?|見直して(?:ください)?|相談して(?:ください)?|考えて(?:ください)?|教えてほしい|見てほしい)$/u,
    /^(.*?)(?:の状態|の内容|の状況)$/u,
  ];

  for (const pattern of patterns) {
    const match = next.match(pattern);
    if (match?.[1]) {
      next = match[1].trim();
    }
  }

  return next.trim();
}

function extractQuotedTopic(value: string): string {
  const quotedPatterns = [
    /`([^`]{2,})`/u,
    /「([^」]{2,})」/u,
    /『([^』]{2,})』/u,
    /"([^"]{2,})"/u,
  ];

  for (const pattern of quotedPatterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function stripPathLeadIn(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^[\p{Script=Hiragana}\p{Script=Katakana}ー、,\s]+(?=(?:~\/|\.{1,2}\/|\/))/u, "")
    .trim();
}

function isPathLikeFragment(value: string): boolean {
  const candidate = stripPathLeadIn(compactModelLabel(splitEmojiTitle(value).label || value));
  if (!candidate) {
    return false;
  }

  return /^(?:~\/|\.{1,2}\/|\/)[^\s]+$/u.test(candidate);
}

function isSpecificTopicCandidate(value: string): boolean {
  const candidate = compactModelLabel(splitEmojiTitle(value).label || value);
  if (!candidate) {
    return false;
  }
  if (isPathLikeFragment(candidate)) {
    return false;
  }
  if (/^(?:これ|それ|あれ|この|その|あの|ここ|そこ|あそこ|こちら|そちら|あちら)/u.test(candidate)) {
    return false;
  }
  const width = stringWidth(candidate);
  const hasAsciiIdentifier = /[A-Za-z#][A-Za-z0-9._/-]{2,}/u.test(candidate);
  const hasIssueNumber = /#[0-9]+/u.test(candidate);
  const hasHan = /[\p{Script=Han}]/u.test(candidate);
  const hasKatakana = /[\p{Script=Katakana}]/u.test(candidate);
  const hasJoiner = /[・/／]/u.test(candidate);
  const hasWhitespace = /\s/u.test(candidate);

  if (hasAsciiIdentifier) {
    return true;
  }
  if (hasIssueNumber) {
    return true;
  }
  if (hasJoiner && width >= 5) {
    return true;
  }
  if ((hasHan || hasKatakana) && hasWhitespace && width >= 8) {
    return true;
  }
  if (hasHan && width >= 10) {
    return true;
  }
  if (hasKatakana && width >= 10) {
    return true;
  }
  return false;
}

function extractTitleTopic(rawPrompt: string): string {
  const normalized = normalizePrompt(rawPrompt, MAX_CONTEXT_PROMPT_WIDTH);
  if (!normalized) {
    return "";
  }

  const explicit = extractQuotedTopic(normalized);
  const stripped = stripPathLeadIn(stripRequestSuffix(explicit || normalized))
    .replace(/[、。,.]+$/gu, "")
    .trim();
  const candidate = clip(compactModelLabel(stripped), MAX_TASK_WIDTH);

  if (!isSpecificTopicCandidate(candidate)) {
    return "";
  }

  return candidate;
}

function latestPromptDescription(rawPrompt: string): string {
  const normalized = normalizePrompt(rawPrompt, MAX_CONTEXT_PROMPT_WIDTH);
  if (!normalized) {
    return "";
  }
  if (extractTitleTopic(normalized)) {
    return normalized;
  }

  const stripped = stripRequestSuffix(normalized);
  if (isPathLikeFragment(stripped)) {
    return "";
  }
  if (/[A-Za-z#][A-Za-z0-9._/-]{2,}/u.test(normalized)) {
    return normalized;
  }
  if ((/[\p{Script=Han}]/u.test(stripped) || /[\p{Script=Katakana}]/u.test(stripped))
    && /\s/u.test(stripped)
    && stringWidth(stripped) >= 12) {
    return normalized;
  }
  return "";
}

function chooseStableTaskTitle(currentTitle: string, recentPrompts: string[]): string {
  const current = reusableCurrentTitle(currentTitle);
  const currentTopic = extractTitleTopic(current);
  const specificTopics = recentPrompts
    .map((prompt) => extractTitleTopic(prompt))
    .filter(Boolean);

  if (specificTopics.length === 0) {
    return currentTopic ? current : "";
  }

  const newestTopic = specificTopics[specificTopics.length - 1];
  let newestRunLength = 0;
  for (let index = specificTopics.length - 1; index >= 0; index -= 1) {
    if (normalizedTopicKey(specificTopics[index]) !== normalizedTopicKey(newestTopic)) {
      break;
    }
    newestRunLength += 1;
  }

  if (currentTopic) {
    if (normalizedTopicKey(currentTopic) === normalizedTopicKey(newestTopic)) {
      return current;
    }
    if (newestRunLength >= 2) {
      return ensureEmojiTitle(newestTopic, newestTopic);
    }
    return current;
  }

  return ensureEmojiTitle(specificTopics[0], specificTopics[0]);
}

function cleanModelTitle(value: string, referenceText: string): string {
  const parts = splitEmojiTitle(value);
  const rawLabel = compactModelLabel(parts.label || normalizePrompt(referenceText));
  const label = clip(rawLabel, MAX_TASK_WIDTH);
  if (!label) {
    return "";
  }
  return `${parts.emoji || detectEmoji(referenceText)} ${label}`;
}

function isKeepResponse(value: string): boolean {
  const cleaned = String(value || "")
    .split("\n")[0]
    .trim()
    .replace(/^["'`]+|["'`]+$/gu, "");
  return /^(keep|same)$/iu.test(cleaned);
}

function buildPromptForModel(currentTitle: string, recentPrompts: string[]): string {
  return [
    "Turn the whole agent session into a very short stable cmux title.",
    "Rules:",
    "- Output one line only.",
    "- Keep the user's language.",
    "- Start with exactly one relevant emoji, then a space.",
    "- Emoji is required.",
    "- Be aggressively concise. Do not copy the prompts verbatim.",
    "- Prefer a noun phrase or short action phrase, not a question.",
    "- Prefer a compact shorthand that still distinguishes the task.",
    "- Prefer formats like '<subject><action>' or '<subject><action>・<subject><action>'.",
    "- Prefer the overall session topic, not only the latest prompt.",
    "- If the current title still fits the session, keep it exactly.",
    "- Only change the title if the session direction has clearly shifted.",
    "- Treat tests, cleanup, comments, and small follow-up edits as substeps unless they change the main topic.",
    "- Never use generic labels like 'タイトル', '作業', '対応', 'task', or 'workspace'. Use the concrete topic instead.",
    "- Use at most 12 visible Japanese characters after the emoji, or up to 18 ASCII characters.",
    "- Good examples: '🐛 バグ修正・テスト追加', '⚙️ Hook設定整理', '🎨 余白調整'.",
    "- Avoid particles like 'を' or sentence fragments ending with 'して'.",
    "- Bad: '🎨 デザインを見直して余白調整'. Good: '🎨 余白調整' or '🎨 デザイン調整'.",
    "- No quotes.",
    "- No trailing punctuation.",
    "",
    `Current title: ${currentTitle || "(none)"}`,
    "Meaningful prompts in this session, oldest first:",
    ...recentPrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
  ].join("\n");
}

function buildKeepOrRetitlePrompt(currentTitle: string, recentPrompts: string[]): string {
  return [
    "Decide whether the current cmux title should stay the same for this agent session.",
    "Rules:",
    "- Output exactly one line.",
    "- If the current title still fits the session, output exactly KEEP.",
    "- If the current title has no emoji, do not keep it. Output a replacement title instead.",
    "- Only output a new title if the session direction has clearly shifted enough that the current title is now misleading.",
    "- Follow the same title rules as usual: one emoji, one short label, same language, no quotes, no trailing punctuation.",
    "- Emoji is required.",
    "- Prefer session-level stability over reacting to one small follow-up prompt.",
    "- Treat tests, cleanup, comments, and small follow-up edits as substeps unless they change the main topic.",
    "- Never use generic labels like 'タイトル', '作業', '対応', 'task', or 'workspace'. Use the concrete topic instead.",
    "",
    `Current title: ${currentTitle}`,
    "Meaningful prompts in this session, oldest first:",
    ...recentPrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
  ].join("\n");
}

function buildRepairPrompt(currentTitle: string, recentPrompts: string[], previousTitle: string): string {
  return [
    "Rewrite the previous cmux title so it stays stable and rule-compliant for the whole session.",
    "Rules:",
    "- Output one line only.",
    "- Keep the user's language.",
    "- Start with exactly one relevant emoji, then a space.",
    "- Emoji is required.",
    "- Prefer keeping the current title if it still fits.",
    "- Make it shorter than the previous title if you rewrite it.",
    "- Avoid particles like 'を' and sentence fragments ending with 'して'.",
    "- Prefer compact labels like 'Hook整理', '余白調整', 'バグ修正・テスト追加'.",
    "- Never use generic labels like 'タイトル', '作業', '対応', 'task', or 'workspace'. Use the concrete topic instead.",
    "- Use at most 12 visible Japanese characters after the emoji, or up to 18 ASCII characters.",
    "",
    `Current title: ${currentTitle || "(none)"}`,
    "Meaningful prompts in this session, oldest first:",
    ...recentPrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
    `Previous title: ${previousTitle}`,
  ].join("\n");
}

function runClaudePrompt(prompt: string, cwd: string): string {
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
      prompt,
    ],
    cwd,
    { timeoutMs: 14000 },
  );

  if (result.status !== 0 || result.error) {
    return "";
  }

  return result.stdout;
}

function titleFromClaude(referenceText: string, currentTitle: string, recentPrompts: string[], cwd: string): string {
  const keepableTitle = reusableCurrentTitle(currentTitle);
  if (keepableTitle) {
    const decision = runClaudePrompt(buildKeepOrRetitlePrompt(keepableTitle, recentPrompts), cwd);
    if (!decision || isKeepResponse(decision)) {
      return keepableTitle;
    }

    const candidate = cleanModelTitle(decision, referenceText);
    return candidate || keepableTitle;
  }

  return cleanModelTitle(runClaudePrompt(buildPromptForModel(currentTitle, recentPrompts), cwd), referenceText);
}

function runCodexTitlePrompt(prompt: string, cwd: string, referenceText: string): string {
  const raw = runCodexPromptText(prompt, cwd);
  if (!raw) {
    return "";
  }
  return cleanModelTitle(raw, referenceText);
}

function runCodexPromptText(prompt: string, cwd: string): string {
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

  let output = "";
  if (result.status === 0 && !result.error) {
    try {
      output = readFileSync(outputFile, "utf8");
    } catch {
      output = "";
    }
  }

  rmSync(tmpDir, { recursive: true, force: true });
  return output;
}

function titleFromCodex(referenceText: string, currentTitle: string, recentPrompts: string[], cwd: string): string {
  const keepableTitle = reusableCurrentTitle(currentTitle);
  if (keepableTitle) {
    const decision = runCodexPromptText(buildKeepOrRetitlePrompt(keepableTitle, recentPrompts), cwd);
    if (!decision || isKeepResponse(decision)) {
      return keepableTitle;
    }

    const candidate = cleanModelTitle(decision, referenceText);
    return candidate || keepableTitle;
  }

  return runCodexTitlePrompt(buildPromptForModel(currentTitle, recentPrompts), cwd, referenceText);
}

function appendRecentPrompts(existing: string[], rawPrompt: string): string[] {
  const normalized = normalizePrompt(rawPrompt, MAX_CONTEXT_PROMPT_WIDTH);
  if (!normalized) {
    return existing;
  }

  const next = existing.filter(Boolean);
  if (next[next.length - 1] === normalized) {
    return next.slice(-MAX_SESSION_PROMPTS);
  }

  next.push(normalized);
  return next.slice(-MAX_SESSION_PROMPTS);
}

function mergeRecentPrompts(existing: string[], prompts: string[]): string[] {
  let next = existing.filter(Boolean);
  for (const rawPrompt of prompts) {
    const normalized = normalizePrompt(rawPrompt, MAX_CONTEXT_PROMPT_WIDTH);
    if (!normalized) {
      continue;
    }
    if (next[next.length - 1] === normalized) {
      continue;
    }
    next.push(normalized);
    if (next.length > MAX_SESSION_PROMPTS) {
      next = next.slice(-MAX_SESSION_PROMPTS);
    }
  }
  return next;
}

function resolveSessionTask(
  currentTitle: string,
  currentDescription: string,
  existingPrompts: string[],
  promptSelection: PromptSelection,
  base: string,
  cwd: string,
): { task: string; workspaceDescription: string; recentPrompts: string[] } {
  if (promptSelection.source === "none") {
    return {
      task: currentTitle,
      workspaceDescription: currentDescription,
      recentPrompts: existingPrompts,
    };
  }

  const incomingPrompts = promptSelection.prompts.length > 0
    ? promptSelection.prompts
    : promptSelection.prompt
      ? [promptSelection.prompt]
      : [];
  const recentPrompts = mergeRecentPrompts(existingPrompts, incomingPrompts);
  if (recentPrompts.length === 0) {
    return {
      task: currentTitle,
      workspaceDescription: currentDescription,
      recentPrompts,
    };
  }

  const decision = decideSessionLabels(base, currentTitle, currentDescription, recentPrompts, cwd);

  return {
    task: decision.sessionTitle,
    workspaceDescription: decision.workspaceDescription,
    recentPrompts,
  };
}

function generateTaskTitle(referenceText: string, currentTitle: string, recentPrompts: string[], cwd: string): string {
  if (!referenceText) {
    return "";
  }

  if (NAME_PROVIDER === "claude") {
    return titleFromClaude(referenceText, currentTitle, recentPrompts, cwd) || fallbackTaskTitle(referenceText);
  }

  if (NAME_PROVIDER === "codex") {
    return titleFromCodex(referenceText, currentTitle, recentPrompts, cwd) || fallbackTaskTitle(referenceText);
  }

  return fallbackTaskTitle(referenceText);
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
    return ensureEmojiTitle(base, base);
  }
  const titledTask = ensureEmojiTitle(task, task || base);
  const taskLabel = compactModelLabel(splitEmojiTitle(titledTask).label);
  const baseLabel = compactModelLabel(base);
  if (!taskLabel || taskLabel === baseLabel) {
    return ensureEmojiTitle(base, base);
  }
  return `${titledTask} | ${clip(base, MAX_BASE_WIDTH)}`;
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

function findRecentMeaningfulPrompts(threadId: string, limit = MAX_SESSION_PROMPTS): string[] {
  if (!threadId) {
    return [];
  }

  const lines = readHistoryLines();
  const prompts: string[] = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index]) as { session_id?: string; text?: string };
      if (entry.session_id !== threadId || typeof entry.text !== "string") {
        continue;
      }
      const normalized = normalizePrompt(entry.text, MAX_CONTEXT_PROMPT_WIDTH);
      if (!isMeaningfulPrompt(entry.text, normalized)) {
        continue;
      }
      if (prompts[0] === entry.text) {
        continue;
      }
      prompts.unshift(entry.text);
      if (prompts.length >= limit) {
        break;
      }
    } catch {
      // Ignore malformed lines.
    }
  }

  return prompts;
}

function pickPrompt(input: JsonObject, eventName: string): PromptSelection {
  const rawPrompt = firstString(input.prompt);
  const normalizedPrompt = normalizePrompt(rawPrompt);
  const threadId = firstString(process.env.CODEX_THREAD_ID, input.thread_id, input.session_id, input.sessionId);
  const historyPrompts = threadId ? findRecentMeaningfulPrompts(threadId) : [];
  if (eventName === "prompt-submit" && isMeaningfulPrompt(rawPrompt, normalizedPrompt)) {
    return {
      prompt: rawPrompt,
      prompts: mergeRecentPrompts(historyPrompts, [rawPrompt]),
      source: "current",
    };
  }

  if (!threadId) {
    return {
      prompt: "",
      prompts: [],
      source: "none",
    };
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const prompts = findRecentMeaningfulPrompts(threadId);
    const prompt = prompts[prompts.length - 1] || findLatestMeaningfulPrompt(threadId);
    if (prompt || prompts.length > 0) {
      return {
        prompt: prompt || "",
        prompts,
        source: "history",
      };
    }
    sleepMs(150);
  }

  return {
    prompt: "",
    prompts: [],
    source: "none",
  };
}

function renameWorkspace(title: string, cwd: string): void {
  const workspaceId = process.env.CMUX_WORKSPACE_ID;
  if (!workspaceId || !title) {
    return;
  }
  run("cmux", ["rename-workspace", "--workspace", workspaceId, title], cwd);
}

function setWorkspaceDescription(description: string, cwd: string): void {
  const workspaceId = process.env.CMUX_WORKSPACE_ID;
  if (!workspaceId) {
    return;
  }
  if (!description) {
    run("cmux", ["workspace-action", "--workspace", workspaceId, "--action", "clear-description"], cwd);
    return;
  }
  run(
    "cmux",
    ["workspace-action", "--workspace", workspaceId, "--action", "set-description", "--description", description],
    cwd,
  );
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
  const explicitSessionId = firstString(process.env.CODEX_THREAD_ID, input.thread_id, input.session_id, input.sessionId);
  const sessionId = explicitSessionId
    || currentSurfaceSessionId("codex", cwd)
    || (eventName === "session-start" ? syntheticSessionId("codex", cwd) : "");
  const base = projectLabel(cwd);
  const promptSelection = pickPrompt(input, eventName);
  const sessionEntry = sessionId ? findSessionEntry("codex", sessionId, cwd) : null;
  const currentTitle = sessionEntry?.sessionTitle || currentSessionTitle(cwd);
  const currentDescription = sessionEntry?.workspaceDescription ?? currentWorkspaceDescription(cwd);
  const { task, workspaceDescription, recentPrompts } = resolveSessionTask(
    currentTitle,
    currentDescription,
    sessionEntry?.recentPrompts ?? [],
    promptSelection,
    base,
    cwd,
  );
  const rawPrompt = promptSelection.prompt;
  const referenceText = rawPrompt || recentPrompts.join(" / ") || base;
  const sessionTitle = ensureEmojiTitle(task || base, referenceText || base);
  const workspaceTitle = workspaceLabel(base, sessionTitle);
  const tabTitle = "(cmux default)";

  if (DRY_RUN) {
    jsonOut({
      event: eventName,
      cwd,
      sessionId,
      rawPrompt,
      promptSource: promptSelection.source,
      recentPrompts,
      workspaceTitle,
      workspaceDescription,
      tabTitle,
      sessionTitle,
    });
    return;
  }

  if (eventName === "stop") {
    forgetSession("codex", cwd);
  } else if ((eventName === "session-start" || eventName === "prompt-submit") && sessionId) {
    rememberSession("codex", sessionId, cwd, {
      sessionTitle,
      workspaceDescription,
      recentPrompts,
    });
  }

  const cmuxOutput = runCmuxHook(rawInput, eventName, cwd);
  const output = eventName === "prompt-submit"
    ? mergeOutputs(cmuxOutput, { hookSpecificOutput: { sessionTitle } })
    : cmuxOutput;
  const shouldUpdateWorkspace = isSelectedWorkspaceSurface(cwd);
  if (shouldUpdateWorkspace) {
    renameWorkspace(workspaceTitle, cwd);
    setWorkspaceDescription(workspaceDescription, cwd);
  }
  clearTabName(cwd);
  jsonOut(output);
}

main();
