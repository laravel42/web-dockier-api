import type { KeyFeatures } from "@/lib/data/project-details";

type KeyFeaturesColumnsProps = {
  features: KeyFeatures;
};

export function KeyFeaturesColumns({ features }: KeyFeaturesColumnsProps) {
  return (
    <section>
      <h2 className="text-foreground text-base font-semibold">Key features</h2>
      <div className="mt-4 grid grid-cols-1 gap-10 md:grid-cols-3">
        <div>
          <div className="text-foreground text-sm font-semibold">P0:</div>
          <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 text-sm">
            {features.p0.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-foreground text-sm font-semibold">P1:</div>
          <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 text-sm">
            {features.p1.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-foreground text-sm font-semibold">P2:</div>
          <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 text-sm">
            {features.p2.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
