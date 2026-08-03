"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { IconMapPin } from "@/components/icons";
import { FacilityCard } from "@/components/FacilityCard";
import { FacilityMapLazy } from "@/components/FacilityMapLazy";
import { TypeFilter } from "@/components/TypeFilter";
import Breadcrumb from "@/components/Breadcrumb";
import type { FacilityType } from "@/types";
import type { MapBounds } from "@/components/FacilityMap";

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "locating" }
  | { status: "error"; message: string };

interface NearbyFacility {
  id: number;
  name: string;
  slug: string;
  city_slug: string;
  state_slug: string;
  city: string;
  state_abbr: string;
  google_rating: number | null;
  google_review_count: number | null;
  facility_type: FacilityType;
  secondary_types: string[];
  photo_url: string | null;
  cf_image_id: string | null;
  free_for_residents?: boolean;
  lat: number;
  lng: number;
  distance_miles: number | null;
}

const SESSION_KEY = "wheretodump_nearme";

function loadCachedState(): { coords: { lat: number; lng: number }; facilities: NearbyFacility[] } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.coords && Array.isArray(parsed.facilities)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveCachedState(coords: { lat: number; lng: number }, facilities: NearbyFacility[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ coords, facilities }));
  } catch { /* ignore */ }
}

function matchesType(facility: NearbyFacility, type: FacilityType): boolean {
  return facility.facility_type === type || (facility.secondary_types ?? []).includes(type);
}

