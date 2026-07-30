import type { FacilityType } from "@/types";

/** Display labels for facility types (card pills, filters, detail pages). */
export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  landfill: "Landfill",
  transfer_station: "Transfer Station",
  recycling_center: "Recycling Center",
  e_waste: "E-Waste Recycling",
  scrap_metal: "Scrap Metal",
  rv_dump: "RV Dump Station",
  hazardous_waste: "Hazardous Waste Disposal",
  unknown: "Waste Facility",
};

/**
 * URL slug ↔ facility type for category pages
 * (/[stateSlug]/category/[categorySlug]).
 */
export const CATEGORY_SLUG_MAP: Record<string, FacilityType> = {
  landfills: "landfill",
  "transfer-stations": "transfer_station",
  "recycling-centers": "recycling_center",
  "e-waste": "e_waste",
  "scrap-metal": "scrap_metal",
  "rv-dump-stations": "rv_dump",
  "hazardous-waste": "hazardous_waste",
};

export const TYPE_TO_CATEGORY_SLUG: Record<FacilityType, string | null> = {
  landfill: "landfills",
  transfer_station: "transfer-stations",
  recycling_center: "recycling-centers",
  e_waste: "e-waste",
  scrap_metal: "scrap-metal",
  rv_dump: "rv-dump-stations",
  hazardous_waste: "hazardous-waste",
  unknown: null,
};

/** SEO page labels for category pages ("Landfills & Dumps in Indiana"). */
export const CATEGORY_SEO_LABELS: Record<string, string> = {
  landfills: "Landfills & Dumps",
  "transfer-stations": "Waste Transfer Stations",
  "recycling-centers": "Recycling Centers",
  "e-waste": "Electronics Recycling & E-Waste Drop-off",
  "scrap-metal": "Scrap Metal Recycling",
  "rv-dump-stations": "RV Dump Stations",
  "hazardous-waste": "Household Hazardous Waste Disposal",
};

/** Labels for the accepted_materials moat field. */
export const MATERIAL_LABELS: Record<string, string> = {
  household: "Household Trash",
  construction: "Construction Debris",
  yard: "Yard Waste",
  e_waste: "Electronics",
  hazmat: "Hazardous Waste",
  tires: "Tires",
  appliances: "Appliances",
  scrap_metal: "Scrap Metal",
  mattresses: "Mattresses",
  concrete: "Concrete & Brick",
  batteries: "Batteries",
  paint: "Paint",
};
