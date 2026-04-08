export interface ProviderStyle {
  bg: string;
  text: string;
  icon: string;
  name: string;
  description: string;
}

const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  aws: { bg: "bg-amber-500/10", text: "text-amber-600", icon: "i/aws.svg", name: "AWS", description: "Amazon Web Services cloud platform." },
  googlecloud: { bg: "bg-blue-500/10", text: "text-blue-600", icon: "googlecloud", name: "Google Cloud", description: "Google Cloud Platform infrastructure." },
  digitalocean: { bg: "bg-blue-500/10", text: "text-blue-600", icon: "digitalocean", name: "DigitalOcean", description: "Cloud VPS and managed infrastructure." },
  cloudflare: { bg: "bg-orange-500/10", text: "text-orange-600", icon: "cloudflare", name: "Cloudflare", description: "Global cloud network and edge computing." },
  hetzner: { bg: "bg-red-500/10", text: "text-red-600", icon: "hetzner", name: "Hetzner", description: "High-performance cloud servers in Europe." },
  linode: { bg: "bg-emerald-500/10", text: "text-emerald-600", icon: "linode", name: "Linode", description: "Simple and reliable cloud computing." },
};

const FALLBACK: ProviderStyle = { bg: "bg-secondary-100", text: "text-text-muted", icon: "", name: "", description: "Cloud infrastructure provider." };

export function getProviderStyle(provider: string): ProviderStyle {
  return PROVIDER_STYLES[provider] || { ...FALLBACK, name: provider };
}
