export interface ProviderStyle {
  bg: string;
  text: string;
  icon: string;
  name: string;
  description: string;
}

/**
 * Provider display styles.
 * To add a new provider, add its style entry here.
 */
const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  aws: { bg: "bg-amber-500/10", text: "text-amber-600", icon: "i/aws.svg", name: "AWS", description: "Amazon Web Services cloud platform." },
  googlecloud: { bg: "bg-blue-500/10", text: "text-blue-600", icon: "googlecloud", name: "Google Cloud", description: "Google Cloud Platform infrastructure." },
  gcp: { bg: "bg-blue-500/10", text: "text-blue-600", icon: "googlecloud", name: "Google Cloud", description: "Google Cloud Platform infrastructure." },
};

const FALLBACK: ProviderStyle = { bg: "bg-secondary-100", text: "text-text-muted", icon: "", name: "", description: "Cloud infrastructure provider." };

export function getProviderStyle(provider: string): ProviderStyle {
  return PROVIDER_STYLES[provider] || { ...FALLBACK, name: provider };
}
