import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { HorizonBlock, HorizonBlockType } from "../../../client/index.ts";
import { Inline, MarkdownTable } from "./inline.tsx";

export const blockOptions: readonly { type: HorizonBlockType; label: string; shortcut: string }[] = [
  { type: "p", label: "Texto", shortcut: "" },
  { type: "h1", label: "Título", shortcut: "#" },
  { type: "h2", label: "Subtítulo", shortcut: "##" },
  { type: "h3", label: "Encabezado", shortcut: "###" },
  { type: "li", label: "Lista", shortcut: "-" },
  { type: "ol", label: "Lista numerada", shortcut: "1." },
  { type: "todo", label: "Tarea", shortcut: "[]" },
  { type: "quote", label: "Cita", shortcut: ">" },
  { type: "code", label: "Código", shortcut: "```" },
  { type: "table", label: "Tabla", shortcut: "|" },
  { type: "divider", label: "Separador", shortcut: "---" },
];

// Typed at the start of an empty-ish block, these turn it into another type, as in Conti and Notion.
const shortcuts: readonly [RegExp, HorizonBlockType][] = [
  [/^###\s/, "h3"], [/^##\s/, "h2"], [/^#\s/, "h1"], [/^\[\s?\]\s/, "todo"], [/^[-*]\s/, "li"], [/^1[.)]\s/, "ol"],
  [/^>\s/, "quote"], [/^```$/, "code"], [/^---$/, "divider"],
];
const multiline: readonly HorizonBlockType[] = ["p", "quote", "code", "table"];
const lists: readonly HorizonBlockType[] = ["li", "ol", "todo"];
const tableTemplate = "| Columna | Columna |\n|---|---|\n|  |  |";

/**
 * Number for each numbered item: counted per nesting level, so a nested bullet does not restart the parent list;
 * any non-list block restarts every level.
 */
export function listNumbers(blocks: readonly HorizonBlock[]): number[] {
  const counters = [0, 0, 0, 0];
  return blocks.map((block) => {
    const level = block.indent ?? 0;
    if (!lists.includes(block.type)) { counters.fill(0); return 0; }
    for (let deeper = level + 1; deeper < counters.length; deeper++) counters[deeper] = 0;
    if (block.type !== "ol") { counters[level] = 0; return 0; }
    counters[level] = counters[level]! + 1;
    return counters[level]!;
  });
}

export function newBlock(type: HorizonBlockType = "p", text = ""): HorizonBlock {
  return { id: crypto.randomUUID(), type, text };
}

function Grow({ block, index, onChange, onKey, register, placeholder }: {
  block: HorizonBlock; index: number; placeholder: string;
  onChange: (text: string) => void; onKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  register: (element: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [block.text, block.type]);
  return <textarea ref={(element) => { ref.current = element; register(element); }} className="hz-blk__text" rows={1}
    value={block.text} aria-label={`Bloque ${index + 1}: ${blockOptions.find((option) => option.type === block.type)?.label ?? "Texto"}`}
    placeholder={placeholder} spellCheck onChange={(event) => onChange(event.target.value)} onKeyDown={onKey} />;
}

/** Read mode: formatted inline text, numbered lists and real tables. */
export function BlockView({ blocks }: { blocks: readonly HorizonBlock[] }) {
  const numbers = listNumbers(blocks);
  return <div className="hz-body hz-body--read">{blocks.map((block, index) => {
    const number = numbers[index];
    // Empty lines left by a template are for writing, not for reading.
    if (block.type !== "divider" && !block.text.trim()) return null;
    const style = { "--indent": block.indent ?? 0 } as CSSProperties;
    switch (block.type) {
      case "h1": return <h2 key={block.id} className="hz-read hz-read--h1"><Inline text={block.text} /></h2>;
      case "h2": return <h3 key={block.id} className="hz-read hz-read--h2"><Inline text={block.text} /></h3>;
      case "h3": return <h4 key={block.id} className="hz-read hz-read--h3"><Inline text={block.text} /></h4>;
      case "li": return <p key={block.id} className="hz-read hz-read--li" style={style}><span aria-hidden="true">•</span><span><Inline text={block.text} /></span></p>;
      case "ol": return <p key={block.id} className="hz-read hz-read--li" style={style}><span aria-hidden="true">{number}.</span><span><Inline text={block.text} /></span></p>;
      case "todo": return <p key={block.id} className="hz-read hz-read--todo" data-done={block.done || undefined} style={style}>
        <span className="hz-check" aria-hidden="true">{block.done ? "✓" : ""}</span>
        <span><span className="visually-hidden">{block.done ? "Hecho: " : "Pendiente: "}</span><Inline text={block.text} /></span></p>;
      case "quote": return <blockquote key={block.id} className="hz-read hz-read--quote">{block.text.split("\n").map((line, i) => <p key={i}><Inline text={line} /></p>)}</blockquote>;
      case "code": return <pre key={block.id} className="hz-read hz-read--code"><code>{block.text}</code></pre>;
      case "table": return <MarkdownTable key={block.id} text={block.text} />;
      case "divider": return <hr key={block.id} />;
      default: return block.text ? <p key={block.id} className="hz-read"><Inline text={block.text} /></p> : null;
    }
  })}</div>;
}

/** Notion-style block editor: "/" menu, Markdown shortcuts, Enter/Backspace/arrows and Tab to nest lists. */
export function BlockEditor({ blocks, onChange }: { blocks: readonly HorizonBlock[]; onChange: (blocks: HorizonBlock[]) => void }) {
  const [slash, setSlash] = useState<{ index: number; selected: number } | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());

  function focus(id: string, position?: number) {
    requestAnimationFrame(() => {
      const element = refs.current.get(id);
      if (!element) return;
      element.focus();
      const at = position ?? element.value.length;
      element.setSelectionRange(at, at);
    });
  }
  function replace(index: number, block: HorizonBlock) {
    const next = [...blocks];
    next[index] = block;
    onChange(next);
  }
  /** `refocus` is false for typed shortcuts: the same field keeps focus and the caret stays where typing continues. */
  function retype(index: number, type: HorizonBlockType, text: string, refocus = true) {
    const current = blocks[index]!;
    const block: HorizonBlock = { id: current.id, type, text: type === "table" && !text ? tableTemplate : type === "divider" ? "" : text };
    if (lists.includes(type) && current.indent) block.indent = current.indent;
    const next = [...blocks];
    next[index] = block;
    if (type === "divider" && index === blocks.length - 1) next.push(newBlock());
    setSlash(null);
    onChange(next);
    if (refocus || type === "divider") focus(type === "divider" ? next[index + 1]!.id : block.id, type === "table" ? 2 : 0);
  }

  function changeText(index: number, text: string) {
    const current = blocks[index]!;
    if (current.type !== "code" && current.type !== "table") {
      for (const [expression, type] of shortcuts) {
        if (expression.test(text) && current.type !== type) { retype(index, type, text.replace(expression, ""), false); return; }
      }
    }
    const clean = multiline.includes(current.type) ? text : text.replace(/\n/g, " ");
    replace(index, { ...current, text: clean });
    if (clean === "/") setSlash({ index, selected: 0 });
    else if (slash?.index === index) setSlash(null);
  }

  function onKey(index: number, event: KeyboardEvent<HTMLTextAreaElement>) {
    const current = blocks[index]!;
    if (slash?.index === index) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const count = blockOptions.length;
        setSlash({ index, selected: (slash.selected + (event.key === "ArrowDown" ? 1 : -1) + count) % count });
        return;
      }
      if (event.key === "Enter") { event.preventDefault(); retype(index, blockOptions[slash.selected]!.type, ""); return; }
      if (event.key === "Escape") { event.preventDefault(); setSlash(null); return; }
    }
    const element = event.currentTarget;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (event.key === "Tab" && lists.includes(current.type)) {
      event.preventDefault();
      const indent = Math.max(0, Math.min(3, (current.indent ?? 0) + (event.shiftKey ? -1 : 1)));
      const block: HorizonBlock = { ...current };
      if (indent) block.indent = indent; else delete block.indent;
      replace(index, block);
      focus(current.id, start);
      return;
    }
    // Code and tables keep Enter for new lines; Shift+Enter adds a line in other multi-line blocks.
    if (event.key === "Enter" && !event.shiftKey && current.type !== "code" && current.type !== "table") {
      event.preventDefault();
      if (!current.text && current.type !== "p") { retype(index, "p", ""); return; }
      const type: HorizonBlockType = lists.includes(current.type) ? current.type : "p";
      const created = newBlock(type, current.text.slice(end));
      if (lists.includes(type) && current.indent) created.indent = current.indent;
      const next = [...blocks];
      next[index] = { ...current, text: current.text.slice(0, start) };
      next.splice(index + 1, 0, created);
      onChange(next);
      focus(created.id, 0);
      return;
    }
    if (event.key === "Backspace" && start === 0 && end === 0) {
      if (current.type !== "p") { event.preventDefault(); retype(index, "p", current.type === "table" || current.type === "divider" ? "" : current.text); return; }
      if (index > 0) {
        event.preventDefault();
        const previous = blocks[index - 1]!;
        const next = [...blocks];
        if (previous.type === "divider") { next.splice(index - 1, 1); onChange(next); focus(current.id, 0); return; }
        const joined = multiline.includes(previous.type) ? previous.text + current.text : `${previous.text}${current.text.replace(/\n/g, " ")}`;
        next[index - 1] = { ...previous, text: joined };
        next.splice(index, 1);
        onChange(next);
        focus(previous.id, previous.text.length);
        return;
      }
    }
    if (event.key === "ArrowUp" && start === 0 && index > 0) { event.preventDefault(); focusNear(index, -1); }
    else if (event.key === "ArrowDown" && start === element.value.length && index < blocks.length - 1) { event.preventDefault(); focusNear(index, 1); }
  }
  function focusNear(index: number, step: number) {
    for (let i = index + step; i >= 0 && i < blocks.length; i += step) {
      if (blocks[i]!.type !== "divider") { focus(blocks[i]!.id, step > 0 ? 0 : undefined); return; }
    }
  }

  const numbers = listNumbers(blocks);
  return <div className="hz-body">{blocks.map((block, index) => {
    const style = { "--indent": block.indent ?? 0 } as CSSProperties;
    if (block.type === "divider") {
      return <div key={block.id} className="hz-blk hz-blk--divider">
        <hr />
        <button type="button" className="hz-blk__remove" aria-label="Quitar separador" onClick={() => { const next = blocks.filter((b) => b.id !== block.id); onChange(next.length ? next : [newBlock()]); }}>×</button>
      </div>;
    }
    return <div key={block.id} className={`hz-blk hz-blk--${block.type}`} data-done={block.done || undefined} style={style}>
      {block.type === "todo" && <input type="checkbox" className="hz-blk__check" checked={!!block.done} aria-label={`Hecho: ${block.text || "tarea sin texto"}`}
        onChange={(event) => { const next: HorizonBlock = { ...block }; if (event.target.checked) next.done = true; else delete next.done; replace(index, next); }} />}
      {block.type === "li" && <span className="hz-blk__marker" aria-hidden="true">•</span>}
      {block.type === "ol" && <span className="hz-blk__marker" aria-hidden="true">{numbers[index]}.</span>}
      <div className="hz-blk__field">
        <Grow block={block} index={index} placeholder={index === 0 && blocks.length === 1 ? "Escribe, o pulsa / para elegir un bloque" : block.type === "p" ? "" : (blockOptions.find((o) => o.type === block.type)?.label ?? "")}
          register={(element) => { if (element) refs.current.set(block.id, element); else refs.current.delete(block.id); }}
          onChange={(text) => changeText(index, text)} onKey={(event) => onKey(index, event)} />
        {block.type === "table" && block.text.includes("|") && <MarkdownTable text={block.text} />}
      </div>
      {slash?.index === index && <div className="hz-slash" role="listbox" aria-label="Tipo de bloque">
        {blockOptions.map((option, i) => <button key={option.type} type="button" role="option" aria-selected={i === slash.selected}
          onMouseDown={(event) => { event.preventDefault(); retype(index, option.type, ""); }}>
          {option.label}<small>{option.shortcut}</small>
        </button>)}
      </div>}
    </div>;
  })}</div>;
}
