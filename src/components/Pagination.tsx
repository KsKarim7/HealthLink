import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  const canGoBack = page > 1;
  const canGoForward = page < totalPages;

  return (
    <div className="flex items-center justify-between gap-2 md:justify-center md:gap-4">
      {/* Mobile compact variant */}
      <div className="flex w-full items-center justify-between md:hidden">
        <button
          type="button"
          onClick={() => canGoBack && onChange(page - 1)}
          disabled={!canGoBack}
          className={cn(
            "flex h-11 items-center gap-1 rounded-lg px-3 font-medium text-foreground disabled:opacity-40",
            canGoBack && "hover:bg-muted",
          )}
        >
          <ChevronLeft size={18} />
          Newer
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => canGoForward && onChange(page + 1)}
          disabled={!canGoForward}
          className={cn(
            "flex h-11 items-center gap-1 rounded-lg px-3 font-medium text-foreground disabled:opacity-40",
            canGoForward && "hover:bg-muted",
          )}
        >
          Older
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Desktop/tablet full variant */}
      <div className="hidden items-center gap-2 md:flex">
        <button
          type="button"
          onClick={() => canGoBack && onChange(page - 1)}
          disabled={!canGoBack}
          className={cn(
            "flex h-11 items-center gap-1 rounded-lg border border-input px-3 text-sm font-medium transition-colors disabled:opacity-40",
            canGoBack && "hover:bg-muted",
          )}
        >
          <ChevronLeft size={16} />
          Newer
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "flex h-11 min-w-[44px] items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors",
              p === page
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-card text-foreground hover:bg-muted",
            )}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          onClick={() => canGoForward && onChange(page + 1)}
          disabled={!canGoForward}
          className={cn(
            "flex h-11 items-center gap-1 rounded-lg border border-input px-3 text-sm font-medium transition-colors disabled:opacity-40",
            canGoForward && "hover:bg-muted",
          )}
        >
          Older
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
