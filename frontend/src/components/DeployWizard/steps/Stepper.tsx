import CheckIcon from "../../icons/outlined/CheckIcon";
import { STEPS } from "../constants";

export default function Stepper({ current, steps }: { current: number; steps: typeof STEPS }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center justify-center size-7  rounded-full text-xs font-semibold shrink-0 transition-colors ${
              done ? "bg-success-500 text-white" : active ? "bg-primary-500 text-white" : "bg-secondary-100 text-text-muted"
            }`}>
              {done ? (
                <CheckIcon />
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${active ? "text-text" : "text-text-muted"}`}>{s.label}</span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${done ? "bg-success-500" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
