import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatTime,
  getShiftBadgeClass,
  getShiftRowClass,
  totalCharged,
  type Visit,
} from "@/lib/types";

interface PatientCardProps {
  visit: Visit;
}

export function PatientCard({ visit }: PatientCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={getShiftRowClass(visit.shift)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{visit.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{visit.patientId}</p>
          </div>
          <Badge variant="outline" className={getShiftBadgeClass(visit.shift)}>
            {visit.shift === "morning" ? "Morning" : "Evening"}
          </Badge>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-foreground">{visit.phone}</span>
          <span className="font-semibold text-foreground">
            {formatCurrency(totalCharged(visit))}
          </span>
        </div>

        {visit.medicineWeeks > 0 && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <Badge variant="outline" className="font-normal">
              {visit.medicineWeeks} wk{visit.medicineWeeks === 1 ? "" : "s"} medicine
            </Badge>
            <span>
              {formatCurrency(visit.fee)} + {formatCurrency(visit.medicineFee)}
            </span>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatTime(visit.visitAt)}</span>
          <span>{formatDate(visit.visitAt)}</span>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">Recorded by {visit.recordedBy}</p>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex h-10 w-full items-center justify-center gap-1 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          {expanded ? (
            <>
              <ChevronUp size={16} /> Hide address
            </>
          ) : (
            <>
              <ChevronDown size={16} /> Show address
            </>
          )}
        </button>

        {expanded && <p className="mt-3 text-sm text-foreground">{visit.address}</p>}
      </CardContent>
    </Card>
  );
}

interface PatientCardListProps {
  visits: Visit[];
  isLoading?: boolean;
  search: string;
}

export function PatientCardList({ visits, isLoading, search }: PatientCardListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4 space-y-3">
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-4 w-1/3 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center md:hidden">
        <p className="text-base font-medium text-foreground">No patients found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {search ? "Try a different search term." : "Add a patient to get started."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {visits.map((visit) => (
        <PatientCard key={visit.id} visit={visit} />
      ))}
    </div>
  );
}
