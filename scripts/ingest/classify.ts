/**
 * Facility-type classification and noise detection for Outscraper results.
 *
 * Two independent judgments per place:
 *   facilityType  — what kind of facility this is (from Google category + name)
 *   serviceOnly   — likely a hauler/service business, NOT a public drop-off
 *                   (junk removal, dumpster rental, curbside collection)
 *
 * Neither judgment touches review_status — approval is always manual in admin.
 */

import type { OutscraperPlace } from './outscraper';

export type FacilityType =
  | 'landfill'
  | 'transfer_station'
  | 'recycling_center'
  | 'e_waste'
  | 'scrap_metal'
  | 'rv_dump'
  | 'hazardous_waste'
  | 'unknown';

/** Search queries per category. State name is appended at runtime. */
export const CATEGORY_QUERIES: Record<Exclude<FacilityType, 'unknown'>, string[]> = {
  landfill: ['landfill', 'garbage dump'],
  transfer_station: ['transfer station', 'waste transfer station'],
  recycling_center: ['recycling center', 'recycling drop off center'],
  e_waste: ['electronics recycling', 'e-waste recycling'],
  scrap_metal: ['scrap metal recycling'],
  rv_dump: ['rv dump station'],
  hazardous_waste: ['household hazardous waste disposal'],
};

/** Google category/subtype strings → facility type (checked first, most reliable). */
const SUBTYPE_TYPE_MAP: Array<[RegExp, FacilityType]> = [
  [/sanitary landfill|landfill/i, 'landfill'],
  [/transfer station/i, 'transfer_station'],
  [/garbage dump|waste dump|dump site/i, 'landfill'],
  [/electronics? recycl|computer recycl/i, 'e_waste'],
  [/scrap metal|metal recycl|salvage|junkyard|auto wreck/i, 'scrap_metal'],
  [/rv dump|sanitary dump|dump station/i, 'rv_dump'],
  [/hazardous waste/i, 'hazardous_waste'],
  [/recycling center|recycling depot|recycling station|recycling drop-?off/i, 'recycling_center'],
];

/** Name patterns as a fallback when the Google category is generic. */
const NAME_TYPE_MAP: Array<[RegExp, FacilityType]> = [
  [/landfill/i, 'landfill'],
  [/transfer (station|facility)/i, 'transfer_station'],
  [/\be-?waste|electronics? recycl/i, 'e_waste'],
  [/scrap|metal recycl/i, 'scrap_metal'],
  [/rv dump|dump station/i, 'rv_dump'],
  [/hazardous/i, 'hazardous_waste'],
  [/recycl/i, 'recycling_center'],
  [/\bdump\b/i, 'landfill'],
  // County/city solid-waste programs surface as government offices — they're
  // usually the authoritative drop-off site for their county.
  [/solid waste (management )?(district|department|division|office)/i, 'recycling_center'],
];

/**
 * Service businesses that pollute these queries — haulers you call, not places
 * you drive to. Matched against name + category. High precision patterns only;
 * borderline cases stay serviceOnly=false and get sorted out in manual review.
 */
const SERVICE_ONLY_PATTERNS = [
  /junk removal/i,
  /dumpster rental/i,
  /roll[- ]?off/i,
  /garbage collection service/i,
  /waste (hauling|collection)/i,
  /1-?800-?got-?junk/i,
  /college hunks/i,
  /portable toilet|porta[- ]?pott/i,
  /septic/i,
  // Retail noise from the electronics/scrap queries: stores with trade-in or
  // recycling programs are not disposal facilities (Apple Store, car dealers,
  // phone repair shops all match "electronics recycling" searches).
  /car dealer|auto dealer|used car/i,
  /electronics store|cell phone store|phone repair|computer (store|repair)/i,
  /appliance store|furniture store|mattress store|thrift store|pawn shop/i,
  /battery store/i,
];

export interface ClassifiedPlace extends OutscraperPlace {
  facility_type: FacilityType;
  service_only: boolean;
  source_queries: string[];
}

export function classify(place: OutscraperPlace, sourceQueries: string[]): ClassifiedPlace {
  const categoryText = [place.category, place.type, place.subtypes].filter(Boolean).join(' | ');
  const name = place.name ?? '';

  let facilityType: FacilityType = 'unknown';
  let matchedFacilityCategory = false;
  for (const [pattern, type] of SUBTYPE_TYPE_MAP) {
    if (pattern.test(categoryText)) {
      facilityType = type;
      matchedFacilityCategory = true;
      break;
    }
  }
  if (facilityType === 'unknown') {
    for (const [pattern, type] of NAME_TYPE_MAP) {
      if (pattern.test(name)) {
        facilityType = type;
        break;
      }
    }
  }

  // Big waste companies list hauler subtypes ("Dumpster rental service", "Junk
  // removal service") on their real landfills/transfer stations too — a genuine
  // facility category always wins over service patterns... EXCEPT when the
  // business NAME itself says it's a hauler (Junkluggers, "X Junk Removal"):
  // those list "Recycling center" as a subtype while being pure services.
  const nameSaysService = /junk\s?(removal|lugg|haul)|got-?junk|hauling\b/i.test(name);
  const serviceOnly =
    nameSaysService ||
    (!matchedFacilityCategory &&
      SERVICE_ONLY_PATTERNS.some((p) => p.test(name) || p.test(categoryText)));

  return { ...place, facility_type: facilityType, service_only: serviceOnly, source_queries: sourceQueries };
}
