import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMapEvents,
  useMap,
  LayersControl,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default Leaflet icon paths in React
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const DEFAULT_WORKSHOPS = [
  {
    id: "colombo_main",
    name: "Colombo Main Workshop",
    address: "Main Service Center, Colombo, Sri Lanka",
    coordinates: [6.9271, 79.8612],
  },
  {
    id: "gampaha_branch",
    name: "Gampaha Service Branch",
    address: "Gampaha Service Center, Gampaha, Sri Lanka",
    coordinates: [7.0873, 80.0144],
  },
  {
    id: "kalutara_branch",
    name: "Kalutara Service Branch",
    address: "Kalutara Service Center, Kalutara, Sri Lanka",
    coordinates: [6.5854, 79.9607],
  },
];

function createWorkshopPinIcon(label, isSelected = false) {
  const borderColor = isSelected ? "#10b981" : "#ea580c";
  const dotColor = isSelected ? "#10b981" : "#ea580c";
  return L.divIcon({
    className: "custom-workshop-pin",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="background:#13294b;color:#ffffff;border:2px solid ${borderColor};border-radius:9999px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.35);display:flex;align-items:center;gap:5px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};"></span>
          <span>${label}</span>
        </div>
        <svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-top:-2px;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.35));">
          <path d="M12 0C5.37 0 0 5.37 0 12C0 20.25 12 30 12 30C12 30 24 20.25 24 12C24 5.37 18.63 0 12 0Z" fill="#13294b"/>
          <circle cx="12" cy="12" r="5.5" fill="${dotColor}" stroke="#ffffff" stroke-width="2"/>
        </svg>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

const pickupPinIcon = L.divIcon({
  className: "custom-pickup-pin",
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
      <div style="background:#ea580c;color:#ffffff;border:2px solid #ffffff;border-radius:9999px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.35);display:flex;align-items:center;gap:5px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ffffff;"></span>
        <span>Pickup Location</span>
      </div>
      <svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-top:-2px;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.35));">
        <path d="M12 0C5.37 0 0 5.37 0 12C0 20.25 12 30 12 30C12 30 24 20.25 24 12C24 5.37 18.63 0 12 0Z" fill="#ea580c"/>
        <circle cx="12" cy="12" r="5.5" fill="#ffffff" stroke="#13294b" stroke-width="2"/>
      </svg>
    </div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

const userLocationPinIcon = L.divIcon({
  className: "custom-user-location-pin",
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);cursor:pointer;">
      <div style="background:#2563eb;color:#ffffff;border:2px solid #ffffff;border-radius:9999px;padding:3px 9px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 4px 10px rgba(37,99,235,0.45);margin-bottom:5px;display:flex;align-items:center;gap:4px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Live Location</span>
      </div>
      <div style="width:24px;height:24px;border-radius:50%;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 0 0 6px rgba(37,99,235,0.28),0 3px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    </div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

function createDriverCarIcon(label = "Driver On The Way", isReturning = false) {
  const bg = isReturning ? "#059669" : "#13294b";
  const ring = isReturning ? "rgba(5,150,105,0.3)" : "rgba(234,88,12,0.32)";
  return L.divIcon({
    className: "custom-driver-car-pin",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="background:${bg};color:#ffffff;border:2px solid #ffffff;border-radius:9999px;padding:3px 10px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.35);margin-bottom:4px;">
          ${label}
        </div>
        <div style="width:32px;height:32px;border-radius:50%;background:${bg};border:2.5px solid #ffffff;box-shadow:0 0 0 6px ${ring},0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 17h14v-5l-2-5H7l-2 5v5z"></path>
            <circle cx="7.5" cy="17.5" r="1.5" fill="#ffffff"></circle>
            <circle cx="16.5" cy="17.5" r="1.5" fill="#ffffff"></circle>
          </svg>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function getDistanceSq(c1, c2) {
  const dLat = c1[0] - c2[0];
  const dLng = c1[1] - c2[1];
  return dLat * dLat + dLng * dLng;
}

function getNearestWorkshop(point, workshopList) {
  if (!workshopList || workshopList.length === 0) return null;
  let nearest = workshopList[0];
  let minD = getDistanceSq(point, nearest.coordinates);
  for (let i = 1; i < workshopList.length; i += 1) {
    const d = getDistanceSq(point, workshopList[i].coordinates);
    if (d < minD) {
      minD = d;
      nearest = workshopList[i];
    }
  }
  return nearest;
}

function MapClickHandler({ setStartPoint, setEndPoint, mode, workshopList }) {
  useMapEvents({
    click(e) {
      if (mode === "shop-location") return;
      const clicked = [e.latlng.lat, e.latlng.lng];
      setStartPoint(clicked);
      if (workshopList && workshopList.length > 0) {
        const nearest = getNearestWorkshop(clicked, workshopList);
        if (nearest) {
          setEndPoint(nearest.coordinates);
        }
      }
    },
  });
  return null;
}

function MapUpdater({ routePath, center }) {
  const map = useMap();
  const centerLat = center ? center[0] : null;
  const centerLng = center ? center[1] : null;

  useEffect(() => {
    if (centerLat !== null && centerLng !== null) {
      map.flyTo([centerLat, centerLng], 12);
    }
  }, [centerLat, centerLng, map]);

  useEffect(() => {
    if (routePath.length > 1) {
      map.fitBounds(L.latLngBounds(routePath), { padding: [55, 55] });
    }
  }, [routePath, map]);

  return null;
}

export function SmartMap({
  mode = "routing",
  theme = "light",
  shopCoords = [6.9271, 79.8612],
  workshops,
  osrmUrl,
  onOrderReady,
  center = [6.9271, 79.8612],
  userLocation = null,
  externalStartPoint = null,
  driverTracking = null,
  readOnlyRoute = false,
  showZoomControls = true,
  interactiveMap = true,
  showSearchBox = true,
  customMarkerUrl,
  className = "",
  resetTrigger,
}) {
  const workshopList =
    workshops && workshops.length > 0 ? workshops : DEFAULT_WORKSHOPS;
  const activeCenter =
    mode === "shop-location" && shopCoords ? shopCoords : center;

  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(
    workshopList[0]?.coordinates || shopCoords,
  );
  const [routePath, setRoutePath] = useState([]);
  const [driverStepProgress, setDriverStepProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [detectedLiveCoords, setDetectedLiveCoords] = useState(null);
  const [mapCenter, setMapCenter] = useState(activeCenter);

  // Sync resetTrigger prop changes without setState-in-effect
  const [prevResetTrigger, setPrevResetTrigger] = useState(resetTrigger);
  if (resetTrigger !== prevResetTrigger) {
    setPrevResetTrigger(resetTrigger);
    if (resetTrigger) {
      setStartPoint(null);
      setEndPoint(workshopList[0]?.coordinates || shopCoords);
      setRoutePath([]);
      setErrorMessage(null);
      setSearchQuery("");
      setSearchResults([]);
    }
  }

  // Sync externalStartPoint prop changes without setState-in-effect
  const extLat = Array.isArray(externalStartPoint)
    ? externalStartPoint[0]
    : null;
  const extLng = Array.isArray(externalStartPoint)
    ? externalStartPoint[1]
    : null;
  const extKey =
    extLat !== null && extLng !== null ? `${extLat},${extLng}` : null;
  const [prevExtKey, setPrevExtKey] = useState(extKey);
  if (extKey !== prevExtKey) {
    setPrevExtKey(extKey);
    if (extLat !== null && extLng !== null) {
      const coords = [extLat, extLng];
      setMapCenter(coords);
      setStartPoint(coords);
      const nearest = getNearestWorkshop(coords, workshopList);
      if (nearest) {
        setEndPoint(nearest.coordinates);
      }
    }
  }

  // Sync activeCenter prop changes without setState-in-effect
  const activeLat = activeCenter[0];
  const activeLng = activeCenter[1];
  const centerKey = `${activeLat},${activeLng}`;
  const [prevCenterKey, setPrevCenterKey] = useState(centerKey);
  if (centerKey !== prevCenterKey) {
    setPrevCenterKey(centerKey);
    setMapCenter([activeLat, activeLng]);
  }

  // Detect live user geolocation (with IP & Colombo fallback)
  useEffect(() => {
    let isMounted = true;

    const applyLiveCoords = (lat, lng) => {
      if (!isMounted) return;
      const coords = [Number(lat), Number(lng)];
      setDetectedLiveCoords((prev) => {
        if (!prev) {
          setMapCenter(coords);
        }
        return coords;
      });
    };

    const fallbackIpLocation = async () => {
      try {
        const res = await fetch("https://get.geojs.io/v1/ip/geo.json");
        const data = await res.json();
        if (data && data.latitude && data.longitude) {
          applyLiveCoords(
            parseFloat(data.latitude),
            parseFloat(data.longitude),
          );
          return;
        }
      } catch {
        // Ignore network error
      }
      applyLiveCoords(6.9061, 79.8684);
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyLiveCoords(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          fallbackIpLocation();
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
      );
    } else {
      fallbackIpLocation();
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const activeUserLocation =
    Array.isArray(userLocation) && userLocation.length === 2
      ? userLocation
      : detectedLiveCoords;

  const mapIcon = customMarkerUrl
    ? L.icon({
        iconUrl: customMarkerUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      })
    : defaultIcon;

  // Fetch route from OSRM when startPoint and endPoint are selected
  useEffect(() => {
    if (
      mode === "shop-location" ||
      mode === "location-only" ||
      !startPoint ||
      !endPoint
    ) {
      return undefined;
    }

    let isMounted = true;
    const controller = new AbortController();

    const fetchRoute = async () => {
      setErrorMessage(null);

      const [lat, lng] = startPoint;
      const isInsideWesternProvince =
        lat >= 6.4 && lat <= 7.35 && lng >= 79.8 && lng <= 80.3;
      if (!isInsideWesternProvince) {
        if (!isMounted) return;
        setRoutePath([]);
        setErrorMessage(
          "⚠️ Service is not available in this area yet. Pickup & delivery is currently available only within the Western Province (Colombo, Gampaha, Kalutara).",
        );
        if (onOrderReady) {
          onOrderReady({
            startCoords: startPoint,
            endCoords: endPoint,
            outOfZone: true,
          });
        }
        return;
      }

      setIsCalculating(true);
      try {
        const activeOsrmUrl =
          osrmUrl || "https://router.project-osrm.org/route/v1/driving";
        const fetchUrl = `${activeOsrmUrl}/${startPoint[1]},${startPoint[0]};${endPoint[1]},${endPoint[0]}?overview=full&geometries=geojson`;
        const response = await fetch(fetchUrl, { signal: controller.signal });
        const osrmData = await response.json();
        if (!isMounted) return;

        if (osrmData.code !== "Ok" || !osrmData.routes?.[0]) {
          setErrorMessage("Failed to fetch route.");
          return;
        }

        setRoutePath(
          osrmData.routes[0].geometry.coordinates.map((coord) => [
            coord[1],
            coord[0],
          ]),
        );

        if (onOrderReady) {
          const nearestWorkshop = getNearestWorkshop(startPoint, workshopList);
          onOrderReady({
            startCoords: startPoint,
            endCoords: endPoint,
            workshop: nearestWorkshop,
          });
        }
      } catch (err) {
        if (isMounted && err.name !== "AbortError") {
          setErrorMessage("Could not connect to the routing server.");
        }
      } finally {
        if (isMounted) {
          setIsCalculating(false);
        }
      }
    };

    fetchRoute();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [startPoint, endPoint, mode, osrmUrl, onOrderReady, workshopList]);

  // Nominatim search autocomplete (500ms debounce)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      return undefined;
    }

    let isMounted = true;
    const controller = new AbortController();

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      setErrorMessage(null);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=5`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (isMounted) {
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch {
        // Ignore abort or search error
      } finally {
        if (isMounted) {
          setIsSearching(false);
        }
      }
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(delayDebounceFn);
      controller.abort();
    };
  }, [searchQuery]);

  const displayedRoutePath =
    mode === "shop-location" ||
    mode === "location-only" ||
    !startPoint ||
    !endPoint
      ? []
      : routePath;

  const isDriverMoving = Boolean(
    driverTracking?.active && displayedRoutePath.length > 1,
  );

  // Smoothly animate driver vehicle marker along the OSRM route when active
  useEffect(() => {
    if (!isDriverMoving) return undefined;

    const timer = window.setInterval(() => {
      setDriverStepProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 350);

    return () => window.clearInterval(timer);
  }, [isDriverMoving]);

  const activeDriverMarkerPos = (() => {
    if (!driverTracking?.active) return null;
    if (displayedRoutePath.length > 1) {
      const ratio = driverStepProgress / 100;
      const forwardIdx = Math.min(
        displayedRoutePath.length - 1,
        Math.floor(ratio * (displayedRoutePath.length - 1)),
      );
      const isToCustomer =
        driverTracking.direction === "to-customer" ||
        driverTracking.direction === "returning";
      const idx = isToCustomer
        ? displayedRoutePath.length - 1 - forwardIdx
        : forwardIdx;
      return displayedRoutePath[idx];
    }
    if (
      Array.isArray(driverTracking.coords) &&
      driverTracking.coords.length === 2
    ) {
      return driverTracking.coords;
    }
    return null;
  })();

  const displayedSearchResults =
    searchQuery.trim().length < 3 ? [] : searchResults;

  const isUsingDemoServer =
    mode !== "shop-location" && mode !== "location-only" && !osrmUrl;

  const handleSelectLocation = (lat, lon) => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const selectedCoords = [latNum, lonNum];
    setMapCenter(selectedCoords);
    setStartPoint(selectedCoords);
    const nearest = getNearestWorkshop(selectedCoords, workshopList);
    if (nearest) {
      setEndPoint(nearest.coordinates);
    }
    setSearchResults([]);
    setSearchQuery("");
  };

  return (
    <div
      className={`smart-map-container ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        fontFamily: "sans-serif",
        maxWidth: "800px",
        margin: "0 auto",
        position: "relative",
      }}
    >
      {isUsingDemoServer && (
        <div
          style={{
            padding: "12px 16px",
            background: "#fffbeb",
            color: "#b45309",
            borderRadius: "8px",
            border: "1px solid #fde68a",
          }}
        >
          ⚠️ Warning: Using public OSRM demo server. Not for commercial
          production.
        </div>
      )}

      {showSearchBox && (
        <div style={{ position: "relative", zIndex: 10 }}>
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              padding: "10px 15px",
              background: "#fff",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <input
              type="text"
              placeholder="Search pickup location (Type at least 3 characters)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
              }}
            />
            {isSearching && (
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "#9ca3af",
                  animation: "pulse 1s infinite",
                }}
              >
                Searching...
              </span>
            )}
          </div>

          {displayedSearchResults.length > 0 && (
            <ul
              style={{
                position: "absolute",
                width: "100%",
                top: "110%",
                left: 0,
                background: "#fff",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                padding: 0,
                margin: 0,
                listStyle: "none",
              }}
            >
              {displayedSearchResults.map((result) => (
                <li
                  key={result.place_id}
                  onClick={() => handleSelectLocation(result.lat, result.lon)}
                  style={{
                    padding: "10px 15px",
                    borderBottom: "1px solid #f3f4f6",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                  }}
                >
                  {result.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        style={{
          height: "450px",
          width: "100%",
          borderRadius: "12px",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        <MapContainer
          center={mapCenter}
          zoom={10}
          style={{ height: "100%", width: "100%" }}
          zoomControl={showZoomControls}
          dragging={interactiveMap}
          scrollWheelZoom={interactiveMap}
          doubleClickZoom={interactiveMap}
          touchZoom={interactiveMap}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer
              checked={theme === "light"}
              name="Standard Map"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer
              checked={theme === "dark"}
              name="Dark Mode"
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer
              checked={theme === "satellite"}
              name="Satellite Imagery"
            >
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
              />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer
              checked={theme === "terrain"}
              name="Terrain Map"
            >
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community"
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          {workshopList.map((ws) => {
            const isNearestSelected =
              startPoint &&
              endPoint &&
              ws.coordinates[0] === endPoint[0] &&
              ws.coordinates[1] === endPoint[1];
            return (
              <Marker
                key={ws.id || ws.name}
                position={ws.coordinates}
                icon={createWorkshopPinIcon(ws.name, isNearestSelected)}
              >
                <Popup>
                  {ws.name} — {ws.address}
                </Popup>
              </Marker>
            );
          })}

          {mode === "shop-location" && shopCoords && (
            <Marker position={shopCoords} icon={mapIcon} />
          )}

          {mode !== "shop-location" && (
            <>
              {!readOnlyRoute && (
                <MapClickHandler
                  setStartPoint={setStartPoint}
                  setEndPoint={setEndPoint}
                  mode={mode}
                  workshopList={workshopList}
                />
              )}

              {Array.isArray(activeUserLocation) &&
                activeUserLocation.length === 2 && (
                  <Marker
                    position={activeUserLocation}
                    icon={userLocationPinIcon}
                    zIndexOffset={1000}
                    eventHandlers={
                      readOnlyRoute
                        ? undefined
                        : {
                            click: () => {
                              setStartPoint(activeUserLocation);
                              const nearest = getNearestWorkshop(
                                activeUserLocation,
                                workshopList,
                              );
                              if (nearest) {
                                setEndPoint(nearest.coordinates);
                              }
                            },
                          }
                    }
                  >
                    <Popup>
                      {readOnlyRoute
                        ? "Your Location"
                        : "Your Live Location (Click to select as pickup)"}
                    </Popup>
                  </Marker>
                )}

              {startPoint && (
                <Marker position={startPoint} icon={pickupPinIcon}>
                  <Popup>Customer Pickup / Return Location</Popup>
                </Marker>
              )}

              {displayedRoutePath.length > 0 && (
                <Polyline
                  positions={displayedRoutePath}
                  color={
                    driverTracking?.direction === "returning"
                      ? "#059669"
                      : "#ea580c"
                  }
                  weight={5}
                  opacity={0.85}
                />
              )}

              {activeDriverMarkerPos && (
                <Marker
                  position={activeDriverMarkerPos}
                  icon={createDriverCarIcon(
                    driverTracking?.label || "Driver On The Way",
                    driverTracking?.direction === "returning",
                  )}
                  zIndexOffset={1500}
                >
                  <Popup>
                    <strong>{driverTracking?.driverName || "Driver"}</strong>
                    {driverTracking?.label ? ` — ${driverTracking.label}` : ""}
                  </Popup>
                </Marker>
              )}
            </>
          )}

          <MapUpdater routePath={displayedRoutePath} center={mapCenter} />
        </MapContainer>
      </div>

      {errorMessage && (
        <div style={{ color: "#991b1b", fontSize: "0.85rem" }}>
          {errorMessage}
        </div>
      )}
      {isCalculating && (
        <div style={{ color: "#ea580c", fontSize: "0.85rem" }}>
          Calculating route to nearest Workshop...
        </div>
      )}
    </div>
  );
}

export default SmartMap;
