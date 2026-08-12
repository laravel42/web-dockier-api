interface Props {
  children: React.ReactNode;
}

export default function EcommerceDashboardGroupLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
