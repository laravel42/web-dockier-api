import { useState } from "react";
import type { WizardState } from "../types";

interface PostDeployCommand {
  command: string;
  enabled: boolean;
  continueOnFailure: boolean;
  timeout?: number;
}

export default function StepPostDeployCommands({ state, onChange }: {
  state: WizardState;
  onChange: (commands: PostDeployCommand[]) => void;
}) {
  const [newCommand, setNewCommand] = useState("");
  const commands = state.postDeployCommands;

  const addCommand = () => {
    const trimmed = newCommand.trim();
    if (!trimmed || trimmed.length > 500) return;
    // Prevent duplicate commands
    if (commands.some(c => c.command === trimmed)) return;
    onChange([...commands, { command: trimmed, enabled: true, continueOnFailure: false }]);
    setNewCommand("");
  };

  const removeCommand = (index: number) => {
    onChange(commands.filter((_, i) => i !== index));
  };

  const toggleEnabled = (index: number) => {
    const updated = commands.map((cmd, i) =>
      i === index ? { ...cmd, enabled: !cmd.enabled } : cmd
    );
    onChange(updated);
  };

  const toggleContinueOnFailure = (index: number) => {
    const updated = commands.map((cmd, i) =>
      i === index ? { ...cmd, continueOnFailure: !cmd.continueOnFailure } : cmd
    );
    onChange(updated);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...commands];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated);
  };

  const moveDown = (index: number) => {
    if (index === commands.length - 1) return;
    const updated = [...commands];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Post-Deploy Commands</p>
        <p className="text-xs text-text-secondary mb-3">
          Shell commands that run inside the container after deployment succeeds. Executed sequentially in order.
        </p>
      </div>

      {/* Command list */}
      {commands.length > 0 && (
        <div className="space-y-2">
          {commands.map((cmd, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 p-2.5 rounded-lg border transition-all ${
                cmd.enabled
                  ? "border-border bg-surface"
                  : "border-border/50 bg-surface/50 opacity-60"
              }`}
            >
              {/* Enable toggle */}
              <button
                type="button"
                onClick={() => toggleEnabled(index)}
                className={`mt-0.5 relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                  cmd.enabled ? "bg-primary-500" : "bg-border"
                }`}
                aria-label={cmd.enabled ? "Disable command" : "Enable command"}
              >
                <span className={`inline-block size-3  transform rounded-full bg-white transition-transform ${
                  cmd.enabled ? "translate-x-3.5" : "translate-x-0.5"
                }`} />
              </button>

              {/* Command text */}
              <div className="flex-1 min-w-0">
                <code className="text-sm text-text font-mono break-all">{cmd.command}</code>
                <div className="flex items-center gap-3 mt-1">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cmd.continueOnFailure}
                      onChange={() => toggleContinueOnFailure(index)}
                      className="size-3  rounded border-border text-primary-500 focus:ring-primary-500/30"
                    />
                    <span className="text-[10px] text-text-muted">Continue on failure</span>
                  </label>
                </div>
              </div>

              {/* Reorder + delete */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-1 text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move up"
                >
                  <svg className="size-3.5 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(index)}
                  disabled={index === commands.length - 1}
                  className="p-1 text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move down"
                >
                  <svg className="size-3.5 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeCommand(index)}
                  className="p-1 text-text-muted hover:text-danger-500"
                  aria-label="Remove command"
                >
                  <svg className="size-3.5 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new command */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newCommand}
          onChange={(e) => setNewCommand(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCommand(); } }}
          placeholder="e.g. php artisan migrate --force"
          className="flex-1 px-3 py-2 text-sm font-mono bg-surface border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500"
        />
        <button
          type="button"
          onClick={addCommand}
          disabled={!newCommand.trim()}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>

      {commands.length === 0 && (
        <p className="text-xs text-text-muted italic">No post-deploy commands configured. Commands will run inside the container after deployment.</p>
      )}
    </div>
  );
}
