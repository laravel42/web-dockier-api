import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Spinner from "@/components/Spinner";

interface Props {
  pullLog: string[] | null;
  pullLoading: boolean;
  onClose: () => void;
}

export default function PullLogModal({ pullLog, pullLoading, onClose }: Props) {
  return (
    <Modal open={pullLog !== null} onClose={onClose} title="Pull from Origin">
      <div className="bg-terminal rounded-lg p-4 font-mono text-xs/relaxed  text-terminal-success max-h-80 overflow-y-auto">
        {pullLog?.map((line, i) => (
          <div key={i} className={line.startsWith("error:") ? "text-terminal-danger" : ""}>{line}</div>
        ))}
        {pullLoading && (
          <div className="flex items-center gap-2 mt-1 text-text-muted">
            <Spinner className="size-3" />
            Fetching…
          </div>
        )}
      </div>
      <div className="flex justify-end mt-4">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
