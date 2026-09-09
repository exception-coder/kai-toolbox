export function CheckboxGroup({ label, options, value, onChange }: {
  label: string; options: { label: string; value: string }[]; value: string[]; onChange: (value: string[]) => void
}) {
  return <fieldset className="space-y-2"><legend className="text-sm">{label}</legend>{options.map(option =>
    <label key={option.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.includes(option.value)}
      onChange={event => onChange(event.target.checked ? [...value, option.value] : value.filter(item => item !== option.value))} />{option.label}</label>)}</fieldset>
}
