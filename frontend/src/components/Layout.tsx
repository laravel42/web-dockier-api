import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-surface">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Toolbar />

        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
