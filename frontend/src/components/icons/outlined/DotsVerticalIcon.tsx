interface IconProps {
  className?: string;
}

export default function DotsVerticalIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
    </svg>
  );
}
