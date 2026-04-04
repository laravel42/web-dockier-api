import DevIcon from "./DevIcon";

const PROVIDER_STYLES: Record<string, { bg: string; text: string; icon: string; name: string; description: string }> = {
  aws: { bg: "bg-amber-500/10", text: "text-amber-600", icon: "i/aws.svg", name: "AWS", description: "Amazon Web Services cloud platform." },
  googlecloud: { bg: "bg-blue-500/10", text: "text-blue-600", icon: "googlecloud", name: "Google Cloud", description: "Google Cloud Platform infrastructure." },
  digitalocean: { bg: "bg-blue-500/10", text: "text-blue-600", icon: "digitalocean", name: "DigitalOcean", description: "Cloud VPS and managed infrastructure." },
  hetzner: { bg: "bg-red-500/10", text: "text-red-600", icon: "hetzner", name: "Hetzner", description: "High-performance cloud servers in Europe." },
  vultr: { bg: "bg-sky-500/10", text: "text-sky-600", icon: "vultr", name: "Vultr", description: "High-performance cloud computing." },
  linode: { bg: "bg-emerald-500/10", text: "text-emerald-600", icon: "linode", name: "Linode", description: "Simple and reliable cloud computing." },
};

const FALLBACK = { bg: "bg-secondary-100", text: "text-text-muted", icon: "", name: "", description: "Cloud infrastructure provider." };

export function getProviderStyle(provider: string) {
  return PROVIDER_STYLES[provider] || { ...FALLBACK, name: provider };
}

interface Props {
  provider: string;
  /** Extra text appended after the provider name, e.g. "· ECS Fargate" */
  suffix?: string;
  iconSize?: string;
  showName?: boolean;
}

export default function ProviderBadge({ provider, suffix, iconSize = "w-2.5 h-2.5", showName = true }: Props) {
  const ps = getProviderStyle(provider);

  if (!showName) {
    return ps.icon ? <DevIcon src={ps.icon} alt="" className={iconSize} /> : null;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${ps.bg} ${ps.text}`}>
      {ps.icon && <DevIcon src={ps.icon} alt="" className={iconSize} />}
      {provider.toUpperCase()}
      {suffix && <>{suffix}</>}
    </span>
  );
}
