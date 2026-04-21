import DevIcon from "./DevIcon";

const SC_PROVIDERS: Record<string, { icon: string; name: string; description: string }> = {
  github: { icon: "github", name: "GitHub", description: "GitHub repositories and organizations." },
  gitlab: { icon: "gitlab", name: "GitLab", description: "GitLab projects and groups." },
  gitlabSelfHosted: { icon: "gitlab", name: "GitLab", description: "Self-hosted GitLab instance." },
  bitbucket: { icon: "bitbucket", name: "Bitbucket", description: "Bitbucket repositories and workspaces." },
};

const FALLBACK = { icon: "git", name: "", description: "Source control connection." };

export function getSourceControl(provider: string) {
  return SC_PROVIDERS[provider] || { ...FALLBACK, name: provider };
}

interface Props {
  provider: string;
  className?: string;
  iconSize?: string;
  showName?: boolean;
}

export default function SourceControlBadge({ provider, className = "w-4 h-4", iconSize, showName = true }: Props) {
  const sc = getSourceControl(provider);
  const size = iconSize || className;

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <DevIcon src={sc.icon} alt="" className={size} />
      {showName && <span className="text-xs text-text-muted">{sc.name}</span>}
    </span>
  );
}
