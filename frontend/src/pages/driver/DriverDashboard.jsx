import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import Profile from "../customer/Profile";

const COLOMBO_WORKSHOP = [6.9271, 79.8612];

const PICKUP_STATUS_STYLES = {
  "Driver Assigned": "bg-blue-100 text-blue-900",
  "En Route to Pickup": "bg-indigo-100 text-indigo-900",
  "Vehicle Picked Up": "bg-purple-100 text-purple-900",
  "Delivered to Workshop": "bg-emerald-100 text-emerald-900",
  "Out for Return Delivery": "bg-orange-100 text-orange-900",
  "Delivered to Customer": "bg-emerald-100 text-emerald-900",
};

const DRIVER_NEXT_ACTION = {
  "Driver Assigned": {
    nextStatus: "En Route to Pickup",
    label: "Start Pickup (En Route) →",
    btnClass: "bg-black hover:bg-neutral-800 text-white",
    navHint: "Head to customer pickup location",
  },
  "En Route to Pickup": {
    nextStatus: "Vehicle Picked Up",
    label: "Mark Vehicle Picked Up",
    btnClass: "bg-indigo-700 hover:bg-indigo-800 text-white",
    navHint: "En route to customer pickup",
  },
  "Vehicle Picked Up": {
    nextStatus: "Delivered to Workshop",
    label: "Confirm Delivered to Workshop (Finish Trip) ✓",
    btnClass: "bg-orange-600 hover:bg-orange-700 text-white",
    navHint: "Transporting vehicle to workshop",
  },
  "Out for Return Delivery": {
    nextStatus: "Delivered to Customer",
    label: "Complete Delivery to Customer ✓",
    btnClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
    navHint: "Returning vehicle to customer location",
  },
};

const TRIP_STEPS = [
  "Driver Assigned",
  "En Route to Pickup",
  "Vehicle Picked Up",
  "Delivered to Workshop",
  "Out for Return Delivery",
  "Delivered to Customer",
];

