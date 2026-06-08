import SearchIcon from "../icons/outlined/SearchIcon";
import { inputCls } from "../../utils/styles";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function ListSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: Props) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <SearchIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pl-9`}
        aria-label={placeholder}
      />
    </div>
  );
}
