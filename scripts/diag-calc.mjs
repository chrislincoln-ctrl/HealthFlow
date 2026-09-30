import { computeAllRisks, daysOfCover, stockOutDays, buildAllocationPlan } from './.tmp/calc.mjs';
import { districts, inventory } from './.tmp/data.mjs';

const nadiaPara = inventory.find((r) => r.districtId === 'nadia' && r.medicineId === 'paracetamol');
const nadia = districts.find((d) => d.id === 'nadia');
console.log('nadia/para stock', nadiaPara.currentStock, 'daily', nadiaPara.dailyConsumption, 'growth', nadiaPara.demandGrowthPct);
console.log('cover', daysOfCover(nadiaPara, 1), 'so', stockOutDays(nadiaPara, 1));
const sources = ['hooghly', 'kolkata'].map((id) => ({
  record: inventory.find((r) => r.districtId === id && r.medicineId === 'paracetamol'),
  district: districts.find((d) => d.id === id),
}));
for (const s of sources) console.log(s.district.id, 'surplus', s.record.currentStock, 'cover', daysOfCover(s.record, 1));
console.log('plan:', JSON.stringify(buildAllocationPlan(nadiaPara, nadia, sources, 1), null, 1));
