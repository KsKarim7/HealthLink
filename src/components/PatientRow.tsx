import { Fragment, useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Ban, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDate,
  formatDay,
  formatVoidedAt,
  getShiftBadgeClass,
  getShiftRowClass,
  totalCharged,
  visitTimeDisplay,
  type Visit,
} from "@/lib/types";

/** Column count, so the voided-detail row can span the full width. */
export const PATIENT_TABLE_COLUMNS = 10;

interface PatientRowProps {
  visit: Visit;
  tabletMode?: boolean;
  /** Opens the confirm dialog. Absent on an already-voided row. */
  onVoid?: (visit: Visit) => void;
}

export function PatientRow({ visit, tabletMode = false, onVoid }: PatientRowProps) {
  const [expanded, setExpanded] = useState(false);
  const time = visitTimeDisplay(visit);

  return (
    <Fragment>
    <TableRow className={cn(getShiftRowClass(visit.shift), visit.voided && "opacity-60")}>
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
      {/* Narrow action cell. Always rendered, never hover-only: a control that
          only appears on hover is unusable on the desk tablet. */}
      <TableCell className="w-12 text-right">
        {visit.voided ? (
          <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
            Voided
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onVoid?.(visit)}
            title={`Void visit ${visit.patientId}`}
            aria-label={`Void visit ${visit.patientId} for ${visit.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Ban size={16} />
          </button>
        )}
      </TableCell>
    </TableRow>

    {/* Why it was voided, who by and when — shown inline rather than behind a
        tap, since these rows only appear when "Show voided" is deliberately on
        and the reason is the whole point of looking. */}
    {visit.voided && (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={PATIENT_TABLE_COLUMNS} className="py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Voided</span>
          {visit.voidReason ? ` — ${visit.voidReason}` : ""}
          {visit.voidedBy ? ` · by ${visit.voidedBy}` : ""}
          {visit.voidedAt ? ` · ${formatVoidedAt(visit.voidedAt)}` : ""}
        </TableCell>
      </TableRow>
    )}
    </Fragment>
  );
}
