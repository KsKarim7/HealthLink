import { useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: "desktop" | "mobile";
}

export function SearchBox({ value, onChange, className, variant = "desktop" }: SearchBoxProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  if (variant === "mobile") {
    return (
      <div className={cn("relative flex items-center", className)}>
        {mobileOpen ? (
          <div className="absolute right-0 top-1/2 z-20 flex w-[calc(100vw-5rem)] max-w-xs -translate-y-1/2 items-center rounded-lg border border-input bg-card p-1 shadow-lg">
            <input
              type="search"
              inputMode="search"
              autoFocus
              placeholder="Search patients..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-full rounded-md bg-transparent px-2 text-base outline-none"
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                onChange("");
                setMobileOpen(false);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Open search"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
          >
            <Search size={20} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
      <input
        type="search"
        inputMode="search"
        placeholder="Search patients..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-10 text-base shadow-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
