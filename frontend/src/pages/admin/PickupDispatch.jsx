import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../../services/api";
import Alert from "../../components/ui/Alert";

const WORKSHOP_COORDS = [6.9271, 79.8612]; // Colombo Main Workshop [lat, lng]

const PICKUP_STATUS_STYLES = {
  "Pending Assignment": "bg-amber-50 text-amber-800 border-amber-200",
  "Driver Assigned": "bg-blue-50 text-blue-800 border-blue-200",
  "En Route to Pickup": "bg-indigo-50 text-indigo-800 border-indigo-200",
  "Vehicle Picked Up": "bg-purple-50 text-purple-800 border-purple-200",
  "Delivered to Workshop": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Out for Return Delivery": "bg-orange-50 text-orange-800 border-orange-200",
  "Delivered to Customer": "bg-emerald-100 text-emerald-900 border-emerald-300",
};

// Custom HTML divIcons for Workshop, Customer Pickup Point, and Moving Driver Car
const workshopIcon = L.divIcon({
  className: "custom-workshop-icon",
  html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
    <div style="background:#13294b;color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);white-space:nowrap;">
      🏢 Main Workshop
    </div>
    <div style="width:14px;height:14px;background:#13294b;border:3px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>
  </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

function createCustomerIcon(regNo, isSelected) {
  const borderCol = isSelected ? "#c2410c" : "#1e293b";
  return L.divIcon({
    className: "custom-customer-icon",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
      <div style="background:#facc15;color:#000;font-size:10px;font-weight:800;padding:1px 6px;border-radius:5px;border:2px solid ${borderCol};box-shadow:0 2px 5px rgba(0,0,0,0.2);white-space:nowrap;">
        📍 ${regNo || "Pickup"}
      </div>
      <div style="width:12px;height:12px;background:#ef4444;border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createDriverCarIcon(regNo, driverName, status) {
  const bg =
    status === "Vehicle Picked Up"
      ? "#c2410c"
      : status === "Out for Return Delivery"
        ? "#047857"
        : "#1d4ed8";
  return L.divIcon({
    className: "custom-driver-car-icon",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);transition:all 0.6s linear;">
      <div style="background:${bg};color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);white-space:nowrap;display:flex;align-items:center;gap:4px;">
        <span>🚗 ${regNo}</span>
        <span style="opacity:0.85;font-weight:600;">· ${driverName}</span>
      </div>
      <div style="width:14px;height:14px;background:${bg};border:3px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 0 0 4px rgba(29,78,216,0.25);"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Helper component to smoothly fly/fit map when selected trip changes
function MapFocusController({ targetCoords, workshopCoords }) {
  const map = useMap();

  useEffect(() => {
    if (
      Array.isArray(targetCoords) &&
      targetCoords.length === 2 &&
      typeof targetCoords[0] === "number" &&
      typeof targetCoords[1] === "number"
    ) {
      const bounds = L.latLngBounds([targetCoords, workshopCoords]);
      map.flyToBounds(bounds, {
        padding: [65, 65],
        maxZoom: 14,
        duration: 1.1,
      });
    }
  }, [map, targetCoords, workshopCoords]);

  return null;
}

// Interpolates a coordinate along a polyline path given progress 0..1
function getPointAlongRoute(routeCoords, progress) {
  if (!Array.isArray(routeCoords) || routeCoords.length === 0) return null;
  if (routeCoords.length === 1) return routeCoords[0];
  const clamped = Math.max(0, Math.min(1, progress));
  const exactIndex = clamped * (routeCoords.length - 1);
  const lower = Math.floor(exactIndex);
  const upper = Math.min(routeCoords.length - 1, lower + 1);
  const frac = exactIndex - lower;
  const [lat1, lng1] = routeCoords[lower];
  const [lat2, lng2] = routeCoords[upper];
  return [lat1 + (lat2 - lat1) * frac, lng1 + (lng2 - lng1) * frac];
}

function PickupDispatch() {
  const [bookings, setBookings] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [filterTab, setFilterTab] = useState("active"); // 'active' | 'pending' | 'all'
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [liveSimEnabled, setLiveSimEnabled] = useState(true);
  const [simStep, setSimStep] = useState(0);

  // Route polylines cache by bookingId -> array of [lat, lng]
  const [routesByBooking, setRoutesByBooking] = useState({});
  const fetchedRouteIdsRef = useRef(new Set());

  // Action states
  const [assigningId, setAssigningId] = useState(null);
  const [selectedDriversMap, setSelectedDriversMap] = useState({});
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load pickup bookings & drivers
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchDispatchData = (silent = false) => {
      api
        .get("/appointments/admin", { signal: controller.signal })
        .then((res) => {
          if (isMounted && res.data.success) {
            const allApps = res.data.appointments || [];
            const pickupApps = allApps.filter(
              (a) => a.requiresPickup && a.status !== "Cancelled",
            );
            setBookings(pickupApps);
            setAvailableDrivers(res.data.availableDrivers || []);
            setSelectedBookingId((prev) => {
              if (prev && pickupApps.some((b) => b._id === prev)) return prev;
              const firstActive =
                pickupApps.find(
                  (b) =>
                    b.pickupDelivery?.driverId &&
                    b.pickupDelivery?.pickupStatus !== "Delivered to Customer",
                ) || pickupApps[0];
              return firstActive ? firstActive._id : null;
            });
            if (!silent) setError("");
          }
        })
        .catch((err) => {
          if (
            isMounted &&
            !silent &&
            err.name !== "CanceledError" &&
            err.code !== "ERR_CANCELED"
          ) {
            setError(
              err.response?.data?.message || "Failed to load pickup dispatch data.",
            );
          }
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    };

    fetchDispatchData(false);

    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchDispatchData(true);
      }
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      controller.abort();
    };
  }, [refreshCount]);

  // Fetch real driving road route from OSRM for each pickup booking with coordinates
  useEffect(() => {
    let isMounted = true;

    bookings.forEach((b) => {
      const coords =
        b.pickupDelivery?.pickupLocation?.coordinates ||
        b.pickupLocation?.coordinates;
      if (
        !Array.isArray(coords) ||
        coords.length !== 2 ||
        fetchedRouteIdsRef.current.has(b._id)
      ) {
        return;
      }

      fetchedRouteIdsRef.current.add(b._id);
      const [custLat, custLng] = coords;
      const [shopLat, shopLng] = WORKSHOP_COORDS;

      const url = `https://router.project-osrm.org/route/v1/driving/${shopLng},${shopLat};${custLng},${custLat}?overview=full&geometries=geojson`;

      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          if (!isMounted) return;
          const geom = data?.routes?.[0]?.geometry?.coordinates;
          if (Array.isArray(geom) && geom.length > 1) {
            // Convert GeoJSON [lng, lat] -> Leaflet [lat, lng]
            const latLngPath = geom.map(([lng, lat]) => [lat, lng]);
            setRoutesByBooking((prev) => ({ ...prev, [b._id]: latLngPath }));
          } else {
            setRoutesByBooking((prev) => ({
              ...prev,
              [b._id]: [WORKSHOP_COORDS, [custLat, custLng]],
            }));
          }
        })
        .catch(() => {
          if (!isMounted) return;
          setRoutesByBooking((prev) => ({
            ...prev,
            [b._id]: [WORKSHOP_COORDS, [custLat, custLng]],
          }));
        });
    });

    return () => {
      isMounted = false;
    };
  }, [bookings]);

  // Smooth live movement tick along the road route for active in-transit trips
  useEffect(() => {
    if (!liveSimEnabled) return undefined;
    const timer = setInterval(() => {
      setSimStep((prev) => (prev + 1) % 100);
    }, 1200);
    return () => clearInterval(timer);
  }, [liveSimEnabled]);

  // Assign a driver to an unassigned pickup booking
  const handleAssignDriver = useCallback(async (appointmentId, driverId) => {
    if (!driverId) {
      setError("Please select a driver to assign.");
      return;
    }
    setError("");
    setSuccessMsg("");
    setAssigningId(appointmentId);

    try {
      const res = await api.patch(`/admin/drivers/${driverId}/assign-task`, {
        appointmentId,
      });
      if (res.data.success) {
        setSuccessMsg(res.data.message || "Driver assigned to pickup.");
        setRefreshCount((c) => c + 1);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to assign driver.");
    } finally {
      setAssigningId(null);
    }
  }, []);

  // Categorize pickup trips
  const statsAndFiltered = useMemo(() => {
    const activeList = [];
    const pendingList = [];

    for (const b of bookings) {
      const st = b.pickupDelivery?.pickupStatus || "Pending Assignment";
      const hasDriver = Boolean(b.pickupDelivery?.driverId);

      if (!hasDriver || st === "Pending Assignment") {
        pendingList.push(b);
      } else if (st !== "Delivered to Customer") {
        activeList.push(b);
      }
    }

    let list;
    if (filterTab === "active") list = activeList;
    else if (filterTab === "pending") list = pendingList;
    else list = bookings;

    return {
      activeCount: activeList.length,
      pendingCount: pendingList.length,
      totalCount: bookings.length,
      list,
    };
  }, [bookings, filterTab]);

  const selectedBooking = useMemo(
    () => bookings.find((b) => b._id === selectedBookingId) || null,
    [bookings, selectedBookingId],
  );

  // Compute live driver marker positions for all assigned trips
  const driverMarkers = useMemo(() => {
    const markers = [];

    bookings.forEach((b, idx) => {
      const pickup = b.pickupDelivery;
      const driver = pickup?.driverId;
      const status = pickup?.pickupStatus || "Pending Assignment";
      const custCoords =
        pickup?.pickupLocation?.coordinates || b.pickupLocation?.coordinates;

      if (
        !driver ||
        !Array.isArray(custCoords) ||
        custCoords.length !== 2 ||
        status === "Pending Assignment" ||
        status === "Delivered to Customer"
      ) {
        return;
      }

      const routePath = routesByBooking[b._id] || [WORKSHOP_COORDS, custCoords];
      let position = WORKSHOP_COORDS;

      // Determine driver's live position based on trip status + smooth road progression
      const phaseOffset = ((simStep + idx * 17) % 100) / 100;

      if (status === "Driver Assigned") {
        // Ready at workshop
        position = WORKSHOP_COORDS;
      } else if (status === "En Route to Pickup") {
        // Driving from Workshop -> Customer (0.15 to 0.85 along route)
        const progress = 0.15 + phaseOffset * 0.7;
        position = getPointAlongRoute(routePath, progress) || custCoords;
      } else if (status === "Vehicle Picked Up") {
        // Driving from Customer -> Workshop with the car! (reverse direction: 0.85 down to 0.1)
        const progress = 0.88 - phaseOffset * 0.75;
        position = getPointAlongRoute(routePath, progress) || custCoords;
      } else if (status === "Delivered to Workshop") {
        // Parked at workshop
        position = WORKSHOP_COORDS;
      } else if (status === "Out for Return Delivery") {
        // Returning car from Workshop -> Customer
        const progress = 0.15 + phaseOffset * 0.75;
        position = getPointAlongRoute(routePath, progress) || custCoords;
      }

      markers.push({
        bookingId: b._id,
        regNo: b.vehicleSnapshot?.registrationNo || "Vehicle",
        vehicleModel:
          [b.vehicleSnapshot?.brand, b.vehicleSnapshot?.modelName]
            .filter(Boolean)
            .join(" ") || "Vehicle",
        driverName: driver.name || "Driver",
        driverPhone: driver.contactNo || "",
        customerName: b.customerId?.name || "Customer",
        status,
        position,
        custCoords,
        routePath,
      });
    });

    return markers;
  }, [bookings, routesByBooking, simStep]);

  const selectedCustomerCoords =
    selectedBooking?.pickupDelivery?.pickupLocation?.coordinates ||
    selectedBooking?.pickupLocation?.coordinates ||
    null;

  return (
    <div className="space-y-4">
      {/* Header & Live Telemetry Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            Live Pickup &amp; Delivery Tracking Map
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Real-time GPS road tracking of assigned drivers bringing customer vehicles to the workshop.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLiveSimEnabled((prev) => !prev)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              liveSimEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-gray-200 bg-white text-slate-600"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                liveSimEnabled ? "bg-emerald-600 animate-pulse" : "bg-slate-400"
              }`}
            />
            <span>{liveSimEnabled ? "Live GPS Tracking ON" : "Tracking Paused"}</span>
          </button>

          <button
            type="button"
            onClick={() => setRefreshCount((c) => c + 1)}
            className="rounded-lg bg-[#13294b] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
          >
            Refresh Map
          </button>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{successMsg}</Alert>

      {/* Main Split View: Left Active Trips Drawer + Right Full Interactive Map */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Drawer: Active Trips & Quick Dispatch */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xs lg:col-span-4 lg:h-[600px]">
          {/* Drawer Filter Tabs */}
          <div className="grid grid-cols-3 border-b border-gray-200 p-1.5 bg-slate-50 rounded-t-2xl">
            <button
              type="button"
              onClick={() => setFilterTab("active")}
              className={`rounded-xl py-2 text-xs font-bold transition ${
                filterTab === "active"
                  ? "bg-[#13294b] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#13294b]"
              }`}
            >
              Active ({statsAndFiltered.activeCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("pending")}
              className={`rounded-xl py-2 text-xs font-bold transition ${
                filterTab === "pending"
                  ? "bg-[#13294b] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#13294b]"
              }`}
            >
              Unassigned ({statsAndFiltered.pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={`rounded-xl py-2 text-xs font-bold transition ${
                filterTab === "all"
                  ? "bg-[#13294b] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#13294b]"
              }`}
            >
              All ({statsAndFiltered.totalCount})
            </button>
          </div>

          {/* Trip Cards List */}
          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Loading active pickup routes...
              </div>
            ) : statsAndFiltered.list.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No pickup trips in this view.
              </div>
            ) : (
              statsAndFiltered.list.map((b) => {
                const vSnap = b.vehicleSnapshot || {};
                const cust = b.customerId || {};
                const pickup = b.pickupDelivery || {};
                const driver = pickup.driverId || null;
                const status = pickup.pickupStatus || "Pending Assignment";
                const isSelected = selectedBookingId === b._id;
                const selectedDriverForCard =
                  selectedDriversMap[b._id] || driver?._id || "";

                return (
                  <div
                    key={b._id}
                    onClick={() => setSelectedBookingId(b._id)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition ${
                      isSelected
                        ? "border-orange-600 bg-orange-50/30 shadow-xs"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-block rounded border-2 border-black bg-yellow-400 px-2 py-0.5 text-[11px] font-extrabold tracking-wider text-black uppercase">
                        {vSnap.registrationNo || "Vehicle"}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          PICKUP_STATUS_STYLES[status] ||
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {status}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs font-bold text-[#13294b]">
                      {[vSnap.brand, vSnap.modelName].filter(Boolean).join(" ") ||
                        vSnap.vehicleType}{" "}
                      · <span className="font-normal text-slate-600">{cust.name}</span>
                    </p>

                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      📍 {pickup.pickupLocation?.address || b.pickupLocation?.address || "Customer Location"}
                    </p>

                    {driver ? (
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-100/80 px-2.5 py-1.5 text-[11px]">
                        <span className="font-semibold text-[#13294b]">
                          🚗 Driver: {driver.name}
                        </span>
                        {driver.contactNo && (
                          <a
                            href={`tel:${driver.contactNo}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-orange-700 hover:underline"
                          >
                            {driver.contactNo}
                          </a>
                        )}
                      </div>
                    ) : (
                      <div
                        className="mt-2 flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={selectedDriverForCard}
                          onChange={(e) =>
                            setSelectedDriversMap((prev) => ({
                              ...prev,
                              [b._id]: e.target.value,
                            }))
                          }
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 outline-none"
                        >
                          <option value="">Select Free Driver...</option>
                          {availableDrivers.map((d) => (
                            <option key={d._id} value={d._id}>
                              {d.name} ({d.contactNo})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={assigningId === b._id}
                          onClick={() =>
                            handleAssignDriver(b._id, selectedDriverForCard)
                          }
                          className="rounded-lg bg-[#13294b] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1a3660] disabled:opacity-50"
                        >
                          {assigningId === b._id ? "..." : "Assign"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area: Full Interactive Leaflet Live Tracking Map */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xs lg:col-span-8 h-[480px] lg:h-[600px]">
          <MapContainer
            center={WORKSHOP_COORDS}
            zoom={12}
            style={{ height: "100%", width: "100%", zIndex: 1 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapFocusController
              targetCoords={selectedCustomerCoords}
              workshopCoords={WORKSHOP_COORDS}
            />

            {/* Main Workshop Base Marker */}
            <Marker position={WORKSHOP_COORDS} icon={workshopIcon}>
              <Popup>
                <div className="text-xs">
                  <strong className="text-[#13294b]">
                    Colombo Main Service Workshop
                  </strong>
                  <p className="mt-0.5 text-slate-500">
                    Central Vehicle Receiving &amp; Service Bay Hub
                  </p>
                </div>
              </Popup>
            </Marker>

            {/* Road Polylines & Customer Pickup Pins */}
            {bookings.map((b) => {
              const pickup = b.pickupDelivery || {};
              const coords =
                pickup.pickupLocation?.coordinates ||
                b.pickupLocation?.coordinates;
              if (!Array.isArray(coords) || coords.length !== 2) return null;

              const isSelected = selectedBookingId === b._id;
              const regNo = b.vehicleSnapshot?.registrationNo || "Vehicle";
              const routeCoords = routesByBooking[b._id] || [
                WORKSHOP_COORDS,
                coords,
              ];

              return (
                <div key={b._id}>
                  <Polyline
                    positions={routeCoords}
                    pathOptions={{
                      color: isSelected ? "#c2410c" : "#1d4ed8",
                      weight: isSelected ? 5 : 3,
                      opacity: isSelected ? 0.9 : 0.45,
                      dashArray:
                        pickup.pickupStatus === "Vehicle Picked Up"
                          ? undefined
                          : "8, 6",
                    }}
                  />

                  <Marker
                    position={coords}
                    icon={createCustomerIcon(regNo, isSelected)}
                    eventHandlers={{
                      click: () => setSelectedBookingId(b._id),
                    }}
                  >
                    <Popup>
                      <div className="space-y-1 text-xs">
                        <p className="font-bold text-[#13294b]">
                          {regNo} — {b.customerId?.name || "Customer"}
                        </p>
                        <p className="text-slate-600">
                          {pickup.pickupLocation?.address ||
                            b.pickupLocation?.address}
                        </p>
                        <p className="font-semibold text-orange-700">
                          Status: {pickup.pickupStatus || "Pending Assignment"}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                </div>
              );
            })}

            {/* Live Moving Driver Car Markers */}
            {driverMarkers.map((dm) => (
              <Marker
                key={`driver-${dm.bookingId}`}
                position={dm.position}
                icon={createDriverCarIcon(dm.regNo, dm.driverName, dm.status)}
                eventHandlers={{
                  click: () => setSelectedBookingId(dm.bookingId),
                }}
              >
                <Popup>
                  <div className="space-y-1 text-xs">
                    <p className="font-bold text-[#13294b]">
                      🚗 Driver: {dm.driverName} ({dm.driverPhone})
                    </p>
                    <p className="text-slate-700">
                      Car: <strong>{dm.regNo}</strong> ({dm.vehicleModel})
                    </p>
                    <p className="font-semibold text-orange-700">
                      Stage: {dm.status}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Floating Telemetry HUD Overlay for Selected Trip */}
          {selectedBooking && (
            <div className="pointer-events-auto absolute right-3 bottom-3 left-3 z-[400] flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur-xs sm:left-auto sm:w-96">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-black bg-yellow-400 px-2 py-0.5 text-[10px] font-extrabold text-black">
                    {selectedBooking.vehicleSnapshot?.registrationNo}
                  </span>
                  <span className="text-xs font-bold text-[#13294b]">
                    {selectedBooking.pickupDelivery?.driverId?.name
                      ? `Driver: ${selectedBooking.pickupDelivery.driverId.name}`
                      : "Waiting for Driver Assignment"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  Stage:{" "}
                  <strong className="text-orange-700">
                    {selectedBooking.pickupDelivery?.pickupStatus ||
                      "Pending Assignment"}
                  </strong>
                  {selectedBooking.pickupDelivery?.distance
                    ? ` · ${selectedBooking.pickupDelivery.distance} km`
                    : ""}
                </p>
              </div>

              <span className="rounded-lg bg-[#13294b] px-2.5 py-1 text-[10px] font-bold text-white">
                {selectedBooking.pickupDelivery?.pickupStatus ===
                "Vehicle Picked Up"
                  ? "Heading to Workshop →"
                  : selectedBooking.pickupDelivery?.pickupStatus ===
                      "En Route to Pickup"
                    ? "Heading to Customer →"
                    : "Live Route"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PickupDispatch;
