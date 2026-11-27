import type { ReactNode } from "react";

/**
 * Renders the inline Markdown kept in block text as React nodes (never as HTML):
 * `code`, **bold**, *italic* / _italic_, [text](https://…) and [[wiki links]] shown as plain emphasis.
 */
const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/g;

export function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const at = match.index;
    if (at > last) nodes.push(text.slice(last, at));
    const key = `${at}`;
    if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key}><Inline text={token.slice(2, -2)} /></strong>);
    else if (token.startsWith("[[")) nodes.push(<em key={key} className="hz-wiki">{token.slice(2, -2)}</em>);
    else if (token.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) ?? [];
      nodes.push(/^https?:\/\//i.test(href ?? "")
        ? <a key={key} href={href} target="_blank" rel="noreferrer">{label}</a>
        : <span key={key}>{label}</span>);
    } else nodes.push(<em key={key}><Inline text={token.slice(1, -1)} /></em>);
    last = at + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

/** Markdown table text (`| a | b |` rows with a `|---|` separator) as an accessible table. */
export function MarkdownTable({ text }: { text: string }) {
  const rows = text.split("\n").map((row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  const separator = rows.findIndex((cells) => cells.every((cell) => /^:?-{2,}:?$/.test(cell)));
  const head = separator > 0 ? rows.slice(0, separator) : [];
  const body = separator >= 0 ? rows.slice(separator + 1) : rows;
  return <div className="hz-table"><table>
    {head.length > 0 && <thead>{head.map((cells, r) => <tr key={r}>{cells.map((cell, c) => <th key={c} scope="col"><Inline text={cell} /></th>)}</tr>)}</thead>}
    <tbody>{body.map((cells, r) => <tr key={r}>{cells.map((cell, c) => <td key={c}><Inline text={cell} /></td>)}</tr>)}</tbody>
  </table></div>;
}
