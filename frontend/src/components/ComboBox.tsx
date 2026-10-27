import SearchSelect from "./ui/SearchSelect";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;
}

export default function ComboBox({ value, onChange, options, placeholder = "Select…", emptyLabel = "No results" }: Props) {
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={options}
      getValue={(o) => o.value}
      renderItem={(o) => <span className="truncate">{o.label}</span>}
      matches={(o, q) => o.label.toLowerCase().includes(q)}
      placeholder={placeholder}
      listLabel="Options"
      searchPlaceholder="Search…"
      noMatchLabel={() => emptyLabel}
    />
  );
}
