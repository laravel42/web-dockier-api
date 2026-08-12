import { ArrowLeft, History } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { todoRoutes } from "@/lib/todo-routes";

export default function TaskNotFound() {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-14">
          <History className="size-7" />
        </EmptyMedia>
        <EmptyTitle>Task not found</EmptyTitle>
        <EmptyDescription>
          Tasks aren&apos;t saved across reloads yet — anything from your last
          session has reset.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href={todoRoutes.all}>
            <ArrowLeft className="size-4" />
            Back to all tasks
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
