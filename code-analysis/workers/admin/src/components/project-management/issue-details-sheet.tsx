"use client";

import { CalendarRange, Flag, Layers3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

import {
  getDisplayStatusLabel,
  ISSUE_STATUS_OPTIONS,
  type IssuePriority,
  type ProjectIssue,
} from "./issue-core";

const PRIORITY_OPTIONS: Array<{
  label: string;
  value: Exclude<IssuePriority, null>;
}> = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

export type EditableIssueValues = ProjectIssue & {
  priority?: IssuePriority;
};

type IssueDetailsSheetProps = {
  open: boolean;
  issue: EditableIssueValues | null;
  onOpenChange: (open: boolean) => void;
  onSaveIssue: (issue: EditableIssueValues) => void;
};

function buildEditableValues(issue: EditableIssueValues | null) {
  return {
    id: issue?.id ?? "",
    code: issue?.code ?? "",
    title: issue?.title ?? "",
    description: issue?.description ?? "",
    status: issue?.status ?? "Planned",
    priority: issue?.priority ?? null,
    startDate: issue?.startDate ?? "",
    targetDate: issue?.targetDate ?? "",
  };
}

export function IssueDetailsSheet(props: IssueDetailsSheetProps) {
  const { open, issue, onOpenChange, onSaveIssue } = props;
  const initialValues = useMemo(() => buildEditableValues(issue), [issue]);
  const [values, setValues] = useState(initialValues);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setValues(initialValues);
    setTitleError(null);
    setScheduleError(null);
  }, [initialValues, open]);

  const showScheduleFields = values.status !== "Backlog";

  const updateValues = (nextValues: Partial<typeof values>) => {
    setValues((currentValues) => ({
      ...currentValues,
      ...nextValues,
    }));
    setScheduleError(null);
  };

  const handleStatusChange = (status: typeof values.status) => {
    setScheduleError(null);

    setValues((currentValues) => {
      if (status === "Backlog") {
        return {
          ...currentValues,
          status,
          startDate: "",
          targetDate: "",
        };
      }

      return {
        ...currentValues,
        status,
      };
    });
  };

  const handleSubmit = () => {
    const trimmedTitle = values.title.trim();

    if (!issue || !trimmedTitle) {
      setTitleError("Issue title is required.");
      return;
    }

    setTitleError(null);

    if (showScheduleFields) {
      if (!values.startDate || !values.targetDate) {
        setScheduleError(
          "Start date and target date are required for scheduled issues.",
        );
        return;
      }

      if (values.startDate > values.targetDate) {
        setScheduleError(
          "Target date must be the same day or after the start date.",
        );
        return;
      }
    }

    setScheduleError(null);
    onSaveIssue({
      ...issue,
      title: trimmedTitle,
      description: values.description.trim() || undefined,
      status: values.status,
      priority: values.priority,
      startDate: showScheduleFields ? values.startDate : undefined,
      targetDate: showScheduleFields ? values.targetDate : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{issue ? issue.title : "Issue details"}</SheetTitle>
          <SheetDescription>
            View the calendar entry, update its schedule, and keep the issue
            details in the same place as the planning surface.
          </SheetDescription>
        </SheetHeader>

        <form
          id="issue-details-sheet-form"
          className="flex-1 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <FieldGroup>
            <div className="bg-muted/30 rounded-xl border p-3">
              <p className="text-muted-foreground text-xs font-medium">
                Issue key
              </p>
              <p className="mt-1 text-sm font-semibold">{values.code}</p>
            </div>

            <Field data-invalid={Boolean(titleError)}>
              <FieldLabel htmlFor="issue-details-title">Issue title</FieldLabel>
              <FieldContent>
                <Input
                  id="issue-details-title"
                  value={values.title}
                  aria-invalid={Boolean(titleError)}
                  onChange={(event) => {
                    updateValues({ title: event.target.value });
                    if (titleError) {
                      setTitleError(null);
                    }
                  }}
                />
                <FieldError>{titleError}</FieldError>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="issue-details-description">
                Description
              </FieldLabel>
              <FieldContent>
                <Textarea
                  id="issue-details-description"
                  value={values.description}
                  placeholder="Add issue context, expected behavior, edge cases, or handoff notes"
                  className="min-h-28 resize-none"
                  onChange={(event) =>
                    updateValues({ description: event.target.value })
                  }
                />
              </FieldContent>
            </Field>

            <FieldGroup className="gap-4 md:grid md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="issue-details-status">Status</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Layers3 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Select
                      value={values.status}
                      onValueChange={(value) =>
                        handleStatusChange(value as typeof values.status)
                      }
                    >
                      <SelectTrigger id="issue-details-status" className="pl-9">
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ISSUE_STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {getDisplayStatusLabel(status)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="issue-details-priority">
                  Priority
                </FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Flag className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Select
                      value={values.priority ?? "none"}
                      onValueChange={(value) =>
                        updateValues({
                          priority:
                            value === "none" ? null : (value as IssuePriority),
                        })
                      }
                    >
                      <SelectTrigger
                        id="issue-details-priority"
                        className="pl-9"
                      >
                        <SelectValue placeholder="Select a priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="none">No priority</SelectItem>
                          {PRIORITY_OPTIONS.map((priority) => (
                            <SelectItem
                              key={priority.value}
                              value={priority.value}
                            >
                              {priority.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </FieldContent>
              </Field>
            </FieldGroup>

            {showScheduleFields ? (
              <FieldGroup className="gap-4 md:grid md:grid-cols-2">
                <Field data-invalid={Boolean(scheduleError)}>
                  <FieldLabel htmlFor="issue-details-start-date">
                    Start date
                  </FieldLabel>
                  <FieldContent>
                    <div className="relative">
                      <CalendarRange className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                      <Input
                        id="issue-details-start-date"
                        type="date"
                        value={values.startDate}
                        className="pl-9"
                        onChange={(event) =>
                          updateValues({ startDate: event.target.value })
                        }
                      />
                    </div>
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(scheduleError)}>
                  <FieldLabel htmlFor="issue-details-target-date">
                    Target date
                  </FieldLabel>
                  <FieldContent>
                    <div className="relative">
                      <CalendarRange className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                      <Input
                        id="issue-details-target-date"
                        type="date"
                        value={values.targetDate}
                        className="pl-9"
                        onChange={(event) =>
                          updateValues({ targetDate: event.target.value })
                        }
                      />
                    </div>
                    <FieldError>{scheduleError}</FieldError>
                  </FieldContent>
                </Field>
              </FieldGroup>
            ) : null}
          </FieldGroup>
        </form>

        <SheetFooter className="gap-2">
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button form="issue-details-sheet-form" type="submit">
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
