import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatDay,
  formatTime,
  getShiftBadgeClass,
  getShiftRowClass,
  totalCharged,
  type Visit,
} from "@/lib/types";

interface PatientRowProps {
  visit: Visit;
  tabletMode?: boolean;
}

export function PatientRow({ visit, tabletMode = false }: PatientRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TableRow className={getShiftRowClass(visit.shift)}>
      <TableCell className="sticky left-0 z-10 w-32 bg-inherit font-medium lg:static">
        {visit.patientId}
      </TableCell>
      <TableCell className="sticky left-32 z-10 bg-inherit font-medium lg:static">
        {visit.name}
      </TableCell>
      <TableCell className={tabletMode ? "hidden lg:table-cell" : ""}>{visit.phone}</TableCell>
      <TableCell className={tabletMode ? "hidden lg:table-cell" : ""}>
        <div className="flex items-center gap-2">
          <span className="max-w-[12rem] truncate">{visit.address}</span>
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
      <TableCell>{formatTime(visit.visitAt)}</TableCell>
      <TableCell>
        <Badge variant="outline" className={getShiftBadgeClass(visit.shift)}>
          {visit.shift === "morning" ? "Morning" : "Evening"}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{visit.recordedBy}</TableCell>
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
