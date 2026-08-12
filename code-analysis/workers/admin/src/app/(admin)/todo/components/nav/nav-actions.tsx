"use client";

import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  Link,
  Mail,
  MoreHorizontal,
  Plus,
  Puzzle,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { todoAbsoluteUrl, todoRoutes } from "@/lib/todo-routes";

export function NavActions({ onSearchClick }: { onSearchClick?: () => void }) {
  const router = useRouter();

  const handleAction = (action: string) => {
    switch (action) {
      case "activity-log":
        router.push(todoRoutes.activity);
        break;
      case "add-section":
        // TODO: Implement add section functionality
        console.log("Add section");
        break;
      case "copy-link": {
        const url = todoAbsoluteUrl(todoRoutes.all);
        navigator.clipboard
          .writeText(url)
          .then(() => toast.success("Inbox link copied to clipboard"))
          .catch(() => toast.error("Could not copy link"));
        break;
      }
      case "import-csv":
        // TODO: Implement import CSV functionality
        console.log("Import from CSV");
        break;
      case "export-csv":
        // TODO: Implement export CSV functionality
        console.log("Export as CSV");
        break;
      case "email-tasks":
        // TODO: Implement email tasks functionality
        console.log("Email tasks to Inbox");
        break;
      case "calendar-feed":
        // TODO: Implement calendar feed functionality
        console.log("Inbox calendar feed");
        break;
      case "add-extension":
        // TODO: Implement add extension functionality
        console.log("Add extension...");
        break;
      default:
        break;
    }
  };

  const data = [
    [
      {
        label: "Add section",
        icon: Plus,
        action: "add-section",
      },
    ],
    [
      {
        label: "Copy link to Inbox",
        icon: Link,
        action: "copy-link",
      },
      {
        label: "Import from CSV",
        icon: ArrowDown,
        action: "import-csv",
      },
      {
        label: "Export as CSV",
        icon: ArrowUp,
        action: "export-csv",
      },
    ],
    [
      {
        label: "Email tasks to Inbox",
        icon: Mail,
        action: "email-tasks",
      },
      {
        label: "Inbox calendar feed",
        icon: Calendar,
        action: "calendar-feed",
      },
    ],
    [
      {
        label: "Activity log",
        icon: BarChart3,
        action: "activity-log",
      },
    ],
    [
      {
        label: "Add extension...",
        icon: Puzzle,
        action: "add-extension",
      },
    ],
  ];
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="group relative flex items-center">
        <div
          suppressHydrationWarning
          className="text-muted-foreground font-medium transition-transform duration-200 ease-out group-hover:-translate-x-16"
        >
          {new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </div>
        <div
          suppressHydrationWarning
          className="text-muted-foreground absolute right-0 translate-x-2 scale-50 font-medium whitespace-nowrap opacity-0 transition-all duration-200 ease-out group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100"
        >
          {new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-muted-foreground hover:text-foreground h-7 gap-2 px-2"
        onClick={onSearchClick}
        aria-label="Search tasks"
      >
        <Search className="size-3.5" />
        <span className="text-xs">Search</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="data-[state=open]:bg-accent h-7 w-7"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="end">
          {data.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.map((item, itemIndex) => (
                <DropdownMenuItem
                  key={itemIndex}
                  onClick={() => handleAction(item.action)}
                  className="gap-2"
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </DropdownMenuItem>
              ))}
              {groupIndex < data.length - 1 && <DropdownMenuSeparator />}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
