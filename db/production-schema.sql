DROP TABLE IF EXISTS states;
DROP TABLE IF EXISTS counties;
DROP TABLE IF EXISTS cities;
DROP TABLE IF EXISTS facilities;
DROP TABLE IF EXISTS submissions;
CREATE TABLE states (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  abbr TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);
CREATE TABLE counties (
  id INTEGER PRIMARY KEY,
  state_id INTEGER NOT NULL REFERENCES states(id),
  name TEXT NOT NULL,              
  slug TEXT NOT NULL,              
  UNIQUE(state_id, slug)
);
CREATE TABLE cities (
  id INTEGER PRIMARY KEY,
  state_id INTEGER NOT NULL REFERENCES states(id),
  county_id INTEGER REFERENCES counties(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE(state_id, slug)
);
CREATE TABLE facilities (
  id INTEGER PRIMARY KEY,
  place_id TEXT UNIQUE,            

  
  state_slug TEXT NOT NULL,
  city_slug TEXT NOT NULL,
  slug TEXT NOT NULL,

  
  state_id INTEGER NOT NULL REFERENCES states(id),
  county_id INTEGER REFERENCES counties(id),
  city_id INTEGER REFERENCES cities(id),

  
  name TEXT NOT NULL,
  facility_type TEXT NOT NULL DEFAULT 'unknown',
    
    
  secondary_types TEXT NOT NULL DEFAULT '[]',   
  service_only INTEGER NOT NULL DEFAULT 0,      

  
  street TEXT,
  city TEXT,
  state TEXT NOT NULL,
  state_abbr TEXT NOT NULL,
  zip TEXT,
  county TEXT,
  lat REAL,
  lng REAL,
  time_zone TEXT,

  
  phone TEXT,
  website TEXT,
  google_maps_url TEXT,

  
  google_rating REAL,
  google_review_count INTEGER NOT NULL DEFAULT 0,
  google_business_status TEXT,
  google_primary_type TEXT,
  google_types TEXT NOT NULL DEFAULT '[]',      
  google_hours TEXT,                            
  about TEXT,                                   
  description TEXT,
  photo_url TEXT,
  photos_count INTEGER NOT NULL DEFAULT 0,
  cf_image_id TEXT,

  
  accepted_materials TEXT NOT NULL DEFAULT '[]',
  fees TEXT,                                    
  residency_restriction TEXT,                   
  open_to_public INTEGER,                       
  permit_number TEXT,
  permit_status TEXT,
  operator TEXT,
  capacity_notes TEXT,

  
  status TEXT NOT NULL DEFAULT 'imported',      
  source TEXT NOT NULL DEFAULT 'outscraper',
  source_queries TEXT NOT NULL DEFAULT '[]',    
  admin_notes TEXT,
  rejection_reason TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), review_score INTEGER, review_reasons TEXT NOT NULL DEFAULT '[]', enrich_source_url TEXT, enrich_scraped_at TEXT,

  UNIQUE(state_slug, city_slug, slug)
);
CREATE INDEX idx_facilities_state ON facilities(state_slug, status);
CREATE INDEX idx_facilities_county ON facilities(county_id, status);
CREATE INDEX idx_facilities_city ON facilities(city_id, status);
CREATE INDEX idx_facilities_type ON facilities(facility_type, state_slug, status);
CREATE INDEX idx_facilities_geo ON facilities(lat, lng);
CREATE INDEX idx_cities_county ON cities(county_id);
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  payload TEXT NOT NULL,           
  status TEXT NOT NULL DEFAULT 'pending',  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  admin_notes TEXT
);
