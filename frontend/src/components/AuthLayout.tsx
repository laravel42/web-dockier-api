import type { ReactNode } from "react";
import AppBrand from "./AppBrand";

interface Props {
  children: ReactNode;
}

export default function AuthLayout({ children }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur">
        <AppBrand className="mb-6 justify-center w-full" link={false} size="lg" />
        {children}
      </div>
    </main>
  );
}
