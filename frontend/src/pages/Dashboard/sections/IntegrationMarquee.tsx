import DevIcon from "../../../components/DevIcon";

const INTEGRATIONS = [
  { slug: "github", label: "GitHub" },
  { slug: "gitlab", label: "GitLab" },
  { slug: "aws", label: "AWS" },
  { slug: "googlecloud", label: "GCP" },
  { slug: "azure", label: "Azure" },
  { slug: "terraform", label: "Terraform" },
  { slug: "sonarqube", label: "SonarQube" },
] as const;

export default function IntegrationMarquee() {
  const items = [...INTEGRATIONS, ...INTEGRATIONS];

  return (
    <div
      className="relative -mx-4 mt-12 overflow-hidden sm:-mx-6 lg:-mx-8 xl:-mx-10"
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-linear-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-linear-to-l from-background to-transparent" />
      <div className="flex w-max animate-marquee items-center gap-10 px-4">
        {items.map((item, i) => (
          <div
            key={`${item.slug}-${i}`}
            className="flex shrink-0 items-center gap-2 opacity-40 grayscale transition-opacity hover:opacity-60"
          >
            <DevIcon src={item.slug} className="size-5" alt="" />
            <span className="text-xs font-medium text-text-muted">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
