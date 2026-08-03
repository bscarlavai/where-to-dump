// ─── Core Location (Facility) ────────────────────────────────

export type FacilityType =
  | "landfill"
  | "transfer_station"
  | "recycling_center"
  | "e_waste"
  | "scrap_metal"
  | "rv_dump"
  | "hazardous_waste"
  | "unknown";

export type FacilityStatus = "imported" | "pending" | "approved" | "rejected";

export type FacilitySource = "outscraper" | "user_submission" | "admin_manual";

export interface Facility {
  id: number;
  place_id: string | null;
  name: string;
  slug: string;
  state_slug: string;
  city_slug: string;

  facility_type: FacilityType;
  secondary_types: string[];
  service_only: boolean;

  // Address
  street: string | null;
  city: string;
  state: string;
  state_abbr: string;
  zip: string | null;
  county: string | null;
  lat: number | null;
  lng: number | null;
  time_zone: string | null;

  // Contact
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;

  // Google data
  google_rating: number | null;
  google_review_count: number;
  google_business_status: string | null;
  google_primary_type: string | null;
  google_types: string[];
  google_hours: Record<string, string> | null;
  about: Record<string, unknown> | null;
  description: string | null;
  photo_url: string | null;
  photos_count: number;
  cf_image_id: string | null;

  // Moat data
  accepted_materials: string[];
  fees: Record<string, string> | null;
  residency_restriction: string | null;
  open_to_public: boolean | null;
  free_for_residents: boolean;
  permit_number: string | null;
  permit_status: string | null;
  operator: string | null;
  capacity_notes: string | null;

  // Moderation
  status: FacilityStatus;
  source: FacilitySource;
  admin_notes: string | null;
  rejection_reason: string | null;
  is_featured: boolean;

  created_at: string;
  updated_at: string;
}

// ─── Supporting Types ────────────────────────────────────────

export interface State {
  id: number;
  name: string;
  abbreviation: string;
  slug: string;
  facility_count: number;
}

export interface City {
  id: number;
  name: string;
  slug: string;
  state_slug: string;
  state_abbr: string;
  county: string | null;
  county_slug: string | null;
  facility_count: number;
  lat: number | null;
  lng: number | null;
}

export interface CountyInfo {
  county: string;
  county_slug: string;
  state_slug: string;
  state_abbr: string;
  city_count: number;
  facility_count: number;
}

// ─── UI helpers ──────────────────────────────────────────────

export interface FacilityCardData {
  id?: number;
  slug: string;
  state_slug: string;
  city_slug: string;
  name: string;
  city: string;
  state_abbr: string;
  google_rating: number | null;
  google_review_count: number | null;
  facility_type: FacilityType;
  secondary_types: string[];
  accepted_materials?: string[];
  free_for_residents?: boolean;
  photo_url: string | null;
  cf_image_id?: string | null;
  distance_miles?: number | null;
}
