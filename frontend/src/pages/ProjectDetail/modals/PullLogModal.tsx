import Modal from "../../../components/Modal";
import { btnSecondary } from "../../../utils/styles";

interface Props {
  pullLog: string[] | null;
  pullLoading: boolean;
  onClose: () => void;
}

export default function PullLogModal({ pullLog, pullLoading, onClose }: Props) {
  return (
    <Modal open={pullLog !== null} onClose={onClose} title="Pull from Origin">
      <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs/relaxed  text-green-400 max-h-80 overflow-y-auto">
        {pullLog?.map((line, i) => (
          <div key={i} className={line.startsWith("error:") ? "text-red-400" : ""}>{line}</div>
        ))}
        {pullLoading && (
          <div className="flex items-center gap-2 mt-1 text-gray-400">
            <div className="size-3  border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            Fetching…
          </div>
        )}
      </div>
      <div className="flex justify-end mt-4">
        <button type="button" onClick={onClose} className={btnSecondary}>Close</button>
      </div>
    </Modal>
  );
}
