import { cardCls, btnSecondary } from "../../../utils/styles";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";

interface Props {
  onGoToProjects: () => void;
}

export default function EmptyState({ onGoToProjects }: Props) {
  return (
    <div className={`${cardCls} p-12 text-center`}>
      <RocketIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
      <p className="text-sm text-text-muted mb-4">No deployments yet. Deploy from a project page to get started.</p>
      <button onClick={onGoToProjects} className={btnSecondary}>Go to Projects</button>
    </div>
  );
}
