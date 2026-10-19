import { lazy, Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary";
import Spinner from "./Spinner";

interface Props {
  markdown: string;
  className?: string;
}

/**
 * Milkdown/Crepe plus its theme CSS is the single largest thing the frontend
 * ships, and nothing on a project-detail page needs it until a markdown
 * surface actually renders. Fetched on demand; the boundary below keeps a
 * failed chunk load from leaving a blank area.
 */
const MarkdownViewerCrepe = lazy(() => import("./MarkdownViewerCrepe"));

export default function MarkdownViewer({ markdown, className = "" }: Props) {
  return (
    <ErrorBoundary title="Couldn't load the markdown viewer">
      <Suspense
        fallback={
          <div className="flex min-h-24 items-center justify-center">
            <Spinner className="size-5" />
          </div>
        }
      >
        <MarkdownViewerCrepe markdown={markdown} className={className} />
      </Suspense>
    </ErrorBoundary>
  );
}
