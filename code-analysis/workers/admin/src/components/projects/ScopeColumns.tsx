import type { ProjectScope } from "@/lib/data/project-details";

type ScopeColumnsProps = {
  scope: ProjectScope;
};

export function ScopeColumns({ scope }: ScopeColumnsProps) {
  const inScope = scope.inScope.slice(0, 2);
  const outOfScope = scope.outOfScope.slice(0, 2);

  return (
    <section>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-foreground text-base font-bold">In scope</h2>
          <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 text-sm">
            {inScope.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-foreground text-base font-semibold">
            Out of scope:
          </h2>
          <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 text-sm">
            {outOfScope.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
