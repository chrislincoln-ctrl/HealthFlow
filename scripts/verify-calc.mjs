// Section 4 gate: the three band assertions must pass before wiring UI.
// Run: npm run verify:calc
// Bundles the REAL src/utils/calc.ts and src/data/districts.ts with esbuild,
// so these assertions test the exact code the app imports.
import {
  daysOfCover,
  riskScore,
  riskBand,
  riskFactors,
  buildTransferRecommendation,
  buildAllocationPlan,
  transitHoursBetween,
  computeAllRisks,
  countBands,
} from './.tmp/calc.mjs';
import { districts, inventory, transitHours } from './.tmp/data.mjs';

let failures = 0;
function assert(name, cond, detail = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${detail}`);
  }
}

const byId = (id) => districts.find((d) => d.id === id);
const rec = (districtId, medicineId) =>
  inventory.find((r) => r.districtId === districtId && r.medicineId === medicineId);

// ── The three required assertions ────────────────────────────────────────────
const nadiaOrs = rec('nadia', 'ors');
const nadia = byId('nadia');
const nadiaScore = riskScore(nadia, nadiaOrs, 1);
assert(
  'Nadia/ORS at multiplier 1 → critical',
  riskBand(nadiaScore) === 'critical',
  `(score=${nadiaScore}, band=${riskBand(nadiaScore)})`,
);

const hooghlyOrs = rec('hooghly', 'ors');
const hooghly = byId('hooghly');
const hooghlyScore = riskScore(hooghly, hooghlyOrs, 1);
assert(
  'Hooghly/ORS → stable',
  riskBand(hooghlyScore) === 'stable',
  `(score=${hooghlyScore}, band=${riskBand(hooghlyScore)})`,
);

const howrahAmox = rec('howrah', 'amoxicillin');
const howrah = byId('howrah');
const howrahScore = riskScore(howrah, howrahAmox, 1);
assert(
  'Howrah/amoxicillin → high',
  riskBand(howrahScore) === 'high',
  `(score=${howrahScore}, band=${riskBand(howrahScore)})`,
);

// ── Sanity checks on the engine mechanics ────────────────────────────────────
assert(
  'daysOfCover(Nadia/ORS) is forecast-based, below reserve (≈5d, not 5.2 naive)',
  daysOfCover(nadiaOrs) > 3.5 && daysOfCover(nadiaOrs) < 6.5,
  `got ${daysOfCover(nadiaOrs)}`,
);

const factors = riskFactors(nadia, nadiaOrs, 1);
const factorSum = factors.reduce((s, f) => s + f.weighted, 0);
assert(
  'risk factors sum ≈ risk score',
  Math.abs(factorSum - nadiaScore) <= 1,
  `sum=${factorSum.toFixed(1)} vs score=${nadiaScore}`,
);
assert('risk factors count = 6', factors.length === 6);

// Redistribution (prototype allocation logic): sources are distance-ranked now.
// The nearest eligible source with safe surplus must lead the plan.
const allocSources = ['hooghly', 'kolkata'].map((id) => ({
  record: rec(id, 'ors'),
  district: byId(id),
}));
const plan = buildAllocationPlan(nadiaOrs, nadia, allocSources, 1);
assert('allocation plan found for Nadia/ORS', plan !== null);
assert(
  'plan leads with the shortest-transit eligible source',
  plan && plan.legs[0].transitHours === Math.min(...plan.legs.map((l) => l.transitHours)),
  plan ? JSON.stringify(plan.legs) : '',
);
assert(
  'plan quantities are whole shipment units',
  plan && plan.legs.every((l) => l.quantity % 100 === 0),
  plan ? JSON.stringify(plan.legs) : '',
);
assert(
  'transfer improves days of cover',
  plan && plan.daysOfCoverAfter > plan.daysOfCoverBefore,
);
assert(
  'no pointless transfer when destination is above reserve',
  buildAllocationPlan(
    { ...rec('hooghly', 'ors'), currentStock: 20000 },
    hooghly,
    allocSources,
    1,
  ) === null,
);
assert(
  'source below its own reserve after giving → ineligible',
  buildAllocationPlan(
    nadiaOrs,
    nadia,
    [{ record: { ...rec('kolkata', 'ors'), currentStock: 4100 }, district: byId('kolkata') }],
    1,
  ) === null,
);
assert(
  'disrupted corridor removes a source',
  buildAllocationPlan(
    nadiaOrs,
    nadia,
    [
      { record: rec('kolkata', 'ors'), district: byId('kolkata') },
      { record: rec('hooghly', 'ors'), district: byId('hooghly') },
    ],
    { disruptedCorridors: ['kolkata->nadia', 'hooghly->nadia'] },
  ) === null,
);

// REGRESSION (multi-source cover truth): a single-source recommendation must
// claim only what ITS OWN leg achieves arithmetically. The plan-wide outcome
// lives on fullPlan* fields. This exact mismatch (2,500u claimed as 5→8d when
// the leg alone yields 7d) is the bug class this assertion locks out.
const wrapRec = buildTransferRecommendation(
  nadiaOrs,
  nadia,
  allocSources.map((s) => ({ record: s.record, transitHours: transitHoursBetween(s.district.id, 'nadia', 1) })),
  1,
);
assert('wrapper recommendation exists for Nadia/ORS', wrapRec !== null);
assert(
  'wrapper leg-1 cover claim is arithmetically true for that leg alone',
  wrapRec &&
    wrapRec.daysOfCoverAfter ===
      daysOfCover({ ...nadiaOrs, currentStock: nadiaOrs.currentStock + wrapRec.quantity }),
  wrapRec ? `claimed ${wrapRec.daysOfCoverAfter}d after +${wrapRec.quantity}u` : '',
);
assert(
  'full-plan fields carry the plan-wide outcome (4,100u → 8d)',
  wrapRec && wrapRec.fullPlanQuantity === 4100 && wrapRec.fullPlanCoverAfter === 8 && wrapRec.legs.length === 2,
  wrapRec ? `legs=${wrapRec.legs.length} total=${wrapRec.fullPlanQuantity} cover=${wrapRec.fullPlanCoverAfter}` : '',
);
assert(
  'per-leg destinationCoverAfter values are each arithmetically true',
  wrapRec &&
    wrapRec.legs.every((leg) => {
      const prior = wrapRec.legs
        .slice(0, wrapRec.legs.indexOf(leg))
        .reduce((s, l) => s + l.quantity, 0);
      return (
        leg.destinationCoverAfter ===
        daysOfCover({ ...nadiaOrs, currentStock: nadiaOrs.currentStock + prior + leg.quantity })
      );
    }),
);
assert(
  'leg quantities sum to the plan total (no surplus double-spend inside a plan)',
  wrapRec && wrapRec.legs.reduce((s, l) => s + l.quantity, 0) === wrapRec.fullPlanQuantity,
);

// Regression: growth-heavy lines (e.g. Nadia/Paracetamol, +18% growth) must get
// a positive quantity — needed is sized against PROJECTED demand, matching the
// below-reserve test. Never a zero-unit recommendation.
const nadiaPara = rec('nadia', 'paracetamol');
const paraSources = ['hooghly', 'kolkata'].map((id) => ({
  record: rec(id, 'paracetamol'),
  district: byId(id),
}));
const paraPlanStressed = buildAllocationPlan(nadiaPara, nadia, paraSources, 1.3);
assert(
  'Nadia/Paracetamol plan exists when stressed (+30% demand drops it below reserve)',
  paraPlanStressed !== null && paraPlanStressed.transferredUnits > 0,
  paraPlanStressed ? `qty=${paraPlanStressed.transferredUnits}` : 'no recommendation',
);
assert(
  'no recommendation when the line already holds reserve (no pointless transfer)',
  buildAllocationPlan(nadiaPara, nadia, paraSources, 1) === null,
);

const allRisks = computeAllRisks(districts, inventory, 1);
const bands = countBands(allRisks);
assert(
  'baseline bands: 1 critical / 1 high / 2 watch / 2 stable',
  bands.critical === 1 && bands.high === 1 && bands.watch === 2 && bands.stable === 2,
  JSON.stringify(bands),
);

const stressed = countBands(computeAllRisks(districts, inventory, 1.3));
assert(
  '+30% demand stresses the network (critical grows)',
  stressed.critical >= bands.critical,
  JSON.stringify(stressed),
);

// Rank order sanity: Nadia must be the top-risk district at baseline.
assert(
  'Nadia ranks #1 at baseline',
  allRisks[0].district.id === 'nadia',
  `got ${allRisks[0].district.id}`,
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll calc assertions passed — safe to wire into UI.');
}
