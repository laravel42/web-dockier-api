import { cardCls } from "../../../utils/styles";
import TerminalIcon from "../../../components/icons/outlined/TerminalIcon";

interface Props {
  logs: string;
}

export default function DeployLogs({ logs }: Props) {
  if (!logs) return null;

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <TerminalIcon className="size-4  text-text-muted" />
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Deploy Logs</span>
      </div>
      <div className="bg-taupe-950 px-4 py-3 max-h-[calc(100vh-380px)] overflow-y-auto">
        <pre className="text-xs/relaxed text-gray-300 font-mono whitespace-pre-wrap ">{logs}</pre>
      </div>
    </div>
  );
}