function createWorkshopIcon(label = "Workshop") {
  return L.divIcon({
    className: "uber-workshop-pin",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="background:#111827;color:#ffffff;border:2px solid #ffffff;border-radius:9999px;padding:3px 10px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.35);">
          ${label}
        </div>
        <div style="width:14px;height:14px;border-radius:3px;background:#111827;border:2.5px solid #ffffff;margin-top:3px;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createCustomerPinIcon(label = "Customer") {
  return L.divIcon({
    className: "uber-customer-pin",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="background:#ea580c;color:#ffffff;border:2px solid #ffffff;border-radius:9999px;padding:3px 10px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.35);">
          ${label}
        </div>
        <div style="width:14px;height:14px;border-radius:50%;background:#ea580c;border:2.5px solid #ffffff;margin-top:3px;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createDriverCarIcon(isReturning = false) {
  const bg = isReturning ? "#059669" : "#111827";
  const ring = isReturning ? "rgba(5,150,105,0.32)" : "rgba(17,24,39,0.28)";
  return L.divIcon({
    className: "uber-driver-car",
    html: `
      <div style="transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:${bg};border:3px solid #ffffff;box-shadow:0 0 0 8px ${ring},0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 17h14v-5l-2-5H7l-2 5v5z"></path>
          <circle cx="7.5" cy="17.5" r="1.5" fill="#ffffff"></circle>
          <circle cx="16.5" cy="17.5" r="1.5" fill="#ffffff"></circle>
        </svg>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function MapViewportController({ routePath, fallbackCenter, recenterKey }) {
  const map = useMap();

  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(t);
  }, [map]);

  useEffect(() => {
    if (routePath.length > 1) {
      map.fitBounds(L.latLngBounds(routePath), {
        paddingTopLeft: [48, 96],
        paddingBottomRight: [48, 280],
        maxZoom: 15,
      });
    } else if (fallbackCenter) {
      map.flyTo(fallbackCenter, 13, { duration: 0.7 });
    }
  }, [routePath, fallbackCenter, recenterKey, map]);

  return null;
}

function DriverDashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [routeMeta, setRouteMeta] = useState(null);
  const [carProgress, setCarProgress] = useState(0);
  const [recenterKey, setRecenterKey] = useState(0);
  const [driverGeoCoords, setDriverGeoCoords] = useState(COLOMBO_WORKSHOP);

  // Floating overlay states
  const [showTripsDrawer, setShowTripsDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState("active"); // 'active' | 'history'
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [toast, setToast] = useState({ type: "", text: "" });

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Detect driver GPS once for idle center
  useEffect(() => {
    let isMounted = true;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (isMounted) {
            setDriverGeoCoords([pos.coords.latitude, pos.coords.longitude]);
          }
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
      );
    }
    return () => {
      isMounted = false;
    };
  }, []);

  // Initial load + silent 5-second real-time polling
  useEffect(() => {
    let isMounted = true;
    let activeController = null;

    const fetchTasks = async () => {
      if (document.visibilityState !== "visible") return;
      if (activeController) activeController.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const res = await api.get("/admin/drivers/my-tasks", {
          signal: controller.signal,
        });
        if (isMounted && res.data.success) {
          setTasks(res.data.tasks || []);
        }
      } catch (err) {
        if (
          isMounted &&
          err.name !== "CanceledError" &&
          err.code !== "ERR_CANCELED"
        ) {
          setToast({
            type: "error",
            text: err.response?.data?.message || "Failed to load trips.",
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTasks();
    const intervalId = window.setInterval(fetchTasks, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchTasks();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      if (activeController) activeController.abort();
    };
  }, []);

  // Pickup leg finishes at "Delivered to Workshop"; Return leg finishes at "Delivered to Customer"
  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.pickupStatus !== "Delivered to Workshop" &&
          t.pickupStatus !== "Delivered to Customer",
      ),
    [tasks],
  );

  const completedTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.pickupStatus === "Delivered to Workshop" ||
          t.pickupStatus === "Delivered to Customer",
      ),
    [tasks],
  );

  // Pick selected active trip (automatically clears once finished at workshop or customer)
  const currentTask = useMemo(() => {
    if (selectedTaskId) {
      const found = activeTasks.find((t) => t._id === selectedTaskId);
      if (found) return found;
    }
    return activeTasks[0] || null;
  }, [activeTasks, selectedTaskId]);

  const pickupCoords = useMemo(() => {
    const c = currentTask?.pickupLocation?.coordinates;
    return Array.isArray(c) && c.length === 2 ? c : null;
  }, [currentTask]);

  const workshopCoords = useMemo(() => {
    const c = currentTask?.deliveryLocation?.coordinates;
    return Array.isArray(c) && c.length === 2 ? c : COLOMBO_WORKSHOP;
  }, [currentTask]);

  // Fetch OSRM road route for the active trip
  useEffect(() => {
    if (!pickupCoords || !workshopCoords) {
      return undefined;
    }

    let isMounted = true;
    const controller = new AbortController();
    const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords[1]},${pickupCoords[0]};${workshopCoords[1]},${workshopCoords[0]}?overview=full&geometries=geojson`;

    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.code === "Ok" && data.routes?.[0]) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(([lng, lat]) => [
            lat,
            lng,
          ]);
          setRoutePath(coords);
          setRouteMeta({
            distanceKm: (route.distance / 1000).toFixed(1),
            durationMin: Math.max(1, Math.round(route.duration / 60)),
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setRoutePath([pickupCoords, workshopCoords]);
          setRouteMeta(null);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [pickupCoords, workshopCoords]);

  const activeRoutePath = useMemo(
    () => (pickupCoords ? routePath : []),
    [pickupCoords, routePath],
  );
  const currentStatus = currentTask?.pickupStatus || "";

  const isOnRoad =
    currentStatus === "En Route to Pickup" ||
    currentStatus === "Vehicle Picked Up" ||
    currentStatus === "Out for Return Delivery";

  const isReturning = currentStatus === "Out for Return Delivery";

  // Smooth Uber-style car movement animation while actively driving a leg
  useEffect(() => {
    if (!isOnRoad || activeRoutePath.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setCarProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 300);
    return () => window.clearInterval(timer);
  }, [isOnRoad, activeRoutePath.length]);

  const driverCarPos = useMemo(() => {
    if (!currentTask) return driverGeoCoords;
    if (activeRoutePath.length > 1) {
      if (currentStatus === "Delivered to Workshop") {
        return activeRoutePath[activeRoutePath.length - 1];
      }
      if (currentStatus === "Delivered to Customer") {
        return activeRoutePath[0];
      }
      if (!isOnRoad) {
        return activeRoutePath[activeRoutePath.length - 1];
      }
      const ratio = carProgress / 100;
      const forwardIdx = Math.min(
        activeRoutePath.length - 1,
        Math.floor(ratio * (activeRoutePath.length - 1)),
      );
      const movingToCustomer =
        currentStatus === "En Route to Pickup" ||
        currentStatus === "Out for Return Delivery";
      const idx = movingToCustomer
        ? activeRoutePath.length - 1 - forwardIdx
        : forwardIdx;
      return activeRoutePath[idx];
    }
    return driverGeoCoords;
  }, [
    currentTask,
    currentStatus,
    isOnRoad,
    activeRoutePath,
    carProgress,
    driverGeoCoords,
  ]);

  const handleStatusUpdate = useCallback(async (taskId, nextStatus) => {
    setToast({ type: "", text: "" });
    setUpdatingTaskId(taskId);

    try {
      const res = await api.patch(`/admin/drivers/tasks/${taskId}/status`, {
        pickupStatus: nextStatus,
      });

      if (res.data.success && res.data.task) {
        setTasks((prev) =>
          prev.map((t) => (t._id === taskId ? res.data.task : t)),
        );
        setCarProgress(0);
        setToast({
          type: "success",
          text: res.data.message || `Trip updated to ${nextStatus}`,
        });
      }
    } catch (err) {
      setToast({
        type: "error",
        text: err.response?.data?.message || "Failed to update trip status.",
      });
    } finally {
      setUpdatingTaskId(null);
    }
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayName = user?.name || "Driver";
  const nextAction = currentTask ? DRIVER_NEXT_ACTION[currentStatus] : null;
  const currentStepIdx = currentTask
    ? Math.max(0, TRIP_STEPS.indexOf(currentStatus))
    : 0;

  const destinationCoords =
    currentStatus === "Vehicle Picked Up" ? workshopCoords : pickupCoords;
  const googleMapsNavUrl = destinationCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${destinationCoords[0]},${destinationCoords[1]}&travelmode=driving`
    : null;

  const workshopIcon = useMemo(() => createWorkshopIcon("Workshop"), []);
  const customerIcon = useMemo(
    () =>
      createCustomerPinIcon(
        currentTask?.customerId?.name || "Customer Location",
      ),
    [currentTask?.customerId?.name],
  );
  const carIcon = useMemo(
    () => createDriverCarIcon(isReturning),
    [isReturning],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-100 select-none">
      {/* FULL-SCREEN UBER-STYLE OPENSTREETMAP */}
      <MapContainer
        center={COLOMBO_WORKSHOP}
        zoom={12}
        zoomControl={false}
        style={{ height: "100%", width: "100%", zIndex: 0 }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Workshop Pin */}
        <Marker position={workshopCoords} icon={workshopIcon}>
          <Popup>
            <strong>Workshop Service Centre</strong>
          </Popup>
        </Marker>

        {/* Customer Pickup / Return Pin */}
        {pickupCoords && (
          <Marker position={pickupCoords} icon={customerIcon}>
            <Popup>
              <strong>{currentTask?.customerId?.name || "Customer"}</strong>
              <br />
              {currentTask?.pickupLocation?.address || "Customer Location"}
            </Popup>
          </Marker>
        )}

        {/* OSRM Driving Route */}
        {activeRoutePath.length > 1 && (
          <Polyline
            positions={activeRoutePath}
            color={isReturning ? "#059669" : "#111827"}
            weight={6}
            opacity={0.9}
          />
        )}

        {/* Live Driver Vehicle Marker */}
        {driverCarPos && (
          <Marker position={driverCarPos} icon={carIcon} zIndexOffset={1500}>
            <Popup>
              <strong>{displayName}</strong>
              {currentStatus ? ` — ${currentStatus}` : " — Online"}
            </Popup>
          </Marker>
        )}

        <MapViewportController
          routePath={activeRoutePath}
          fallbackCenter={driverGeoCoords}
          recenterKey={recenterKey}
        />
      </MapContainer>

      {/* FLOATING TOP HUD BAR */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-1000 flex items-start justify-between gap-2 p-3 sm:p-4">
        {/* Top-Left: Driver Avatar & Online Pill */}
        <button
          type="button"
          onClick={() => setShowProfileModal(true)}
          className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-white/95 py-1.5 pr-4 pl-1.5 shadow-lg backdrop-blur-md transition hover:bg-white"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-xs font-extrabold text-white">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <div className="text-left leading-tight">
            <p className="max-w-30 truncate text-xs font-bold text-slate-900">
              {displayName}
            </p>
            <p className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Online
            </p>
          </div>
        </button>

        {/* Top-Center: Uber Turn-By-Turn Destination Banner (when trip active) */}
        {currentTask && currentStatus !== "Delivered to Customer" && (
          <div className="pointer-events-auto hidden max-w-md items-center gap-3 rounded-2xl bg-neutral-950/95 px-4 py-2.5 text-white shadow-xl backdrop-blur-md md:flex">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                isReturning ? "bg-emerald-600" : "bg-orange-600"
              }`}
            >
              {isReturning ? "↩" : "➔"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">
                {currentStatus === "Vehicle Picked Up"
                  ? "Deliver to Workshop Service Centre"
                  : currentTask.pickupLocation?.address || "Customer Location"}
              </p>
              <p className="text-[11px] text-neutral-300">
                {routeMeta
                  ? `${routeMeta.durationMin} min · ${routeMeta.distanceKm} km`
                  : `${currentTask.distance || 0} km`}
                {" · "}
                {nextAction?.navHint || currentStatus}
              </p>
            </div>
          </div>
        )}

        {/* Top-Right: Trips Queue Button & Logout */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRecenterKey((k) => k + 1)}
            title="Recenter map"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-lg backdrop-blur-md transition hover:bg-white"
          >
            ◎
          </button>

          <button
            type="button"
            onClick={() => setShowTripsDrawer(true)}
            className="flex items-center gap-2 rounded-full bg-black/95 px-4 py-2.5 text-xs font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-neutral-800"
          >
            <span>Trips</span>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1.5 text-[10px] font-extrabold text-white">
              {activeTasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full bg-white/95 px-3.5 py-2.5 text-xs font-bold text-slate-800 shadow-lg backdrop-blur-md transition hover:bg-red-50 hover:text-red-700"
          >
            Logout
          </button>
        </div>
      </div>

      {/* FLOATING TOAST NOTIFICATION */}
      {toast.text && (
        <div className="fixed top-18 left-1/2 z-1050 w-[92%] max-w-md -translate-x-1/2">
          <div
            className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs font-bold shadow-2xl ${
              toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-neutral-950 text-white"
            }`}
          >
            <span>{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast({ type: "", text: "" })}
              className="shrink-0 opacity-75 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* UBER-STYLE FLOATING BOTTOM TRIP SHEET */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-1000 flex justify-center p-3 sm:p-5">
        <div className="pointer-events-auto w-full max-w-xl">
          {loading ? (
            <div className="rounded-3xl bg-white/95 p-5 text-center text-xs font-semibold text-slate-500 shadow-2xl backdrop-blur-md">
              Connecting to dispatch...
            </div>
          ) : !currentTask ? (
            /* IDLE STATE: Clean Uber "You're Online" Sheet */
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white/95 px-6 py-5 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
                  <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-emerald-600" />
                </span>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    You&apos;re Online
                  </h2>
                  <p className="text-xs text-slate-500">
                    Waiting for pickup or return delivery assignments
                  </p>
                </div>
              </div>

              {completedTasks.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDrawerTab("history");
                    setShowTripsDrawer(true);
                  }}
                  className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-200"
                >
                  {completedTasks.length} Completed
                </button>
              )}
            </div>
          ) : (
            /* ACTIVE TRIP UBER CARD */
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
              {/* Multi-trip quick switcher pills if driver has 2+ active trips */}
              {activeTasks.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50 px-4 py-2">
                  {activeTasks.map((t, idx) => {
                    const isSel = t._id === currentTask._id;
                    const plate =
                      t.appointmentId?.vehicleSnapshot?.registrationNo ||
                      `Trip ${idx + 1}`;
                    return (
                      <button
                        key={t._id}
                        type="button"
                        onClick={() => {
                          setSelectedTaskId(t._id);
                          setCarProgress(0);
                        }}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                          isSel
                            ? "bg-black text-white"
                            : "bg-white text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {plate}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="p-4 sm:p-5">
                {/* Top Row: Plate, Vehicle, Status & ETA */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded border-2 border-black bg-yellow-400 px-2.5 py-0.5 text-xs font-black tracking-widest text-black uppercase">
                      {currentTask.appointmentId?.vehicleSnapshot
                        ?.registrationNo || "VEHICLE"}
                    </span>
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900">
                        {[
                          currentTask.appointmentId?.vehicleSnapshot?.brand,
                          currentTask.appointmentId?.vehicleSnapshot?.modelName,
                        ]
                          .filter(Boolean)
                          .join(" ") ||
                          currentTask.appointmentId?.vehicleSnapshot
                            ?.vehicleType ||
                          "Customer Vehicle"}
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        {currentTask.customerId?.name || "Customer"} ·{" "}
                        {routeMeta
                          ? `${routeMeta.durationMin} min (${routeMeta.distanceKm} km)`
                          : `${currentTask.distance || 0} km`}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      PICKUP_STATUS_STYLES[currentStatus] ||
                      "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {currentStatus}
                  </span>
                </div>

                {/* Address + Quick Call & Navigate Buttons */}
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3.5 py-2.5">
                  <p className="line-clamp-2 flex-1 text-xs font-medium text-slate-700">
                    📍{" "}
                    {currentStatus === "Vehicle Picked Up"
                      ? "Colombo Main Workshop Service Centre"
                      : currentTask.pickupLocation?.address ||
                        "Customer Pickup Location"}
                  </p>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {currentTask.customerId?.contactNo && (
                      <a
                        href={`tel:${currentTask.customerId.contactNo}`}
                        title="Call Customer"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm text-slate-900 shadow-xs ring-1 ring-slate-200 transition hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        📞
                      </a>
                    )}
                    {googleMapsNavUrl && (
                      <a
                        href={googleMapsNavUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Turn-by-Turn Navigation"
                        className="flex h-9 items-center gap-1 rounded-full bg-[#13294b] px-3 text-[11px] font-bold text-white shadow-xs transition hover:bg-[#1a3660]"
                      >
                        <span>Navigate</span>
                        <span>↗</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Slim 6-Step Trip Progress Strip */}
                <div className="mt-3 grid grid-cols-6 gap-1">
                  {TRIP_STEPS.map((step, idx) => (
                    <div
                      key={step}
                      title={step}
                      className={`h-1.5 rounded-full transition ${
                        idx < currentStepIdx
                          ? "bg-emerald-500"
                          : idx === currentStepIdx
                            ? "bg-orange-600"
                            : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>

                {/* Big Uber-Style Primary Action Button */}
                <div className="mt-3.5">
                  {nextAction ? (
                    <button
                      type="button"
                      disabled={updatingTaskId === currentTask._id}
                      onClick={() =>
                        handleStatusUpdate(
                          currentTask._id,
                          nextAction.nextStatus,
                        )
                      }
                      className={`w-full touch-manipulation rounded-2xl py-3.5 text-sm font-extrabold shadow-md transition active:scale-[0.99] disabled:opacity-50 ${nextAction.btnClass}`}
                    >
                      {updatingTaskId === currentTask._id
                        ? "Updating..."
                        : nextAction.label}
                    </button>
                  ) : (
                    <div className="rounded-2xl bg-emerald-50 py-3 text-center text-xs font-extrabold text-emerald-800">
                      ✓ Trip Completed &amp; Delivered
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SLIDE-OVER TRIPS & HISTORY DRAWER */}
      {showTripsDrawer && (
        <div
          className="fixed inset-0 z-1100 flex justify-end bg-black/45 backdrop-blur-[1px]"
          onClick={() => setShowTripsDrawer(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-extrabold text-slate-900">
                My Trips
              </h2>
              <button
                type="button"
                onClick={() => setShowTripsDrawer(false)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-1.5 border-b border-gray-100 p-3">
              <button
                type="button"
                onClick={() => setDrawerTab("active")}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                  drawerTab === "active"
                    ? "bg-black text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Active ({activeTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("history")}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                  drawerTab === "history"
                    ? "bg-black text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Completed ({completedTasks.length})
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
              {(drawerTab === "active" ? activeTasks : completedTasks)
                .length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">
                  {drawerTab === "active"
                    ? "No active trips assigned."
                    : "No completed trips yet."}
                </p>
              ) : (
                (drawerTab === "active" ? activeTasks : completedTasks).map(
                  (t) => {
                    const vSnap = t.appointmentId?.vehicleSnapshot || {};
                    const isSelected = currentTask?._id === t._id;
                    return (
                      <button
                        key={t._id}
                        type="button"
                        onClick={() => {
                          setSelectedTaskId(t._id);
                          setShowTripsDrawer(false);
                        }}
                        className={`w-full rounded-2xl border p-3.5 text-left transition ${
                          isSelected
                            ? "border-black bg-slate-50"
                            : "border-gray-200 bg-white hover:border-slate-400"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded border border-black bg-yellow-400 px-2 py-0.5 text-[10px] font-black uppercase">
                            {vSnap.registrationNo || "Vehicle"}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              PICKUP_STATUS_STYLES[t.pickupStatus] ||
                              "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {t.pickupStatus}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-bold text-slate-900">
                          {[vSnap.brand, vSnap.modelName]
                            .filter(Boolean)
                            .join(" ") || "Vehicle"}{" "}
                          · {t.customerId?.name || "Customer"}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          📍 {t.pickupLocation?.address || "Customer Location"}
                        </p>
                      </button>
                    );
                  },
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <div
          className="fixed inset-0 z-1100 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
          onClick={() => setShowProfileModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#f8f9fa] p-5 shadow-2xl"
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-100"
              >
                Close ✕
              </button>
            </div>
            <Profile showCustomerStats={false} onLogout={handleLogout} />
          </div>
        </div>
      )}
    </div>
  );
}

export default DriverDashboard;
