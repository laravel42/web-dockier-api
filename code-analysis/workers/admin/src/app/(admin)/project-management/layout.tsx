interface Props {
  children: React.ReactNode;
}

export default function ProjectManagementAdminLayout({ children }: Props) {
  return (
    <div data-layout="fixed" className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
