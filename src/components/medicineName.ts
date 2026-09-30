import { medicines } from '../data/districts';

/** Display name for a medicine id (single source: the dataset). */
export function medicineNameOf(id: string): string {
  return medicines.find((m) => m.id === id)?.name ?? id;
}
