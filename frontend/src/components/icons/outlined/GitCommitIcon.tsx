interface IconProps {
  className?: string;
}

export default function GitCommitIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" d="M12 3v6m0 6v6" />
    </svg>
  );
}
