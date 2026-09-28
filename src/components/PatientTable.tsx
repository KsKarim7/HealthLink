import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PatientRow } from "./PatientRow";
import type { Visit } from "@/lib/types";

interface PatientTableProps {
  visits: Visit[];
  isLoading?: boolean;
  tabletMode?: boolean;
  search: string;
  /** Opens the void-confirmation dialog for a row. */
  onVoid?: (visit: Visit) => void;
}

export function PatientTable({
  visits,
  isLoading,
  tabletMode = false,
  search,
  onVoid,
}: PatientTableProps) {
  const hidden = tabletMode ? "hidden lg:table-cell" : "";

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-32">ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className={hidden}>Phone</TableHead>
              <TableHead className={hidden}>Address</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className={hidden}>Day</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead className="text-right">Charged</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell className={hidden}><Skeleton className="h-4 w-28" /></TableCell>
                <TableCell className={hidden}><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell className={hidden}><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-6" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
        <p className="text-lg font-medium text-foreground">No patients found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {search ? "Try a different search term." : "Add a patient to get started."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="sticky left-0 z-10 w-32 bg-muted/50 lg:static">ID</TableHead>
            <TableHead className="sticky left-32 z-10 bg-muted/50 lg:static">Name</TableHead>
            <TableHead className={hidden}>Phone</TableHead>
            <TableHead className={hidden}>Address</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className={hidden}>Day</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Shift</TableHead>
            <TableHead className="text-right">Charged</TableHead>
            {/* Actions. Unlabelled so the column stays narrow; each button
                carries its own accessible name. */}
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visits.map((visit) => (
            <PatientRow key={visit.id} visit={visit} tabletMode={tabletMode} onVoid={onVoid} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
