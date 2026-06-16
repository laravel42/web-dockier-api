import { useState } from "react";
import ShareIcon from "../../../components/icons/outlined/ShareIcon";
import ChevronDownIcon from "../../../components/icons/outlined/ChevronDownIcon";
import Spinner from "../../../components/Spinner";

interface Props {
  currentBranch: string;
  branchList: string[];
  branchLoading: boolean;
  branchSearch: string;
  onSearchChange: (value: string) => void;
  onOpen: () => void;
  onSwitch: (branch: string) => void;
}

export default function BranchSelector({
  currentBranch,
  branchList,
  branchLoading,
  branchSearch,
  onSearchChange,
  onOpen,
  onSwitch,
}: Props) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) onOpen();
  };

  const close = () => setOpen(false);

  const filtered = branchList.filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary-50 hover:bg-secondary-100 transition-colors text-sm font-medium text-text max-w-[16rem]"
      >
        <ShareIcon className="size-4 text-text-muted shrink-0" />
        <span className="truncate">{currentBranch || "main"}</span>
        <ChevronDownIcon className={`size-4 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg bg-card shadow-lg border border-border p-2">
            <input
              type="text"
              placeholder="Search branches…"
              value={branchSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-secondary-50 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/30 mb-2"
            />
            {branchLoading ? (
              <div className="flex justify-center py-6">
                <Spinner className="size-5" />
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filtered.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      close();
                      onSwitch(b);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      b === currentBranch
                        ? "bg-primary-50 text-primary-600 font-medium"
                        : "text-text hover:bg-secondary-50"
                    }`}
                  >
                    <ShareIcon className="size-4 text-text-muted shrink-0" />
                    <span className="truncate">{b}</span>
                    {b === currentBranch && <span className="ml-auto text-xs text-primary-500 shrink-0">current</span>}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-text-muted text-center py-4">No branches found</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
