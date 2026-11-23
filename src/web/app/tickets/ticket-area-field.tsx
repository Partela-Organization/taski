export function TicketAreaField({ id, label, areas, value, disabled, onChange }: {
  id: string; label: string; areas: { id: string; label: string }[];
  value: string | undefined; disabled?: boolean; onChange: (area: string) => void;
}) {
  return <div>
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {value && !areas.some((area) => area.id === value) && <option value={value}>{value}</option>}
      {areas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
    </select>
  </div>;
}
