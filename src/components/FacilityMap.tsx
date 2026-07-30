"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapPin {
  id?: number;
  lat: number;
  lng: number;
  label?: string;
  href?: string;
}

export interface MapBounds {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
}

interface Props {
  center: { lat: number; lng: number };
  pins?: MapPin[];
  userLocation?: { lat: number; lng: number };
  zoom?: number;
  radiusMiles?: number;
  height?: number;
  className?: string;
  onBoundsChange?: (bounds: MapBounds) => void;
  /** When set, clicking a pin calls this instead of opening a popup. */
  onPinClick?: (pin: MapPin) => void;
  /** Pin to render in the selected style, with a permanent name label. */
  selectedPinId?: number | null;
}

// Custom marker icon using our accent color; the selected pin stays orange
// but grows and gets a soft glow halo so it reads as "this one"
function createFacilityIcon(selected = false) {
  const size = selected ? 36 : 28;
  const shadow = selected
    ? "0 0 0 6px rgba(255,107,26,0.30), 0 2px 8px rgba(0,0,0,0.35)"
    : "0 2px 6px rgba(0,0,0,0.3)";
  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: #FF6B1A;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: ${shadow};
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
  });
}

function createUserIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 16px; height: 16px;
      background: #E07A3A;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Convert miles to approximate zoom level
function radiusToZoom(miles: number): number {
  if (miles <= 5) return 12;
  if (miles <= 10) return 11;
  if (miles <= 25) return 9;
  if (miles <= 50) return 8;
  if (miles <= 100) return 7;
  return 6;
}

export function FacilityMap({
  center,
  pins = [],
  userLocation,
  zoom,
  radiusMiles,
  height = 320,
  className = "",
  onBoundsChange,
  onPinClick,
  selectedPinId = null,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onPinClickRef = useRef(onPinClick);

  // Keep callback refs in sync without re-creating the map
  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
    onPinClickRef.current = onPinClick;
  }, [onBoundsChange, onPinClick]);

  // Initialize map (once per center/zoom change)
  useEffect(() => {
    if (!mapRef.current) return;

    // Clean up previous instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markersRef.current = null;
    }

    const interactive = !!onBoundsChangeRef.current;
    const effectiveZoom = zoom ?? (radiusMiles ? radiusToZoom(radiusMiles) : interactive ? 10 : 13);

    const map = L.map(mapRef.current, {
      scrollWheelZoom: interactive,
    }).setView([center.lat, center.lng], effectiveZoom);

    mapInstanceRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);

    // CartoDB Voyager — clean, modern tile style (free, no API key)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    // User location marker (added directly to map, not the markers layer)
    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lng], { icon: createUserIcon() })
        .addTo(map)
        .bindPopup("You are here");
    }

    // Bounds change listener for interactive mode
    if (interactive) {
      const emitBounds = () => {
        const b = map.getBounds();
        onBoundsChangeRef.current?.({
          sw_lat: b.getSouthWest().lat,
          sw_lng: b.getSouthWest().lng,
          ne_lat: b.getNorthEast().lat,
          ne_lng: b.getNorthEast().lng,
        });
      };

      map.on("moveend", emitBounds);

      // setView fires moveend before the listener is registered,
      // so emit the initial bounds manually after setup
      map.whenReady(emitBounds);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = null;
    };
    // Only re-create map when center or zoom-related props change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, zoom, radiusMiles]);

  // Update markers without rebuilding the map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;

    markers.clearLayers();

    const facilityIcon = createFacilityIcon();
    const selectedIcon = createFacilityIcon(true);
    for (const pin of pins) {
      const isSelected = pin.id != null && pin.id === selectedPinId;
      const marker = L.marker([pin.lat, pin.lng], {
        icon: isSelected ? selectedIcon : facilityIcon,
        zIndexOffset: isSelected ? 1000 : 0,
      });
      if (isSelected && pin.label) {
        marker.bindTooltip(pin.label, {
          permanent: true,
          direction: "top",
          offset: [0, -24],
          className: "facility-map-tooltip",
        });
      }
      if (onPinClickRef.current) {
        marker.on("click", () => onPinClickRef.current?.(pin));
      } else if (pin.label) {
        marker.bindPopup(
          pin.href
            ? `<a href="${pin.href}" style="font-weight:600; color:#1B1C1E; text-decoration:none;">${pin.label}</a>`
            : pin.label
        );
      }
      markers.addLayer(marker);
    }

    // Fit bounds when NOT in interactive mode (detail/city pages)
    if (!onBoundsChangeRef.current && pins.length > 0) {
      const allPoints: [number, number][] = pins.map((p) => [p.lat, p.lng]);
      if (userLocation) {
        allPoints.push([userLocation.lat, userLocation.lng]);
      }
      if (allPoints.length > 1) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40], maxZoom: 13 });
      }
    }

    // If single pin (detail page), just center on it
    if (pins.length === 0 && !userLocation) {
      const facilityIcon = createFacilityIcon();
      L.marker([map.getCenter().lat, map.getCenter().lng], { icon: facilityIcon }).addTo(map);
    }
  }, [pins, userLocation, selectedPinId]);

  return (
    <div
      ref={mapRef}
      className={`rounded-xl border border-border ${className}`}
      style={{ height, width: "100%" }}
    />
  );
}
