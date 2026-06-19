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
      <pre className="grid grid-cols-1 bg-weaker border-weak text-ui/6 text-strong relative rounded-md border p-4  font-mono shadow-xs  break-all whitespace-break-spaces max-h-[calc(100vh-380px)] overflow-y-auto">
        {logs}
      </pre>
    </div>
  );
}
