import {
  CLINIC_TZ,
  formatCurrency,
  formatDate,
  formatTime,
  totalCharged,
  type DayTotals,
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

/**
 * Hidden on screen, rendered only by the print stylesheet (see #print-report in
 * styles.css). Plain text and a plain table — no badges, buttons or controls.
 */
export function PrintDayReport({ date, visits, totals }: PrintDayReportProps) {
  // An empty day is a valid report: the table shows a placeholder row and every
  // summary figure is a real zero from getDayTotals.
  const summary = totals ?? {
    date,
    all: { patients: 0, fees: 0 },
    morning: { patients: 0, fees: 0 },
    evening: { patients: 0, fees: 0 },
    newPatients: 0,
    returningPatients: 0,
  };

  return (
    <section id="print-report" aria-hidden="true">
      <header className="report-head">
        <h1>HealthLink</h1>
        <p className="report-title">Daily Visit Report</p>
        <p className="report-date">{formatDate(`${date}T00:00:00+06:00`)}</p>
        <p className="report-meta">Generated on {generatedAt()} (Asia/Dhaka)</p>
      </header>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Address</th>
            <th>Time</th>
            <th>Shift</th>
            <th>Recorded by</th>
            <th className="num">Charged</th>
          </tr>
        </thead>
        <tbody>
          {visits.length === 0 ? (
            <tr>
              <td colSpan={8} className="empty-row">
                No visits recorded on this date.
              </td>
            </tr>
          ) : (
            visits.map((v) => (
              <tr key={v.id}>
                <td>{v.patientId}</td>
                <td>{v.name}</td>
                <td>{v.phone}</td>
                <td>{v.address}</td>
                <td>{formatTime(v.visitAt)}</td>
                <td>{v.shift === "morning" ? "Morning" : "Evening"}</td>
                <td>{v.recordedBy}</td>
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
            ))
          )}
        </tbody>
      </table>

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
