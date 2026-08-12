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
  buildCreateIssueValues,
  type CreateIssueDefaults,
  type CreateIssueValues,
  ISSUE_STATUS_OPTIONS,
  type IssuePriority,
} from "./issue-core";

const PRIORITY_OPTIONS: Array<{
  label: string;
  value: Exclude<IssuePriority, null>;
}> = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

type CreateIssueSheetProps = {
  open: boolean;
  defaults?: CreateIssueDefaults;
  onOpenChange: (open: boolean) => void;
  onCreateIssue: (values: CreateIssueValues) => void;
};

export function CreateIssueSheet(props: CreateIssueSheetProps) {
  const { open, defaults, onOpenChange, onCreateIssue } = props;
  const initialValues = useMemo(
    () => buildCreateIssueValues(defaults),
    [defaults],
  );
  const [values, setValues] = useState<CreateIssueValues>(initialValues);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setValues(initialValues);
    setTitleError(null);
    setScheduleError(null);
  }, [initialValues, open]);

  const showScheduleFields = values.status !== "Backlog";

  const updateValues = (nextValues: Partial<CreateIssueValues>) => {
    setValues((currentValues) => ({
      ...currentValues,
      ...nextValues,
    }));
    setScheduleError(null);
  };

  const handleStatusChange = (status: CreateIssueValues["status"]) => {
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
        startDate: currentValues.startDate || initialValues.startDate,
        targetDate: currentValues.targetDate || initialValues.targetDate,
      };
    });
  };

  const handleSubmit = () => {
    const trimmedTitle = values.title.trim();

    if (!trimmedTitle) {
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
    onCreateIssue({
      ...values,
      title: trimmedTitle,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Create Issue</SheetTitle>
          <SheetDescription>
            Capture the issue details once, then drop it into the current
            project view with the right defaults already filled in.
          </SheetDescription>
        </SheetHeader>

        <form
          id="create-issue-sheet-form"
          className="flex-1 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(titleError)}>
              <FieldLabel htmlFor="issue-title">Issue title</FieldLabel>
              <FieldContent>
                <Input
                  id="issue-title"
                  value={values.title}
                  aria-invalid={Boolean(titleError)}
                  placeholder="Summarize the work that needs to happen"
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
              <FieldLabel htmlFor="issue-description">Description</FieldLabel>
              <FieldContent>
                <Textarea
                  id="issue-description"
                  value={values.description}
                  placeholder="Add the issue context, expected behavior, edge cases, or handoff notes"
                  className="min-h-28 resize-none"
                  onChange={(event) =>
                    updateValues({ description: event.target.value })
                  }
                />
              </FieldContent>
            </Field>

            <FieldGroup className="gap-4 md:grid md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="issue-status">Status</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Layers3 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Select
                      value={values.status}
                      onValueChange={(value) =>
                        handleStatusChange(value as CreateIssueValues["status"])
                      }
                    >
                      <SelectTrigger id="issue-status" className="pl-9">
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ISSUE_STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status === "Planned" ? "Todo" : status}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="issue-priority">Priority</FieldLabel>
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
                      <SelectTrigger id="issue-priority" className="pl-9">
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
                  <FieldLabel htmlFor="issue-start-date">Start date</FieldLabel>
                  <FieldContent>
                    <div className="relative">
                      <CalendarRange className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                      <Input
                        id="issue-start-date"
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
                  <FieldLabel htmlFor="issue-target-date">
                    Target date
                  </FieldLabel>
                  <FieldContent>
                    <div className="relative">
                      <CalendarRange className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                      <Input
                        id="issue-target-date"
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
          <Button form="create-issue-sheet-form" type="submit">
            Create issue
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
