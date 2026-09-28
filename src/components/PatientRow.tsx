import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatDay,
  getShiftBadgeClass,
  getShiftRowClass,
  totalCharged,
  visitTimeDisplay,
  type Visit,
} from "@/lib/types";

interface PatientRowProps {
  visit: Visit;
  tabletMode?: boolean;
}

export function PatientRow({ visit, tabletMode = false }: PatientRowProps) {
  const [expanded, setExpanded] = useState(false);
  const time = visitTimeDisplay(visit);

  return (
    <TableRow className={getShiftRowClass(visit.shift)}>
      <TableCell className="sticky left-0 z-10 w-32 bg-inherit font-medium lg:static">
        {visit.patientId}
        {/* A separate fact from Backdated — this one is about the patient record
            being created late, not about when the visit happened. Both can show
            on one row. Text rather than colour alone. */}
        {visit.legacyEntry && (
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Old entry
          </span>
        )}
      </TableCell>
      <TableCell className="sticky left-32 z-10 bg-inherit font-medium lg:static">
        {visit.name}
      </TableCell>
      <TableCell className={tabletMode ? "hidden lg:table-cell" : ""}>{visit.phone}</TableCell>
      <TableCell className={tabletMode ? "hidden lg:table-cell" : ""}>
        <div className="flex items-center gap-2">
          {/* Wider since the Recorded by column went: the freed width goes to the
              address, which is the column that was actually being truncated. */}
          <span className="max-w-[18rem] truncate">{visit.address}</span>
          {tabletMode && (
            <button
              type="button"
              aria-label={expanded ? "Hide address" : "Show address"}
              onClick={() => setExpanded(!expanded)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
        {tabletMode && expanded && (
          <p className="mt-1 text-sm text-muted-foreground lg:hidden">{visit.address}</p>
        )}
      </TableCell>
      <TableCell>{formatDate(visit.visitAt)}</TableCell>
      <TableCell className={tabletMode ? "hidden lg:table-cell" : ""}>
        {formatDay(visit.visitAt)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div>{time.primary}</div>
        {time.secondary && (
          <div className="text-xs font-normal text-muted-foreground">{time.secondary}</div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={getShiftBadgeClass(visit.shift)}>
          {visit.shift === "morning" ? "Morning" : "Evening"}
        </Badge>
      </TableCell>
      {/* Total charged, with the appointment/medicine split underneath so the
          week count is visible without widening the table or hiding it behind a click. */}
      <TableCell className="text-right">
        <div className="font-semibold">{formatCurrency(totalCharged(visit))}</div>
        {visit.medicineWeeks > 0 && (
          <div className="whitespace-nowrap text-xs font-normal text-muted-foreground">
            {formatCurrency(visit.fee)} + {visit.medicineWeeks} wk{" "}
            {formatCurrency(visit.medicineFee)}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
