import {
  CLINIC_TZ,
  formatCurrency,
  formatDate,
  totalCharged,
  visitTimeDisplay,
  type DayTotals,
  type ShiftTotals,
  type Visit,
} from "@/lib/types";

interface PrintDayReportProps {
  /** YYYY-MM-DD in Asia/Dhaka. */
  date: string;
  /** Every visit that day, both shifts, unpaginated. */
  visits: Visit[];
  /** Straight from getDayTotals — never recomputed here, so the report and the
   *  on-screen summary strip cannot disagree. */
  totals: DayTotals | null;
}

function generatedAt(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

const EMPTY_SHIFT: ShiftTotals = {
  patients: 0,
  fees: 0,
  newPatients: 0,
  returningPatients: 0,
};

/**
 * One shift: its visits, then its own four-figure summary.
 *
 * The rows are filtered from the full-day list the report was already given —
 * no extra fetch — while every number in the summary comes straight from
 * getDayTotals. Counting the filtered rows here instead would be a second
 * source of truth, free to drift from the totals strip on screen.
 *
 * Rendered even when the shift is empty: a missing Evening block reads as a
 * broken report, whereas an explicit row of zeros reads as a quiet evening.
 */
function ShiftBlock({
  title,
  visits,
  totals,
}: {
  title: string;
  visits: Visit[];
  totals: ShiftTotals;
}) {
  return (
    <section className="shift-block">
      <h2>{title}</h2>

      <table className="visit-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Address</th>
            <th>Time</th>
            <th className="num">Charged</th>
          </tr>
        </thead>
        <tbody>
          {visits.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-row">
                No {title.toLowerCase()} visits recorded on this date.
              </td>
            </tr>
          ) : (
            visits.map((v) => {
              // Same helper as the screen table and the mobile cards, so paper
              // never disagrees with what the desk saw.
              const time = visitTimeDisplay(v);
              return (
              <tr key={v.id}>
                <td>{v.patientId}</td>
                <td>{v.name}</td>
                <td>{v.phone}</td>
                <td>{v.address}</td>
                <td>
                  {time.primary}
                  {time.secondary && <span className="split">{time.secondary}</span>}
                </td>
                <td className="num">
                  {formatCurrency(totalCharged(v))}
                  {v.medicineWeeks > 0 && (
                    <span className="split">
                      {formatCurrency(v.fee)} + {v.medicineWeeks} wk{" "}
                      {formatCurrency(v.medicineFee)}
                    </span>
                  )}
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>

      <table className="shift-summary">
        <thead>
          <tr>
            <th>{title} total patients</th>
            <th>New patients</th>
            <th>Returning patients</th>
            <th className="num">Collection</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{totals.patients}</td>
            <td>{totals.newPatients}</td>
            <td>{totals.returningPatients}</td>
            <td className="num">{formatCurrency(totals.fees)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/**
 * Hidden on screen, rendered only by the print stylesheet (see #print-report in
 * styles.css). Plain text and plain tables — no badges, buttons or controls.
 *
 * Laid out as Morning block, Evening block, then the combined summary, so the
 * paper copy matches how the desk actually works: each shift is handed over and
 * reconciled on its own, and the day is only totalled at the end.
 */
export function PrintDayReport({ date, visits, totals }: PrintDayReportProps) {
  // An empty day is a valid report: each table shows a placeholder row and every
  // summary figure is a real zero from getDayTotals.
  const summary = totals ?? {
    date,
    all: EMPTY_SHIFT,
    morning: EMPTY_SHIFT,
    evening: EMPTY_SHIFT,
    newPatients: 0,
    returningPatients: 0,
  };

  const morning = visits.filter((v) => v.shift === "morning");
  const evening = visits.filter((v) => v.shift === "evening");

  return (
    <section id="print-report" aria-hidden="true">
      <header className="report-head">
        <h1>HealthLink</h1>
        <p className="report-title">Daily Visit Report</p>
        <p className="report-date">{formatDate(`${date}T00:00:00+06:00`)}</p>
        <p className="report-meta">Generated on {generatedAt()} (Asia/Dhaka)</p>
      </header>

      <ShiftBlock title="Morning" visits={morning} totals={summary.morning} />
      <ShiftBlock title="Evening" visits={evening} totals={summary.evening} />

      <div className="report-summary">
        <h2>Summary</h2>
        <dl>
          <div>
            <dt>Total patients</dt>
            <dd>{summary.all.patients}</dd>
          </div>
          <div>
            <dt>New patients</dt>
            <dd>{summary.newPatients}</dd>
          </div>
          <div>
            <dt>Returning patients</dt>
            <dd>{summary.returningPatients}</dd>
          </div>
          <div>
            <dt>Morning patients</dt>
            <dd>{summary.morning.patients}</dd>
          </div>
          <div>
            <dt>Evening patients</dt>
            <dd>{summary.evening.patients}</dd>
          </div>
          <div>
            <dt>Morning collection</dt>
            <dd>{formatCurrency(summary.morning.fees)}</dd>
          </div>
          <div>
            <dt>Evening collection</dt>
            <dd>{formatCurrency(summary.evening.fees)}</dd>
          </div>
          <div className="grand">
            <dt>Total collection</dt>
            <dd>{formatCurrency(summary.all.fees)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
