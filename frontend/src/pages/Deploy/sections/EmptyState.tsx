import EmptyState from "../../../components/ui/EmptyState";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";

interface Props {
  onGoToProjects: () => void;
}

export default function DeployEmptyState({ onGoToProjects }: Props) {
  return (
    <EmptyState
      icon={<RocketIcon className="w-12 h-12" />}
      description="No deployments yet. Deploy from a project page to get started."
      action={{ label: "Go to Projects", onClick: onGoToProjects }}
    />
  );
}
