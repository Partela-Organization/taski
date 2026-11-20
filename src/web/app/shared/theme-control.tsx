import type { Theme } from "../../theme.ts";

export function ThemeControl({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return <div className="theme-control">
    <label htmlFor="theme">Tema</label>
    <select id="theme" value={theme} onChange={(event) => onChange(event.target.value as Theme)}>
      <option value="system">Sistema</option>
      <option value="light">Claro</option>
      <option value="dark">Oscuro</option>
    </select>
  </div>;
}
