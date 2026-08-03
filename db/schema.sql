-- Where To Dump — D1 (SQLite) schema
-- Apply locally:  npx wrangler d1 execute wheretodump-db --local --file=db/schema.sql
-- Apply remote:   npx wrangler d1 execute wheretodump-db --remote --file=db/schema.sql
--
-- Conventions carried from the sister sites: denormalized slug triple on
-- facilities with a uniqueness constraint (URL lookups need no joins), and
-- moderation columns compatible with the admin review flow. JSON lives in TEXT
-- columns (SQLite); parse at the query layer.

CREATE TABLE IF NOT EXISTS states (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  abbr TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS counties (
  id INTEGER PRIMARY KEY,
  state_id INTEGER NOT NULL REFERENCES states(id),
  name TEXT NOT NULL,              -- "Marion County"
  slug TEXT NOT NULL,              -- "marion-county"
  UNIQUE(state_id, slug)
);

CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY,
  state_id INTEGER NOT NULL REFERENCES states(id),
  county_id INTEGER REFERENCES counties(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE(state_id, slug)
);

CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY,
  place_id TEXT UNIQUE,            -- Google place_id (null for manual adds)

  -- Slugs (denormalized for URL lookups)
  state_slug TEXT NOT NULL,
  city_slug TEXT NOT NULL,
  slug TEXT NOT NULL,

  -- Relations
  state_id INTEGER NOT NULL REFERENCES states(id),
  county_id INTEGER REFERENCES counties(id),
  city_id INTEGER REFERENCES cities(id),

  -- Core
  name TEXT NOT NULL,
  facility_type TEXT NOT NULL DEFAULT 'unknown',
    -- landfill | transfer_station | recycling_center | e_waste | scrap_metal
    -- | rv_dump | hazardous_waste | unknown
  secondary_types TEXT NOT NULL DEFAULT '[]',   -- JSON: extra categories
  service_only INTEGER NOT NULL DEFAULT 0,      -- hauler/rental flag from ingest

  -- Location
  street TEXT,
  city TEXT,
  state TEXT NOT NULL,
  state_abbr TEXT NOT NULL,
  zip TEXT,
  county TEXT,
  lat REAL,
  lng REAL,
  time_zone TEXT,

  -- Contact
  phone TEXT,
  website TEXT,
  google_maps_url TEXT,

  -- Google data
  google_rating REAL,
  google_review_count INTEGER NOT NULL DEFAULT 0,
  google_business_status TEXT,
  google_primary_type TEXT,
  google_types TEXT NOT NULL DEFAULT '[]',      -- JSON: raw subtypes list
  google_hours TEXT,                            -- JSON: working_hours object
  about TEXT,                                   -- JSON: Google "about" attributes
  description TEXT,
  photo_url TEXT,
  photos_count INTEGER NOT NULL DEFAULT 0,
  cf_image_id TEXT,

  -- Moat data (populated by enrichment, not Outscraper)
  accepted_materials TEXT NOT NULL DEFAULT '[]',-- JSON: ["household","yard","e_waste",...]
  fees TEXT,                                    -- JSON: {"car_load": "...", "per_ton": ...}
  residency_restriction TEXT,                   -- e.g. "Marion County residents only"
  open_to_public INTEGER,                       -- null = unverified, 0/1 = verified
  permit_number TEXT,
  permit_status TEXT,
  operator TEXT,
  capacity_notes TEXT,
  enrich_source_url TEXT,                       -- page the fees/materials came from
  enrich_scraped_at TEXT,
  free_for_residents INTEGER,                   -- 1 = evidence of free resident drop-off (derive-free.ts)

  -- Moderation (manual-only; scripts never set approved/rejected)
  status TEXT NOT NULL DEFAULT 'imported',      -- imported|pending|approved|rejected
  review_score INTEGER,                         -- 0-100 confidence from scripts/review/score-facilities.ts
  review_reasons TEXT NOT NULL DEFAULT '[]',    -- JSON: which scoring rules fired
  source TEXT NOT NULL DEFAULT 'outscraper',
  source_queries TEXT NOT NULL DEFAULT '[]',    -- JSON
  admin_notes TEXT,
  rejection_reason TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(state_slug, city_slug, slug)
);

CREATE INDEX IF NOT EXISTS idx_facilities_state ON facilities(state_slug, status);
CREATE INDEX IF NOT EXISTS idx_facilities_county ON facilities(county_id, status);
CREATE INDEX IF NOT EXISTS idx_facilities_city ON facilities(city_id, status);
CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(facility_type, state_slug, status);
CREATE INDEX IF NOT EXISTS idx_facilities_geo ON facilities(lat, lng);
CREATE INDEX IF NOT EXISTS idx_cities_county ON cities(county_id);

-- User submissions land here (not in facilities) until manually promoted.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  payload TEXT NOT NULL,           -- JSON: whatever the /submit form sent
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|accepted|rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  admin_notes TEXT
);
