import type { ProjectDetails } from "@/lib/data/project-details";

type OutcomesListProps = {
  outcomes: ProjectDetails["outcomes"];
};

export function OutcomesList({ outcomes }: OutcomesListProps) {
  return (
    <section>
      <h2 className="text-foreground text-base font-semibold">
        Expected Outcomes
      </h2>
      <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 text-sm">
        {outcomes.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