export default function NearMePage() {
  const [locationState, setLocationState] = useState<LocationState>({ status: "idle" });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [facilities, setFacilities] = useState<NearbyFacility[]>([]);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [showSearchButton, setShowSearchButton] = useState(false);
  const [selectedType, setSelectedType] = useState<FacilityType | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const initialSearchDone = useRef(false);
  const initialFetchComplete = useRef(false);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  // Restore the session cache AFTER mount — reading it during render makes
  // the server and client trees differ and fails hydration
  useEffect(() => {
    const cached = loadCachedState();
    if (cached) {
      initialSearchDone.current = true;
      initialFetchComplete.current = true;
      setCoords(cached.coords);
      setFacilities(cached.facilities);
    }
  }, []);

  // Map pin tapped: mark pin + card as selected (until another pin is tapped)
  // and scroll the card into view below the sticky map
  const handlePinClick = useCallback((pin: { id?: number }) => {
    if (pin.id == null) return;
    setSelectedId(pin.id);
    // Defer past Leaflet's marker focus, which scrolls the map into view and
    // would cancel this smooth scroll if they raced
    setTimeout(() => {
      document
        .getElementById(`facility-${pin.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);
  }, []);

  const typeCounts = useMemo(() => {
    const map: Partial<Record<FacilityType, number>> = {};
    for (const facility of facilities) {
      const types = new Set<string>([facility.facility_type, ...(facility.secondary_types ?? [])]);
      for (const t of types) {
        map[t as FacilityType] = (map[t as FacilityType] || 0) + 1;
      }
    }
    return map;
  }, [facilities]);

  const freeCount = facilities.filter((f) => f.free_for_residents).length;

  const filteredFacilities = facilities.filter(
    (f) =>
      (!selectedType || matchesType(f, selectedType)) &&
      (!freeOnly || f.free_for_residents)
  );

  async function fetchFacilitiesInBounds(b: MapBounds) {
    setLocationState({ status: "loading" });
    setShowSearchButton(false);
    const currentCoords = coordsRef.current;
    const params = new URLSearchParams({
      sw_lat: String(b.sw_lat),
      sw_lng: String(b.sw_lng),
      ne_lat: String(b.ne_lat),
      ne_lng: String(b.ne_lng),
      limit: "50",
    });
    if (currentCoords) {
      params.set("user_lat", String(currentCoords.lat));
      params.set("user_lng", String(currentCoords.lng));
    }
    const res = await fetch(`/api/facilities-in-bounds?${params}`);
    const data = await res.json();
    if (data.facilities) {
      setFacilities(data.facilities);
      if (currentCoords) saveCachedState(currentCoords, data.facilities);
    }
    setLocationState({ status: "idle" });
    initialFetchComplete.current = true;
  }

  const handleBoundsChange = useCallback((newBounds: MapBounds) => {
    setBounds(newBounds);
    if (!initialSearchDone.current) {
      initialSearchDone.current = true;
      fetchFacilitiesInBounds(newBounds);
    } else if (initialFetchComplete.current) {
      setShowSearchButton(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setLocationState({ status: "error", message: "Geolocation is not supported by your browser." });
      return;
    }

    setLocationState({ status: "locating" });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCoords({ lat, lng });
        // The map's initial moveend event will trigger the first search
        setLocationState({ status: "idle" });
      },
      (error) => {
        let message = "Unable to get your location.";
        if (error.code === error.PERMISSION_DENIED) {
          message = "Location permission denied. Please enable location access in your browser settings.";
        }
        setLocationState({ status: "error", message });
      },
    );
  }

  const hasResults = coords !== null;

  return (
    <section className="px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Near Me" },
            ]}
          />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
          Waste disposal near you
        </h1>
        <p className="text-text-mid text-lg mb-8 max-w-xl">
          Find the closest landfill, transfer station, recycling center, or e-waste drop-off to your current location.
        </p>

        {/* Location button (show when no coords yet) */}
        {!coords && locationState.status === "idle" && (
          <button
            onClick={handleGetLocation}
            className="bg-accent text-white px-6 py-3 rounded-xl font-semibold text-base hover:bg-accent-light transition-colors"
          >
            Use my location
          </button>
        )}

        {/* Locating spinner */}
        {locationState.status === "locating" && (
          <div className="flex items-center gap-3 text-text-mid">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>Getting your location...</span>
          </div>
        )}

        {/* Error */}
        {locationState.status === "error" && (
          <div className="bg-red-pale border border-red/20 rounded-xl px-5 py-4 mb-6">
            <p className="text-red font-medium mb-2">{locationState.message}</p>
            <button
              onClick={handleGetLocation}
              className="text-sm text-accent font-semibold hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <div className="space-y-6">
            {/* Type filter */}
            {facilities.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <TypeFilter
                  selected={selectedType}
                  onChange={setSelectedType}
                  counts={typeCounts}
                  totalCount={facilities.length}
                />
                {freeCount > 0 && (
                  <button
                    onClick={() => setFreeOnly(!freeOnly)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      freeOnly
                        ? "bg-green text-white border-green"
                        : "bg-green-pale text-green border-green/30 hover:bg-green hover:text-white"
                    }`}
                  >
                    Free for residents
                    <span className="ml-1 opacity-70">{freeCount}</span>
                  </button>
                )}
              </div>
            )}

            {/* Map, pinned below the navbar while the list scrolls */}
            {coords && (
              <div className="sticky top-14 z-30 bg-bg">
                <FacilityMapLazy
                  center={coords}
                  userLocation={coords}
                  pins={filteredFacilities.map((f) => ({
                    id: f.id,
                    lat: f.lat,
                    lng: f.lng,
                    label: f.name,
                  }))}
                  onBoundsChange={handleBoundsChange}
                  onPinClick={handlePinClick}
                  selectedPinId={selectedId}
                  height={380}
                />
                {showSearchButton && (
                  <button
                    onClick={() => bounds && fetchFacilitiesInBounds(bounds)}
                    className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white text-primary px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg border border-border hover:bg-primary-pale transition-colors"
                  >
                    Search this area
                  </button>
                )}
                {locationState.status === "loading" && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white px-5 py-2.5 rounded-full text-sm shadow-lg border border-border flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Searching...
                  </div>
                )}
              </div>
            )}

            {/* Facility results */}
            {filteredFacilities.length > 0 ? (
              <>
                <p className="text-sm text-text-mid">
                  {filteredFacilities.length} facilit{filteredFacilities.length !== 1 ? "ies" : "y"} in this area
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {filteredFacilities.map((facility) => (
                    <div
                      key={facility.id}
                      id={`facility-${facility.id}`}
                      className={`rounded-2xl transition-shadow ${
                        selectedId === facility.id ? "ring-2 ring-accent shadow-md" : ""
                      }`}
                    >
                    <FacilityCard
                      facility={{
                        id: facility.id,
                        slug: facility.slug,
                        state_slug: facility.state_slug,
                        city_slug: facility.city_slug,
                        name: facility.name,
                        city: facility.city,
                        state_abbr: facility.state_abbr,
                        google_rating: facility.google_rating,
                        google_review_count: facility.google_review_count,
                        facility_type: facility.facility_type,
                        secondary_types: facility.secondary_types || [],
                        photo_url: facility.photo_url,
                        cf_image_id: facility.cf_image_id,
                        free_for_residents: facility.free_for_residents,
                        distance_miles: facility.distance_miles,
                      }}
                    />
                    </div>
                  ))}
                </div>
              </>
            ) : locationState.status === "idle" ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center">
                <IconMapPin className="w-10 h-10 text-text-light mx-auto mb-3" />
                <p className="text-text-mid text-lg font-medium mb-2">
                  No facilities found in this area
                </p>
                <p className="text-text-light text-sm max-w-md mx-auto">
                  Try zooming out or panning the map to explore a wider area.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
