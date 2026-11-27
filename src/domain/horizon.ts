import { TaskiError, text } from "./ticket.ts";

/**
 * Horizonte: Notion-style documents for what the project will do later (ideas, research, audits).
 * A document is an ordered list of blocks; inline formatting (**bold**, `code`, [links](…)) stays as Markdown text.
 */
export const blockTypes = ["p", "h1", "h2", "h3", "li", "ol", "todo", "quote", "code", "table", "divider"] as const;
export type BlockType = typeof blockTypes[number];
export const horizonStatuses = ["idea", "exploring", "planned", "archived"] as const;
export type HorizonStatus = typeof horizonStatuses[number];

export interface HorizonBlock {
  id: string;
  type: BlockType;
  text: string;
  /** Nesting for list items and tasks, 0–3. */
  indent?: number;
  /** Only for tasks. */
  done?: boolean;
}
export interface HorizonDoc {
  id: string;
  title: string;
  status: HorizonStatus;
  areaId: string | null;
  blocks: HorizonBlock[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}
export interface HorizonSummary extends Omit<HorizonDoc, "blocks"> {
  excerpt: string;
  blockCount: number;
  tasks: { done: number; total: number };
}
export interface HorizonReceipt { id: string; version: number; changed: string[] }

export const limits = { title: 160, blockText: 20000, blocks: 1000, markdown: 200000 } as const;
const listTypes: readonly BlockType[] = ["li", "ol", "todo"];
const multiline: readonly BlockType[] = ["p", "quote", "code", "table"];

export function horizonStatus(value: unknown): HorizonStatus {
  if (!(horizonStatuses as readonly unknown[]).includes(value)) throw new TaskiError("INVALID_INPUT", "Invalid status: use idea, exploring, planned or archived");
  return value as HorizonStatus;
}

export function horizonTitle(value: unknown): string {
  return text(value, "title", limits.title).trim();
}

/** Validates blocks from a client; unknown fields are rejected and IDs must be unique. */
export function horizonBlocks(value: unknown): HorizonBlock[] {
  if (!Array.isArray(value) || value.length > limits.blocks) throw new TaskiError("INVALID_INPUT", `Invalid blocks: expected up to ${limits.blocks}`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TaskiError("INVALID_INPUT", `Invalid block ${index}`);
    const source = entry as Record<string, unknown>;
    for (const key of Object.keys(source)) if (!["id", "type", "text", "indent", "done"].includes(key)) throw new TaskiError("INVALID_INPUT", `Unknown block field: ${key}`);
    if (typeof source.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(source.id) || seen.has(source.id)) throw new TaskiError("INVALID_INPUT", `Invalid block id at ${index}`);
    seen.add(source.id);
    if (!(blockTypes as readonly unknown[]).includes(source.type)) throw new TaskiError("INVALID_INPUT", `Invalid block type at ${index}`);
    const type = source.type as BlockType;
    const body = type === "divider" ? "" : text(source.text ?? "", `block ${index} text`, limits.blockText, true);
    if (!multiline.includes(type) && body.includes("\n")) throw new TaskiError("INVALID_INPUT", `Block ${index} must be a single line`);
    const block: HorizonBlock = { id: source.id, type, text: body };
    if (source.indent !== undefined && source.indent !== 0) {
      if (!listTypes.includes(type) || typeof source.indent !== "number" || !Number.isInteger(source.indent) || source.indent < 0 || source.indent > 3) {
        throw new TaskiError("INVALID_INPUT", `Invalid indent at ${index}`);
      }
      block.indent = source.indent;
    }
    if (source.done !== undefined) {
      if (type !== "todo" || typeof source.done !== "boolean") throw new TaskiError("INVALID_INPUT", `Invalid done at ${index}`);
      if (source.done) block.done = true;
    }
    return block;
  });
}

/**
 * Converts Markdown into blocks: headings, lists (with nesting), tasks, quotes, fenced code, tables and dividers.
 * Paragraph lines are joined until a blank line, as Markdown does. A leading `# Title` can become the title.
 */
