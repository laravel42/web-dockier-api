export interface ProviderStyle {
  icon: string;
  name: string;
  description: string;
}

/**
 * Provider display styles.
 * To add a new provider, add its style entry here.
 */
const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  aws: { icon: "i/aws.svg", name: "AWS", description: "Amazon Web Services cloud platform." },
  googlecloud: { icon: "googlecloud", name: "Google Cloud", description: "Google Cloud Platform infrastructure." },
  gcp: { icon: "googlecloud", name: "Google Cloud", description: "Google Cloud Platform infrastructure." },
};

const FALLBACK: ProviderStyle = { icon: "", name: "", description: "Cloud infrastructure provider." };

export function getProviderStyle(provider: string): ProviderStyle {
  return PROVIDER_STYLES[provider] || { ...FALLBACK, name: provider };
}
