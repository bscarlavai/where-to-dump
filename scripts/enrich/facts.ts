/**
 * Conservative fact extractors over crawled page text. Shared by the facility
 * site pass (extract-facts.ts) and the SWMD district pass (extract-swmd.ts).
 */

// ─── Fee extraction ──────────────────────────────────────────
const MONEY = /\$\s?(\d{1,4}(?:\.\d{2})?)/;
// unit keyword -> fee table label
const FEE_UNITS: Array<[RegExp, string]> = [
  [/per\s+ton|a\s+ton|\/\s*ton/i, 'per_ton'],
  [/per\s+(?:cubic\s+)?yard|\/\s*(?:cu\.?\s*)?yd/i, 'per_cubic_yard'],
  [/minimum|min\.?\s*(?:charge|fee)/i, 'minimum'],
  [/per\s+(?:car|pickup|truck)\s*(?:load)?|car\s*load|pick-?up\s+load/i, 'car_or_pickup_load'],
  [/per\s+load/i, 'per_load'],
  [/per\s+bag|a\s+bag/i, 'per_bag'],
  [/(?:per\s+)?(?:passenger\s+)?tire/i, 'tires'],
  [/mattress|box\s*spring/i, 'mattress'],
  [/appliance|refrigerator|freon|white\s+goods/i, 'appliances'],
  [/television|tv\b|monitor|electronic/i, 'electronics'],
];

// Products being SOLD (mulch, compost, soil) also price by the yard/ton —
// those are revenue lines, not disposal fees
const SALE_CONTEXT = /mulch|hardwood|topsoil|top\s+soil|soil\b|stone\b|gravel|sand\b|firewood|finished\s+compost|delivery|originally|sale\b|coupon|discount\s+code|buy\b|purchase/i;

export interface FeeFind {
  label: string;
  amount: string;
  line: string;
}

export function extractFees(text: string): FeeFind[] {
  const found = new Map<string, FeeFind>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length > 300) continue; // running text, not a rate line
    if (SALE_CONTEXT.test(line)) continue;
    const money = MONEY.exec(line);
    if (!money) continue;
    const amount = Number(money[1]);
    if (amount <= 0 || amount > 500) continue; // fee-shaped only
    const ranged = /\$\s?\d[\d.]*\s*(?:to|-|–)\s*\$?\d/.test(line);

    // "X per ton with a minimum of $Y" — the minimum is the LAST dollar
    // figure, and the rest of the line belongs to it, not to other units
    if (/minimum|min\.?\s*(?:charge|fee)/i.test(line)) {
      const all = [...line.matchAll(new RegExp(MONEY.source, 'g'))];
      const last = all[all.length - 1][1];
      if (!found.has('minimum') && Number(last) > 0 && Number(last) <= 500) {
        found.set('minimum', { label: 'minimum', amount: `$${last}`, line: line.slice(0, 160) });
      }
      continue;
    }

    for (const [re, label] of FEE_UNITS) {
      const kw = re.exec(line);
      if (!kw || found.has(label)) continue;
      // Item-priced labels: the $ must be near the keyword, or "$20 truck
      // load ... not including tires" reads as a tire fee
      const ITEM_LABELS = new Set(['tires', 'mattress', 'appliances', 'electronics']);
      if (ITEM_LABELS.has(label) && Math.abs(kw.index - (money.index ?? 0)) > 60) continue;
      found.set(label, {
        label,
        amount: ranged ? `from $${money[1]}` : `$${money[1]}`,
        line: line.slice(0, 160),
      });
    }
  }
  return [...found.values()];
}

// ─── Materials extraction ────────────────────────────────────
// taxonomy key (MATERIAL_LABELS in src/lib/constants) -> detection regex
const MATERIALS: Array<[string, RegExp]> = [
  ['household', /household\s+(?:trash|waste|garbage)|municipal\s+solid\s+waste|residential\s+(?:trash|waste|garbage)/i],
  ['construction', /construction\s+(?:debris|waste|material)|c\s*&\s*d\b|demolition\s+debris|drywall|shingles/i],
  ['yard', /yard\s+(?:waste|trimmings|debris)|brush|leaves|grass\s+clippings|limbs|compost/i],
  ['e_waste', /e-?waste|electronics?\s+(?:recycling|disposal|drop)|computers?\b|televisions?\b/i],
  ['hazmat', /household\s+hazardous|hazardous\s+waste|paint\b|chemicals\b|pesticide|tox-?away/i],
  ['tires', /\btires?\b/i],
  ['appliances', /appliances?\b|white\s+goods|refrigerators?\b|washers?\b|dryers?\b/i],
  ['scrap_metal', /scrap\s+metal|metal\s+recycling/i],
];
// Only count a material if the page also talks about accepting/taking things
const ACCEPT_CONTEXT = /accept|we\s+take|drop.?off|recycl|dispos|bring|collection\s+site|items?\s+(?:allowed|taken)/i;

export function extractMaterials(text: string): string[] {
  if (!ACCEPT_CONTEXT.test(text)) return [];
  const found: string[] = [];
  for (const [key, re] of MATERIALS) {
    if (re.test(text)) found.push(key);
  }
  // A page matching almost everything is likely a services brochure, not an
  // accepted-materials list — require some selectivity
  return found.length >= MATERIALS.length ? [] : found;
}

// ─── Residency / public access ───────────────────────────────
const RESIDENCY = /[^.\n]{0,80}\b(?:residents?\s+only|proof\s+of\s+residen|must\s+(?:be|show|provide)[^.\n]{0,40}residen|open\s+(?:only\s+)?to\s+[a-z]+\s+county\s+residents)[^.\n]{0,80}/i;

export function extractResidency(text: string): string | null {
  const m = RESIDENCY.exec(text);
  if (!m) return null;
  const sentence = m[0].trim().replace(/\s+/g, ' ');
  return sentence.length >= 15 ? sentence.slice(0, 200) : null;
}

export function extractOpenToPublic(text: string): number | null {
  if (/not\s+open\s+to\s+the\s+public|closed\s+to\s+the\s+public/i.test(text)) return 0;
  if (/open\s+to\s+the\s+public/i.test(text)) return 1;
  return null;
}
