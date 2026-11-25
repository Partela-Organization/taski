import { useRef, useState } from "react";
import { Button } from "../../components.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";
import { mcpConfiguration, mcpEndpoint } from "./setup.ts";
import type { McpClient } from "./setup.ts";

const terminalExample = "printf 'Código de Taski: '\nIFS= read -r -s TASKI_CODE\nexport TASKI_CODE\nprintf '\\n'";

export function McpGuide({ baseUrl, memberId }: { baseUrl: string | undefined; memberId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const code = useRef<HTMLElement>(null);
  const [client, setClient] = useState<McpClient>("codex");
  const [copyMessage, setCopyMessage] = useState("");
  const endpoint = baseUrl ? mcpEndpoint(baseUrl) : "";
  const configuration = mcpConfiguration(client, endpoint, memberId);

  function choose(next: McpClient) {
    setClient(next);
    setCopyMessage("");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(configuration);
      setCopyMessage("Configuración copiada.");
    } catch {
      if (code.current) {
        const range = document.createRange();
        range.selectNodeContents(code.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setCopyMessage("Seleccioné la configuración. Cópiala con tu navegador.");
    }
  }

  return <>
    <div className="mcp-guide-bar">
      <Button variant="primary" className="mcp-guide-launch" aria-haspopup="dialog" disabled={!endpoint}
        onClick={(event) => {
          launcher.current = event.currentTarget;
          setCopyMessage("");
          dialog.current?.showModal();
        }}>
        <WorkspaceIcon name="terminal" />Conectar MCP
        <WorkspaceIcon name="chevron" />
      </Button>
    </div>
    <dialog ref={dialog} className="mcp-guide" aria-labelledby="mcp-guide-title"
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
      onClose={() => launcher.current?.focus()}>
      <div className="mcp-guide__header">
        <h2 id="mcp-guide-title">Conectar MCP</h2>
        <Button variant="secondary" onClick={() => dialog.current?.close()}>Cerrar guía</Button>
      </div>
      <div className="mcp-guide__body">
        <dl className="mcp-guide__connection">
          <div><dt>URL del MCP</dt><dd><code>{endpoint}</code></dd></div>
          <div><dt>Tu ID de miembro</dt><dd><code>{memberId}</code></dd></div>
        </dl>
        <section className="mcp-guide__step">
          <h3>Prepara tu código de acceso</h3>
          <p>Carga tu código de equipo en la variable <code>TASKI_CODE</code> de la terminal donde abrirás el cliente.</p>
          <details>
            <summary>Comando para Bash o Zsh</summary>
            <pre><code>{terminalExample}</code></pre>
          </details>
        </section>
        <section className="mcp-guide__step">
          <h3>Configura tu cliente</h3>
          <div className="mcp-guide__clients" role="group" aria-label="Cliente MCP">
            <Button variant="secondary" aria-pressed={client === "codex"} onClick={() => choose("codex")}>Codex</Button>
            <Button variant="secondary" aria-pressed={client === "claude"} onClick={() => choose("claude")}>Claude Code</Button>
          </div>
          {client === "codex"
            ? <p>Añade este bloque a <code>~/.codex/config.toml</code>. Si ya tienes un bloque <code>[mcp_servers.taski]</code>, reemplázalo.</p>
            : <p>Guarda esta configuración en <code>.mcp.json</code> en la raíz del proyecto. Si el archivo ya existe, añade <code>taski</code> dentro de <code>mcpServers</code>.</p>}
          <div className="mcp-guide__snippet">
            <div className="mcp-guide__copy">
              <Button variant="primary" onClick={() => void copy()}>Copiar configuración</Button>
              <span role="status">{copyMessage}</span>
            </div>
            <pre tabIndex={0} aria-label="Configuración MCP"><code ref={code}>{configuration}</code></pre>
          </div>
        </section>
        <section className="mcp-guide__step">
          <h3>Comprueba la conexión</h3>
          <p>Abre el cliente desde esa terminal y pídele «Usa <code>get_project</code> de Taski y dime el nombre del proyecto». Después, prueba «Muéstrame mis tickets pendientes en Taski».</p>
          <details>
            <summary>Si la conexión falla</summary>
            <p>Comprueba la URL y que termina en <code>/mcp</code>. Si falla DNS, revisa la conexión del equipo. Si Taski devuelve 401, revisa <code>TASKI_CODE</code> y reinicia el cliente. Si Cloudflare devuelve error 1010, identifica tu cliente con un <code>User-Agent</code> descriptivo, como <code>taski-agent/1.0</code>, y vuelve a conectar.</p>
          </details>
        </section>
      </div>
    </dialog>
  </>;
}