export function markdownToBlocks(markdown: string, newId: () => string): { title: string | null; blocks: HorizonBlock[] } {
  if (markdown.length > limits.markdown) throw new TaskiError("INVALID_INPUT", `Markdown is longer than ${limits.markdown} characters`);
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: HorizonBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ id: newId(), type: "p", text: paragraph.join(" ") });
    paragraph = [];
  };
  const indentOf = (spaces: string) => Math.min(3, Math.floor(spaces.replace(/\t/g, "  ").length / 2));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    if (/^```/.test(trimmed)) {
      flush();
      const body: string[] = [];
      while (++index < lines.length && !/^```/.test(lines[index]!.trim())) body.push(lines[index]!);
      blocks.push({ id: newId(), type: "code", text: body.join("\n") });
      continue;
    }
    if (trimmed.startsWith("|")) {
      flush();
      const rows = [trimmed];
      while (index + 1 < lines.length && lines[index + 1]!.trim().startsWith("|")) rows.push(lines[++index]!.trim());
      blocks.push({ id: newId(), type: "table", text: rows.join("\n") });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flush(); blocks.push({ id: newId(), type: "divider", text: "" }); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      blocks.push({ id: newId(), type: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: heading[2]!.trim() });
      continue;
    }
    const task = /^(\s*)[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(line);
    if (task) {
      flush();
      const block: HorizonBlock = { id: newId(), type: "todo", text: task[3]! };
      const indent = indentOf(task[1]!); if (indent) block.indent = indent;
      if (task[2] !== " ") block.done = true;
      blocks.push(block);
      continue;
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const block: HorizonBlock = { id: newId(), type: /\d/.test(item[2]!) ? "ol" : "li", text: item[3]! };
      const indent = indentOf(item[1]!); if (indent) block.indent = indent;
      blocks.push(block);
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const quote = [trimmed.replace(/^>\s?/, "")];
      while (index + 1 < lines.length && lines[index + 1]!.trim().startsWith(">")) quote.push(lines[++index]!.trim().replace(/^>\s?/, ""));
      blocks.push({ id: newId(), type: "quote", text: quote.join("\n") });
      continue;
    }
    // A wrapped line right after a list item continues that item.
    const previous = blocks.at(-1);
    if (!paragraph.length && previous && listTypes.includes(previous.type) && /^\s+/.test(line) && lines[index - 1]?.trim()) {
      previous.text = `${previous.text} ${trimmed}`;
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  for (const block of blocks) if (block.text.length > limits.blockText) block.text = block.text.slice(0, limits.blockText);
  if (blocks.length > limits.blocks) throw new TaskiError("INVALID_INPUT", `Markdown produces more than ${limits.blocks} blocks`);
  const first = blocks[0];
  if (first?.type === "h1") return { title: first.text.slice(0, limits.title) || null, blocks: blocks.slice(1) };
  return { title: null, blocks };
}

export function blocksToMarkdown(title: string, blocks: readonly HorizonBlock[]): string {
  const out: string[] = [`# ${title}`, ""];
  let previousList = false;
  let number = 0;
  for (const block of blocks) {
    const list = listTypes.includes(block.type);
    if (!list && previousList) out.push("");
    const pad = "  ".repeat(block.indent ?? 0);
    number = block.type === "ol" ? number + 1 : 0;
    switch (block.type) {
      case "h1": out.push(`# ${block.text}`, ""); break;
      case "h2": out.push(`## ${block.text}`, ""); break;
      case "h3": out.push(`### ${block.text}`, ""); break;
      case "li": out.push(`${pad}- ${block.text}`); break;
      case "ol": out.push(`${pad}${number}. ${block.text}`); break;
      case "todo": out.push(`${pad}- [${block.done ? "x" : " "}] ${block.text}`); break;
      case "quote": out.push(...block.text.split("\n").map((line) => `> ${line}`), ""); break;
      case "code": out.push("```", block.text, "```", ""); break;
      case "table": out.push(block.text, ""); break;
      case "divider": out.push("---", ""); break;
      default: out.push(block.text, "");
    }
    previousList = list;
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/** Short, plain description for lists: the first paragraph without Markdown markers. */
export function summarize(doc: HorizonDoc): HorizonSummary {
  const { blocks, ...rest } = doc;
  const first = blocks.find((block) => block.type === "p" || block.type === "quote")?.text ?? "";
  const plain = first.replace(/\*\*|__|`|\[\[|\]\]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
  const tasks = blocks.filter((block) => block.type === "todo");
  return { ...rest, excerpt: plain.length > 180 ? `${plain.slice(0, 179)}…` : plain, blockCount: blocks.length,
    tasks: { done: tasks.filter((block) => block.done).length, total: tasks.length } };
}
