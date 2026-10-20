import { Outlet } from "react-router-dom";
import TopNavbar from "./TopNavbar";
import ErrorBoundary from "./ErrorBoundary";

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only rounded-md border border-border bg-card px-3 py-2 text-ui font-medium text-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <TopNavbar />

      {/* tabIndex -1 so the skip link lands focus in main rather than only scrolling to it. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1600px] flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8"
      >
        <div className="w-full min-w-0">
          <ErrorBoundary title="This page encountered an error">
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
