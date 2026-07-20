interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ total, limit, offset, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const rangeStart = offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3">
      <span className="text-[11px] text-text-muted">
        {rangeStart}–{rangeEnd} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="h-7 rounded-md border border-border px-2.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-[11px] text-text-muted">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="h-7 rounded-md border border-border px-2.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
