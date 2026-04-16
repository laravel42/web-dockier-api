interface IconProps {
  className?: string;
}

export default function GitBranchIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 013 3m0 0h6a3 3 0 003-3V9m0 0a3 3 0 10-3-3m3 3a3 3 0 01-3-3m0 0V3"
      />
    </svg>
  );
}
