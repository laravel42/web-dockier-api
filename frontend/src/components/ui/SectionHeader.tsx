import { typePanelDesc, typePanelTitle } from "../../utils/styles";

interface Props {
  title: string;
  description?: string;
  className?: string;
}

export default function SectionHeader({ title, description, className = "" }: Props) {
  return (
    <div className={`mb-4 ${className}`}>
      <h2 className={typePanelTitle}>{title}</h2>
      {description && <p className={`${typePanelDesc} mt-0.5`}>{description}</p>}
    </div>
  );
}
