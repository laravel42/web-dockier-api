import { Outlet } from "react-router-dom";
import TopNavbar from "./TopNavbar";
import ErrorBoundary from "./ErrorBoundary";

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNavbar />

      <main className="flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="w-full min-w-0">
          <ErrorBoundary title="This page encountered an error">
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
