import Modal from "../../../components/Modal";
import ShareIcon from "../../../components/icons/outlined/ShareIcon";
import Spinner from "../../../components/Spinner";

interface Props {
  open: boolean;
  onClose: () => void;
  branchList: string[];
  branchLoading: boolean;
  branchSearch: string;
  onSearchChange: (value: string) => void;
  currentBranch: string;
  onSwitchBranch: (branch: string) => void;
}

export default function BranchModal({ open, onClose, branchList, branchLoading, branchSearch, onSearchChange, currentBranch, onSwitchBranch }: Props) {
  const filtered = branchList.filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} title="Switch Branch">
      <input
        type="text"
        placeholder="Search branches…"
        value={branchSearch}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full h-9 px-3 rounded-lg border border-border bg-secondary-50 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/30 mb-3"
      />
      {branchLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="w-5 h-5" />
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onSwitchBranch(b)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                b === currentBranch
                  ? "bg-primary-50 text-primary-600 font-medium"
                  : "text-text hover:bg-secondary-50"
              }`}
            >
              <ShareIcon className="w-4 h-4 text-text-muted shrink-0" />
              {b}
              {b === currentBranch && <span className="ml-auto text-xs text-primary-500">current</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">No branches found</p>
          )}
        </div>
      )}
    </Modal>
  );
}
