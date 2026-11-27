import assert from "node:assert/strict";
import { test } from "node:test";
import { blocksToMarkdown, horizonBlocks, markdownToBlocks, summarize } from "../src/domain/horizon.ts";

const ids = () => { let n = 0; return () => `b${++n}`; };
const sample = `# Escanear facturas

Escanear la factura de un comercio afiliado
y generar el pedido automáticamente.

## Cómo funciona hoy

1. El comensal toca un plato.
2. El servidor **bloquea** la orden:
   - unas 10 sentencias
   - con \`lock_timeout\` de 3 s
- [ ] Confirmar con Mercantil
- [x] Revisar Apple Split Bill

| Pieza | Valor |
|---|---|
| Hikari | 20 |

> El feed cuenta la historia,
> el snapshot dice la verdad.

\`\`\`
GET /mesa/{uuid}/cuenta
\`\`\`

---

### Fuentes
Ver [Apple](https://support.apple.com/127565).
`;

test("markdown becomes typed blocks and the first heading becomes the title", () => {
  const { title, blocks } = markdownToBlocks(sample, ids());
  assert.equal(title, "Escanear facturas");
  assert.deepEqual(blocks.map(({ type, indent, done }) => [type, indent ?? 0, done ?? false]), [
    ["p", 0, false], ["h2", 0, false], ["ol", 0, false], ["ol", 0, false], ["li", 1, false], ["li", 1, false],
    ["todo", 0, false], ["todo", 0, true], ["table", 0, false], ["quote", 0, false], ["code", 0, false], ["divider", 0, false],
    ["h3", 0, false], ["p", 0, false],
  ]);
  assert.equal(blocks[0].text, "Escanear la factura de un comercio afiliado y generar el pedido automáticamente.");
  assert.equal(blocks[3].text, "El servidor **bloquea** la orden:");
  assert.equal(blocks[8].text, "| Pieza | Valor |\n|---|---|\n| Hikari | 20 |");
  assert.equal(blocks[9].text, "El feed cuenta la historia,\nel snapshot dice la verdad.");
  assert.equal(blocks[10].text, "GET /mesa/{uuid}/cuenta");
});

test("blocks round-trip through markdown without losing structure", () => {
  const first = markdownToBlocks(sample, ids());
  const markdown = blocksToMarkdown(first.title, first.blocks);
  const second = markdownToBlocks(markdown, ids());
  assert.equal(second.title, first.title);
  assert.deepEqual(second.blocks, first.blocks);
  assert(markdown.startsWith("# Escanear facturas\n\nEscanear la factura"));
  assert(markdown.includes("1. El comensal toca un plato.\n2. El servidor **bloquea** la orden:\n  - unas 10 sentencias"));
});

test("client blocks are validated strictly", () => {
  const ok = horizonBlocks([{ id: "a", type: "todo", text: "Hacer", done: true, indent: 1 }, { id: "b", type: "divider", text: "ignorado" }]);
  assert.deepEqual(ok, [{ id: "a", type: "todo", text: "Hacer", done: true, indent: 1 }, { id: "b", type: "divider", text: "" }]);
  const bad = [
    [{ id: "a", type: "video", text: "" }], [{ id: "a", type: "p", text: "x" }, { id: "a", type: "p", text: "y" }],
    [{ id: "a b", type: "p", text: "" }], [{ id: "a", type: "h1", text: "dos\nlíneas" }], [{ id: "a", type: "p", text: "", done: true }],
    [{ id: "a", type: "p", text: "", indent: 1 }], [{ id: "a", type: "li", text: "", indent: 4 }], [{ id: "a", type: "p", text: "", color: "red" }],
    "no es lista",
  ];
  for (const blocks of bad) assert.throws(() => horizonBlocks(blocks), { code: "INVALID_INPUT" }, JSON.stringify(blocks));
  assert.throws(() => horizonBlocks(Array.from({ length: 1001 }, (_, i) => ({ id: `b${i}`, type: "p", text: "" }))), { code: "INVALID_INPUT" });
});

test("summaries show a plain excerpt and task progress", () => {
  const { blocks } = markdownToBlocks(sample, ids());
  const summary = summarize({ id: "d", title: "T", status: "idea", areaId: null, blocks, version: 1, createdBy: "a", createdAt: "x", updatedBy: "a", updatedAt: "x" });
  assert.equal(summary.excerpt, "Escanear la factura de un comercio afiliado y generar el pedido automáticamente.");
  assert.deepEqual(summary.tasks, { done: 1, total: 2 });
  assert.equal(summary.blockCount, 14);
  assert(!("blocks" in summary));
});
