import { ArrowRightLeft, Truck, PackageCheck } from 'lucide-react';
import type { TransferRecommendation } from '../types';
import { medicines, districts } from '../data/districts';

const medicineName = (id: string) => medicines.find((m) => m.id === id)?.name ?? id;
const districtName = (id: string) => districts.find((d) => d.id === id)?.name ?? id;

export function TransferBadge({
  rec,
  detail = true,
  insufficient = false,
}: {
  rec: TransferRecommendation;
  detail?: boolean;
  /** Amber PARTIAL treatment when the transfer cannot reach the reserve target. */
  insufficient?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-semibold ${
          insufficient
            ? 'bg-status-watch/15 text-status-watch'
            : 'bg-accent-wash text-accent-dark dark:bg-accent/20 dark:text-accent-light'
        }`}
      >
        <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {insufficient ? 'PARTIAL — ESCALATE' : 'REBALANCE'}
      </span>
      <span className="tabular font-semibold text-ink">
        {rec.quantity.toLocaleString()} units {medicineName(rec.medicineId)}
      </span>
      {detail && (
        <span className="tabular inline-flex items-center gap-1 text-slate-450">
          <Truck className="h-3.5 w-3.5" aria-hidden="true" />
          {rec.transitHours}h · from {districtName(rec.fromDistrictId)}
        </span>
      )}
      <span className="tabular inline-flex items-center gap-1 text-slate-450">
        <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
        cover {rec.daysOfCoverBefore.toFixed(1)}d → {rec.daysOfCoverAfter.toFixed(1)}d
      </span>
    </div>
  );
}
