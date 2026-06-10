import type { ReactNode } from "react";
import AppBrand from "./AppBrand";

interface Props {
  children: ReactNode;
}

export default function AuthLayout({ children }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/60 p-8 backdrop-blur">
        <AppBrand className="mb-8 justify-center w-full" link={false} size="lg" />
        {children}
      </div>
    </main>
  );
}
