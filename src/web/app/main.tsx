import { createRoot } from "react-dom/client";
import { TaskiClient } from "../../client/index.ts";
import { App } from "./app.tsx";
import "../styles/tokens.css";
import "../styles/components.css";
import "./style.css";

const client = new TaskiClient({ baseUrl: location.origin, clientName: "taski-web" });
createRoot(document.getElementById("root")!).render(<App client={client} />);
