import { useEffect, useState } from "react";
import { codeAnalysisApi } from "@/services/api";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";

/**
 * This organization's rule overrides for one engine: which rules are off, and a
 * toggle that saves the change. A failed save is reverted and reported; the old
 * panels swallowed it, so a switch could show off while the rule kept running.
 */
export function useRuleOverrides(tool: "semgrep" | "sonarqube", onChanged: () => void) {
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const toast = useToast();

  useEffect(() => {
    codeAnalysisApi
      .listRuleOverrides(tool)
      .then((res) => setDisabled(new Set(res.overrides.filter((o) => !o.enabled).map((o) => o.ruleId))))
      .catch((err: unknown) => toast.error(getErrorMessage(err, "Failed to load rule settings")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const flip = (ruleId: string) =>
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });

  const toggle = async (ruleId: string) => {
    const enable = disabled.has(ruleId);
    flip(ruleId);
    try {
      await codeAnalysisApi.toggleRule(tool, ruleId, enable);
      onChanged();
    } catch (err) {
      flip(ruleId);
      toast.error(getErrorMessage(err, "Failed to update the rule"));
    }
  };

  return { disabled, toggle };
}
