import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SmartMap } from "../../components/map/SmartMap";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import Alert from "../../components/ui/Alert";
import Vehicle from "./Vehicle";
import Booking from "./Booking";
import Profile from "./Profile";

const NAV_ITEMS = [
  { id: "Dashboard", label: "Dashboard" },
  { id: "My Vehicles", label: "My Vehicles" },
  { id: "My Bookings", label: "My Bookings" },
  { id: "Book a Service", label: "Book a Service" },
  { id: "Profile", label: "Profile" },
];

const STAGE_BADGE = {
  "Vehicle Received": "bg-slate-100 text-slate-700",
  Inspection: "bg-sky-100 text-sky-800",
  "Waiting for Approval": "bg-amber-100 text-amber-900",
  "In Progress": "bg-blue-100 text-blue-800",
  "Waiting for Parts": "bg-purple-100 text-purple-800",
  "Out for Return Delivery": "bg-emerald-100 text-emerald-900",
  "Ready for Return Delivery": "bg-emerald-50 text-emerald-800",
  "Driver Assigned": "bg-blue-100 text-blue-800",
  "En Route to Pickup": "bg-indigo-100 text-indigo-800",
  "Vehicle Picked Up": "bg-purple-100 text-purple-800",
  "Delivered to Workshop": "bg-emerald-100 text-emerald-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Confirmed: "bg-blue-50 text-blue-700",
  Pending: "bg-amber-50 text-amber-800",
  Cancelled: "bg-red-50 text-red-600",
};

const READ_NOTIF_STORAGE_KEY = "vss_customer_read_notifications_v1";

function loadReadNotificationIds() {
  try {
    const raw = window.localStorage.getItem(READ_NOTIF_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadNotificationIds(idSet) {
  try {
    const arr = Array.from(idSet).slice(-150);
    window.localStorage.setItem(READ_NOTIF_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage quota errors
  }
}

function formatTimeAgo(val) {
  if (!val) return "";
  try {
    const diffMs = Date.now() - new Date(val).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(val).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

function isBookingActive(b) {
  if (!b || b.status === "Cancelled") return false;
  if (b.requiresPickup) {
    const pStatus = b.pickupDelivery?.pickupStatus || "";
    if (pStatus === "Delivered to Customer") return false;
    if (b.status === "Completed" && !b.pickupDelivery) return false;
    return true;
  }
  return b.status !== "Completed" && b.service?.status !== "Completed";
}

function buildBookingPipeline(booking) {
  if (!booking || booking.status === "Cancelled") {
    return {
      steps: ["Booked", "Vehicle Check", "In Progress", "Approval", "Completed"],
      current: -1,
      badgeText:
        booking?.status === "Cancelled" ? "Cancelled" : "No Active Service",
    };
  }

  const isPickup = Boolean(booking.requiresPickup);
  const steps = isPickup
    ? [
        "Booked",
        "Driver Pickup",
        "Vehicle Check",
        "In Progress",
        "Approval",
        "Return Delivery",
        "Completed",
      ]
    : ["Booked", "Vehicle Check", "In Progress", "Approval", "Completed"];

  const lastIdx = steps.length - 1;
  const offset = isPickup ? 1 : 0;
  const srvStatus = booking.service?.status || "";
  const pStatus = booking.pickupDelivery?.pickupStatus || "";
  const works = Array.isArray(booking.service?.additionalWorks)
    ? booking.service.additionalWorks
    : [];
  const hasPending = works.some((w) => w.status === "Pending Approval");
  const hasResponded = works.some(
    (w) => w.status === "Approved" || w.status === "Rejected",
  );

  let current = 0;
  let badgeText = srvStatus || booking.status;

  if (isPickup && pStatus === "Delivered to Customer") {
    current = lastIdx;
    badgeText = "Completed";
  } else if (
    isPickup &&
    (pStatus === "Out for Return Delivery" || srvStatus === "Completed")
  ) {
    current = lastIdx - 1; // Return Delivery
    badgeText =
      pStatus === "Out for Return Delivery"
        ? "Out for Return Delivery"
        : "Ready for Return Delivery";
  } else if (!isPickup && (booking.status === "Completed" || srvStatus === "Completed")) {
    current = lastIdx;
    badgeText = "Completed";
  } else if (srvStatus === "Waiting for Approval" || hasPending) {
    current = 3 + offset;
    badgeText = "Waiting for Approval";
  } else if (srvStatus === "In Progress" || srvStatus === "Waiting for Parts") {
    current = hasResponded ? 3 + offset : 2 + offset;
    badgeText = srvStatus;
  } else if (
    srvStatus === "Inspection" ||
    srvStatus === "Vehicle Received" ||
    booking.status === "In Progress"
  ) {
    current = 1 + offset;
    badgeText = srvStatus || "Inspection";
  } else if (isPickup) {
    if (
      pStatus === "Driver Assigned" ||
      pStatus === "En Route to Pickup" ||
      pStatus === "Vehicle Picked Up" ||
      pStatus === "Delivered to Workshop"
    ) {
      current = 1;
      badgeText = pStatus;
    }
  }

  return { steps, current, badgeText };
}

function deriveNotificationsFromBookings(bookings) {
  const items = [];

  for (const app of bookings) {
    const plate = app.vehicleSnapshot?.registrationNo || "Vehicle";
    const srv = app.service || null;
    const pickup = app.pickupDelivery || null;

    // 1. Pending additional work approvals (highest priority)
    if (srv && Array.isArray(srv.additionalWorks)) {
      for (const work of srv.additionalWorks) {
        if (work.status === "Pending Approval") {
          items.push({
            id: `approval-${srv._id}-${work._id}`,
            type: "approval",
            title: `Approval needed · ${plate}`,
            body: `${work.title} (Rs. ${Number(work.estimatedCost || 0).toLocaleString()})`,
            timestamp: work.addedAt || srv.updatedAt || app.updatedAt,
            bookingId: app._id,
          });
        }
      }
    }

    // 2. Workshop stage logs
    if (srv && Array.isArray(srv.statusLogs)) {
      for (let i = 0; i < srv.statusLogs.length; i += 1) {
        const log = srv.statusLogs[i];
        items.push({
          id: `srvlog-${srv._id}-${log.stage}-${log.updatedAt || i}`,
          type: log.stage === "Completed" ? "success" : "workshop",
          title: `${plate} · ${log.stage}`,
          body: log.note || `Vehicle moved to ${log.stage}`,
          timestamp: log.updatedAt || srv.updatedAt,
          bookingId: app._id,
        });
      }
    }

    // 3. Pickup & delivery logs
    if (pickup && Array.isArray(pickup.statusLogs)) {
      for (let i = 0; i < pickup.statusLogs.length; i += 1) {
        const log = pickup.statusLogs[i];
        items.push({
          id: `pickuplog-${pickup._id}-${log.status}-${log.timestamp || i}`,
          type: "pickup",
          title: `${plate} · ${log.status}`,
          body: log.note || `Pickup status updated to ${log.status}`,
          timestamp: log.timestamp || pickup.updatedAt,
          bookingId: app._id,
        });
      }
    }
  }

  // Sort newest first, keeping pending approvals at the very top
  items.sort((a, b) => {
    if (a.type === "approval" && b.type !== "approval") return -1;
    if (b.type === "approval" && a.type !== "approval") return 1;
    return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
  });

  return items.slice(0, 25);
}

function CustomerDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [vehicles, setVehicles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [routeCoords, setRouteCoords] = useState(null);
  const [resetCount, setResetCount] = useState(0);
  const [respondingItemId, setRespondingItemId] = useState(null);
  const [approvalFeedback, setApprovalFeedback] = useState({
    type: "",
    text: "",
  });

  // Notifications dropdown & read state
  const [notifOpen, setNotifOpen] = useState(false);
  const [readIds, setReadIds] = useState(() => loadReadNotificationIds());
  const notifRef = useRef(null);
  const approvalSectionRef = useRef(null);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Initial load + silent real-time sync every 5 seconds while tab is visible
  useEffect(() => {
    let isMounted = true;
    let activeController = null;

    const fetchLiveBookings = async () => {
      if (document.visibilityState !== "visible") return;
      if (activeController) activeController.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const res = await api.get("/appointments", {
          signal: controller.signal,
        });
        if (isMounted && res.data.success) {
          setBookings(res.data.appointments || []);
        }
      } catch {
        // Ignore transient network or abort errors
      }
    };

    const initController = new AbortController();
    api
      .get("/vehicles", { signal: initController.signal })
      .then((res) => {
        if (isMounted && res.data.success) {
          setVehicles(res.data.vehicles || []);
        }
      })
      .catch(() => {});

    fetchLiveBookings();

    const intervalId = window.setInterval(fetchLiveBookings, 5000);
    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        fetchLiveBookings();
      }
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      initController.abort();
      if (activeController) activeController.abort();
    };
  }, []);

  // Close notification popover on outside click
  useEffect(() => {
    if (!notifOpen) return undefined;
    const handleOutsideClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [notifOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleOrderReady = useCallback((data) => {
    setRouteCoords(data);
  }, []);

  const handleResetMap = (e) => {
    e.stopPropagation();
    setResetCount((prev) => prev + 1);
    setRouteCoords(null);
  };

  const handleRespondAdditionalWork = async (serviceId, itemId, decision) => {
    setRespondingItemId(itemId);
    setApprovalFeedback({ type: "", text: "" });

    try {
      const res = await api.patch(
        `/service-bays/customer/services/${serviceId}/additional-work/${itemId}`,
        { decision },
      );

      if (res.data.success) {
        setBookings((prev) =>
          prev.map((b) =>
            b.service?._id === serviceId
              ? {
                  ...b,
                  service: res.data.service
                    ? { ...res.data.service, bayId: b.service?.bayId }
                    : b.service,
                  invoice: res.data.invoice || b.invoice,
                }
              : b,
          ),
        );
        setApprovalFeedback({
          type: "success",
          text:
            res.data.message ||
            `Additional work item ${decision.toLowerCase()}.`,
        });
      }
    } catch (err) {
      setApprovalFeedback({
        type: "error",
        text:
          err.response?.data?.message ||
          "Failed to submit your approval decision.",
      });
    } finally {
      setRespondingItemId(null);
    }
  };

  const notifications = useMemo(
    () => deriveNotificationsFromBookings(bookings),
    [bookings],
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds],
  );

  const markAllNotificationsRead = () => {
    const next = new Set(readIds);
    for (const n of notifications) {
      next.add(n.id);
    }
    setReadIds(next);
    saveReadNotificationIds(next);
  };

  const handleNotificationClick = (notif) => {
    const next = new Set(readIds);
    next.add(notif.id);
    setReadIds(next);
    saveReadNotificationIds(next);
    setNotifOpen(false);

    if (notif.type === "approval") {
      setActiveTab("Dashboard");
      window.setTimeout(() => {
        approvalSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    } else {
      setActiveTab("My Bookings");
    }
  };

  const displayName = user?.name || "Customer";

  // Only show an ACTIVE booking on the Dashboard (completed bookings move to History in My Bookings!)
  // For Pickup & Delivery bookings, stays active until "Delivered to Customer" even after workshop service completes.
  const activeBooking = useMemo(() => {
    const activeList = bookings.filter(isBookingActive);
    return (
      activeList.find(
        (b) => b.pickupDelivery?.pickupStatus === "Out for Return Delivery",
      ) ||
      activeList.find((b) => b.status === "In Progress") ||
      activeList[0] ||
      null
    );
  }, [bookings]);

  const stats = useMemo(() => {
    let activeCount = 0;
    let historyCount = 0;
    let pendingApprovals = 0;

    for (const b of bookings) {
      if (isBookingActive(b)) {
        activeCount += 1;
        const works = Array.isArray(b.service?.additionalWorks)
          ? b.service.additionalWorks
          : [];
        for (const w of works) {
          if (w.status === "Pending Approval") pendingApprovals += 1;
        }
      } else {
        historyCount += 1;
      }
    }

    return { activeCount, historyCount, pendingApprovals };
  }, [bookings]);

  const vSnap = activeBooking?.vehicleSnapshot || null;
  const vehicleTitle = vSnap
    ? [vSnap.brand, vSnap.modelName].filter(Boolean).join(" ") ||
      vSnap.vehicleType
    : "";

  const plateNo = vSnap?.registrationNo || null;

  const formattedBookingDate = activeBooking?.serviceDate
    ? new Date(activeBooking.serviceDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

  const packageName =
    activeBooking?.packageId?.packageName || "Service Package";

  const pipeline = useMemo(
    () => buildBookingPipeline(activeBooking),
    [activeBooking],
  );

  const activePickup = activeBooking?.pickupDelivery || null;
  const activePickupStatus = activePickup?.pickupStatus || "";
  const activeDriver = activePickup?.driverId || null;
  const activeBay = activeBooking?.service?.bayId || null;
  const activeLogs = Array.isArray(activeBooking?.service?.statusLogs)
    ? activeBooking.service.statusLogs
    : [];

  const isReturningPhase = Boolean(
    activeBooking?.requiresPickup &&
      (activePickupStatus === "Out for Return Delivery" ||
        (activeBooking.service?.status === "Completed" &&
          activePickupStatus !== "Delivered to Customer")),
  );

  const isPickupPhase = Boolean(
    activeBooking?.requiresPickup &&
      !activeBooking.service &&
      activePickupStatus !== "Delivered to Workshop" &&
      activePickupStatus !== "Delivered to Customer",
  );

  const isInWorkshopPhase = Boolean(
    activeBooking?.service && activeBooking.service.status !== "Completed",
  );

  const driverTrackingConfig = useMemo(() => {
    if (!activeBooking?.requiresPickup) return null;
    const driverCoords = activePickup?.driverLiveLocation?.coordinates || null;
    const driverName = activeDriver?.name || "Driver";

    if (activePickupStatus === "Driver Assigned") {
      return {
        active: true,
        moving: false,
        direction: "at-workshop",
        label: "Driver Assigned · At Workshop",
        routeBadge: "Workshop ➔ Your Location (Assigned)",
        driverName,
        coords: driverCoords,
      };
    }
    if (activePickupStatus === "En Route to Pickup") {
      return {
        active: true,
        moving: true,
        direction: "to-customer",
        label: "Driver Coming to You",
        routeBadge: "Workshop ➔ Your Location",
        driverName,
        coords: driverCoords,
      };
    }
    if (activePickupStatus === "Vehicle Picked Up") {
      return {
        active: true,
        moving: true,
        direction: "to-workshop",
        label: "Taking Vehicle to Workshop",
        routeBadge: "Your Location ➔ Workshop",
        driverName,
        coords: driverCoords,
      };
    }
    if (activePickupStatus === "Out for Return Delivery") {
      return {
        active: true,
        moving: true,
        direction: "returning",
        label: "Returning Your Vehicle",
        routeBadge: "Workshop ➔ Your Location (Return)",
        driverName,
        coords: driverCoords,
      };
    }
    return null;
  }, [activeBooking, activePickup, activePickupStatus, activeDriver]);

  const pickupMapCoords =
    Array.isArray(activeBooking?.pickupLocation?.coordinates) &&
    activeBooking.pickupLocation.coordinates.length === 2
      ? activeBooking.pickupLocation.coordinates
      : null;

  const workshopMapCoords =
    Array.isArray(activePickup?.deliveryLocation?.coordinates) &&
    activePickup.deliveryLocation.coordinates.length === 2
      ? activePickup.deliveryLocation.coordinates
      : null;

  const notificationBellControl = (
    <div ref={notifRef} className="relative">
      <button
        type="button"
        onClick={() => setNotifOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-[#13294b] shadow-2xs transition hover:border-orange-300 hover:bg-orange-50/40"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.9}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {notifOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-xs font-bold text-[#13294b]">
              Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllNotificationsRead}
                className="text-[11px] font-semibold text-orange-700 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">
                No notifications yet. Updates on your vehicle service and
                approvals will appear here.
              </p>
            ) : (
              notifications.map((n) => {
                const isUnread = !readIds.has(n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      isUnread ? "bg-orange-50/40" : "bg-white"
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.type === "approval"
                          ? "bg-amber-500"
                          : n.type === "success"
                            ? "bg-emerald-500"
                            : isUnread
                              ? "bg-orange-600"
                              : "bg-slate-300"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-[#13294b]">
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatTimeAgo(n.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">
                        {n.body}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-[#13294b] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
        <div>
          <div className="px-6 pt-7 pb-6">
            <span className="text-base font-bold tracking-tight">
              Vehicle Service
            </span>
            <p className="mt-0.5 text-[11px] font-medium text-orange-300">
              Customer Portal
            </p>
          </div>

          <nav className="space-y-1 px-3">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-sm transition ${
                    isActive
                      ? "bg-orange-700 font-semibold text-white"
                      : "font-medium text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === "My Bookings" && stats.pendingApprovals > 0 && (
                    <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-black">
                      {stats.pendingApprovals}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-white/10 px-6 py-5">
          <p className="truncate text-xs font-semibold text-white">
            {displayName}
          </p>
          <p className="truncate text-[11px] text-slate-300">{user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 text-xs font-semibold text-orange-300 transition hover:text-white"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#13294b] px-4 py-3.5 text-white shadow-sm lg:hidden">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-orange-300">
            Vehicle Service
          </p>
          <h1 className="truncate text-base leading-tight font-bold">
            Hi, {displayName}
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {notificationBellControl}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 pt-5 pb-24 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl space-y-5">
          {activeTab === "My Vehicles" ? (
            <Vehicle onVehiclesChange={setVehicles} />
          ) : activeTab === "My Bookings" || activeTab === "Book a Service" ? (
            <Booking
              key={activeTab}
              initialTab={activeTab === "Book a Service" ? "new" : "list"}
              onNavigateToVehicles={() => setActiveTab("My Vehicles")}
              onBookingsChange={setBookings}
            />
          ) : activeTab === "Profile" ? (
            <Profile
              vehiclesCount={vehicles.length}
              bookingsCount={bookings.length}
              onLogout={handleLogout}
            />
          ) : (
            <>
              {/* Desktop Header Bar with Real-Time Notification Bell */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[#13294b] sm:text-2xl">
                    Welcome back, {displayName}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Track your vehicle service progress, driver status, and
                    repair approvals.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="hidden lg:block">
                    {notificationBellControl}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("Book a Service")}
                    className="rounded-xl bg-orange-700 px-4 py-2.5 text-xs font-bold text-white shadow-2xs transition hover:bg-orange-800"
                  >
                    + Book a Service
                  </button>
                </div>
              </div>

              {approvalFeedback.text && (
                <Alert
                  type={approvalFeedback.type || "success"}
                  message={approvalFeedback.text}
                  onClose={() => setApprovalFeedback({ type: "", text: "" })}
                />
              )}

              {/* Compact KPI Strip */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab("My Vehicles")}
                  className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-2xs transition hover:border-orange-300"
                >
                  <p className="text-xs font-medium text-slate-500">
                    My Vehicles
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-[#13294b]">
                    {vehicles.length}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("My Bookings")}
                  className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-2xs transition hover:border-orange-300"
                >
                  <p className="text-xs font-medium text-slate-500">
                    Active Services
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-blue-700">
                    {stats.activeCount}
                  </p>
                </button>

                {stats.pendingApprovals > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      approvalSectionRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                    className="rounded-2xl border border-amber-300 bg-amber-50/50 p-4 text-left shadow-2xs transition hover:border-amber-400"
                  >
                    <p className="text-xs font-medium text-slate-500">
                      Pending Approvals
                    </p>
                    <p className="mt-1 text-2xl font-extrabold text-amber-700">
                      {stats.pendingApprovals}
                    </p>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab("My Bookings")}
                    className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-2xs transition hover:border-orange-300"
                  >
                    <p className="text-xs font-medium text-slate-500">
                      Service History
                    </p>
                    <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                      {stats.historyCount}
                    </p>
                  </button>
                )}
              </div>

              {/* STATE A: No Active Booking — Clean Normal View (Booking Prompt + Workshop Map Only) */}
              {!activeBooking ? (
                <>
                  <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
                    <div>
                      <h2 className="text-base font-bold text-[#13294b]">
                        Ready for your next vehicle service?
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Book a maintenance package with optional doorstep pickup
                        &amp; return delivery within the Western Province.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {stats.historyCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab("My Bookings")}
                          className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-[#13294b] transition hover:bg-slate-50"
                        >
                          View Service History ({stats.historyCount})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveTab("Book a Service")}
                        className="rounded-xl bg-[#13294b] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#1a3660]"
                      >
                        Book a Service →
                      </button>
                    </div>
                  </section>

                  {/* Full-width Clean Workshop Locations Map */}
                  <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[#13294b]">
                          Our Service Centre
                        </h3>
                        <p className="text-xs text-slate-500">
                          Colombo Main Workshop · Main Service Center, Colombo
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetMap}
                        className="rounded-lg border border-gray-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        Reset Map
                      </button>
                    </div>

                    <div className="relative mx-auto w-full [&_input]:text-xs sm:[&_input]:text-sm [&_.smart-map-container]:max-w-none! [&_.smart-map-container]:gap-2.5! [&_.smart-map-container>div:nth-of-type(2)]:h-72!">
                      <SmartMap
                        resetTrigger={resetCount}
                        shopCoords={[6.9271, 79.8612]}
                        mode="routing"
                        theme="light"
                        showSearchBox={true}
                        showZoomControls={true}
                        osrmUrl="https://router.project-osrm.org/route/v1/driving"
                        onOrderReady={handleOrderReady}
                      />
                    </div>
                  </section>
                </>
              ) : (
                /* STATE B: Active Booking (Pickup / In Workshop / Return Delivery) */
                <>
                  {/* Hero Active Vehicle Status Card */}
                  <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-[#13294b] px-5 py-4 text-white sm:px-6">
                      <div className="flex flex-wrap items-center gap-3">
                        {plateNo && (
                          <span className="rounded-md border-2 border-black bg-yellow-400 px-3 py-1 text-xs font-black tracking-widest text-black uppercase">
                            {plateNo}
                          </span>
                        )}
                        <div>
                          <h2 className="text-base font-bold">
                            {vehicleTitle}
                          </h2>
                          <p className="mt-0.5 text-xs text-slate-300">
                            {packageName} · {formattedBookingDate} at{" "}
                            {activeBooking.serviceTime}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {activeBay?.bayName && isInWorkshopPhase && (
                          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white">
                            {activeBay.bayName} ({activeBay.bayType})
                          </span>
                        )}
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            STAGE_BADGE[pipeline.badgeText] ||
                            "bg-white text-[#13294b]"
                          }`}
                        >
                          {pipeline.badgeText}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6">
                      {/* Horizontal Service Stepper */}
                      <div className="flex items-start overflow-x-auto pb-1">
                        {pipeline.steps.map((label, idx) => {
                          const isDone =
                            pipeline.current >= 0 && idx < pipeline.current;
                          const isCurrent = idx === pipeline.current;
                          const isLast = idx === pipeline.steps.length - 1;

                          return (
                            <div
                              key={label}
                              className={`flex items-start ${isLast ? "" : "flex-1"}`}
                            >
                              <div className="flex w-20 shrink-0 flex-col items-center text-center">
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                    isDone
                                      ? "bg-emerald-600 text-white"
                                      : isCurrent
                                        ? "bg-orange-600 text-white ring-4 ring-orange-100"
                                        : "bg-slate-200 text-slate-400"
                                  }`}
                                >
                                  {isDone ? "✓" : idx + 1}
                                </span>
                                <span
                                  className={`mt-1.5 text-[11px] leading-tight ${
                                    isCurrent
                                      ? "font-bold text-[#13294b]"
                                      : isDone
                                        ? "font-semibold text-emerald-700"
                                        : "text-slate-400"
                                  }`}
                                >
                                  {label}
                                </span>
                              </div>
                              {!isLast && (
                                <span
                                  className={`mt-3.5 h-0.5 min-w-4 flex-1 ${
                                    isDone ? "bg-emerald-500" : "bg-slate-200"
                                  }`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3.5 text-xs">
                        <div className="text-slate-600">
                          {activeBooking.invoice?.totalAmount !== undefined && (
                            <span>
                              {activeBooking.invoice.invoiceStage ===
                              "Finalized"
                                ? "Final Total: "
                                : "Estimated Total: "}
                              <strong className="text-sm text-[#13294b]">
                                Rs.{" "}
                                {Number(
                                  activeBooking.invoice.totalAmount || 0,
                                ).toLocaleString()}
                              </strong>
                              <span className="ml-1.5 text-slate-400">
                                (
                                {activeBooking.invoice.paymentStatus ||
                                  "Unpaid"}
                                )
                              </span>
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("My Bookings")}
                          className="font-bold text-orange-700 hover:underline"
                        >
                          View Full Details →
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* Return Delivery Banner (When Workshop Service Completed & Driver is Returning Vehicle) */}
                  {isReturningPhase && (
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/70 px-5 py-4">
                      <div>
                        <h3 className="text-sm font-bold text-emerald-900">
                          {activePickupStatus === "Out for Return Delivery"
                            ? "Service Completed — Your Vehicle is On Its Way Back!"
                            : "Service Completed — Preparing Return Delivery"}
                        </h3>
                        <p className="mt-0.5 text-xs text-emerald-800">
                          {activePickupStatus === "Out for Return Delivery" &&
                          activeDriver
                            ? `Driver ${activeDriver.name} is returning your ${vehicleTitle} to your location. Track live on the map below.`
                            : "Workshop service has finished. A driver will depart shortly to deliver your vehicle back to you."}
                        </p>
                      </div>
                      {activeDriver?.contactNo && (
                        <a
                          href={`tel:${activeDriver.contactNo}`}
                          className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
                        >
                          Call Driver
                        </a>
                      )}
                    </section>
                  )}

                  {/* Workshop Inspection Notes & Additional Repairs Approval Card (Only during active workshop service) */}
                  {isInWorkshopPhase &&
                    activeBooking.service &&
                    ((activeBooking.service.additionalWorks || []).length > 0 ||
                      activeBooking.service.inspectionNotes) &&
                    (() => {
                      const srv = activeBooking.service;
                      const inv = activeBooking.invoice || {};
                      const works = Array.isArray(srv.additionalWorks)
                        ? srv.additionalWorks
                        : [];
                      const pendingWorks = works.filter(
                        (w) => w.status === "Pending Approval",
                      );

                      return (
                        <section
                          ref={approvalSectionRef}
                          className={`rounded-2xl border p-5 shadow-2xs sm:p-6 ${
                            pendingWorks.length > 0
                              ? "border-amber-300 bg-amber-50/40"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-[#13294b] sm:text-base">
                                Workshop Inspection &amp; Additional Repairs
                              </h3>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Review extra issues or spare parts reported by
                                our technicians and approve or reject each item.
                              </p>
                            </div>
                            {pendingWorks.length > 0 && (
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                                Action Required ({pendingWorks.length})
                              </span>
                            )}
                          </div>

                          {srv.inspectionNotes && (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                              <span className="font-bold text-[#13294b]">
                                Technician Notes:{" "}
                              </span>
                              {srv.inspectionNotes}
                            </div>
                          )}

                          {works.length > 0 && (
                            <div className="mt-3.5 space-y-2.5">
                              {works.map((item) => {
                                const isPending =
                                  item.status === "Pending Approval";
                                const isBusy = respondingItemId === item._id;

                                return (
                                  <div
                                    key={item._id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3.5"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-bold text-[#13294b] sm:text-sm">
                                          {item.title}
                                        </span>
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                          {item.category || "Repair"}
                                        </span>
                                        {!isPending && (
                                          <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                              item.status === "Approved"
                                                ? "bg-emerald-100 text-emerald-800"
                                                : "bg-red-100 text-red-700"
                                            }`}
                                          >
                                            {item.status === "Approved"
                                              ? "✓ Approved"
                                              : "✕ Rejected"}
                                          </span>
                                        )}
                                      </div>
                                      {item.description && (
                                        <p className="mt-1 text-xs text-slate-500">
                                          {item.description}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="text-sm font-extrabold text-[#13294b]">
                                        Rs.{" "}
                                        {Number(
                                          item.estimatedCost || 0,
                                        ).toLocaleString()}
                                      </span>

                                      {isPending && (
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() =>
                                              handleRespondAdditionalWork(
                                                srv._id,
                                                item._id,
                                                "Approved",
                                              )
                                            }
                                            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                                          >
                                            {isBusy ? "..." : "Approve ✓"}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() =>
                                              handleRespondAdditionalWork(
                                                srv._id,
                                                item._id,
                                                "Rejected",
                                              )
                                            }
                                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                                          >
                                            Reject ✕
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {inv.totalAmount !== undefined && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#13294b] px-4 py-3 text-xs text-white">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300">
                                <span>
                                  Package: Rs.{" "}
                                  {Number(
                                    inv.packageCharge || 0,
                                  ).toLocaleString()}
                                </span>
                                {Number(inv.pickupDeliveryCharge || 0) > 0 && (
                                  <span>
                                    Pickup: Rs.{" "}
                                    {Number(
                                      inv.pickupDeliveryCharge || 0,
                                    ).toLocaleString()}
                                  </span>
                                )}
                                <span>
                                  Approved Extras: Rs.{" "}
                                  {Number(
                                    inv.additionalWorkCharge || 0,
                                  ).toLocaleString()}
                                </span>
                              </div>
                              <span className="text-sm font-extrabold text-yellow-300">
                                Total: Rs.{" "}
                                {Number(inv.totalAmount || 0).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </section>
                      );
                    })()}

                  {/* Bottom 2-Column Section: Tracking Map + Context-Relevant Driver / Workshop Details */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
                    {/* Live Route & Driver Tracking Map */}
                    <section className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:p-5 lg:col-span-2">
                      <div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold text-[#13294b]">
                              {isReturningPhase
                                ? "Return Delivery Tracking"
                                : isPickupPhase
                                  ? "Pickup Driver Tracking"
                                  : "Service Route & Workshop Location"}
                            </h3>
                            {driverTrackingConfig?.label && (
                              <p className="text-xs font-medium text-slate-600">
                                <strong className="text-[#13294b]">
                                  {driverTrackingConfig.driverName}
                                </strong>{" "}
                                · {driverTrackingConfig.label}
                              </p>
                            )}
                          </div>
                          {driverTrackingConfig?.routeBadge ? (
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                                driverTrackingConfig.direction === "returning"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : driverTrackingConfig.direction ===
                                      "to-customer"
                                    ? "bg-indigo-100 text-indigo-900"
                                    : driverTrackingConfig.direction ===
                                        "to-workshop"
                                      ? "bg-orange-100 text-orange-900"
                                      : "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {driverTrackingConfig.routeBadge}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={handleResetMap}
                              className="rounded-lg border border-gray-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              Reset Route
                            </button>
                          )}
                        </div>

                        <div className="relative mx-auto w-full [&_input]:text-xs sm:[&_input]:text-sm [&_.smart-map-container]:gap-2.5!">
                          <SmartMap
                            resetTrigger={resetCount}
                            shopCoords={[6.9271, 79.8612]}
                            externalStartPoint={pickupMapCoords}
                            externalEndPoint={workshopMapCoords}
                            driverTracking={driverTrackingConfig}
                            readOnlyRoute={Boolean(driverTrackingConfig)}
                            mapHeight="310px"
                            mode="routing"
                            theme="light"
                            showSearchBox={!driverTrackingConfig}
                            showZoomControls={true}
                            osrmUrl="https://router.project-osrm.org/route/v1/driving"
                            onOrderReady={handleOrderReady}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {routeCoords
                            ? `Route (${routeCoords.startCoords[0].toFixed(4)}, ${routeCoords.startCoords[1].toFixed(4)})`
                            : activeBooking.pickupLocation?.address
                              ? `Address: ${activeBooking.pickupLocation.address}`
                              : "Workshop Drop-off · Colombo"}
                        </span>
                        <span className="font-medium text-slate-700">
                          Main Service Centre, Colombo
                        </span>
                      </div>
                    </section>

                    {/* Right Column: Relevant Driver Details (Pickup/Return) OR Workshop Bay & Updates */}
                    <div className="space-y-4">
                      {/* Show Driver Card whenever Pickup or Return Delivery is active */}
                      {(isPickupPhase || isReturningPhase) && (
                        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:p-5">
                          <h3 className="text-sm font-bold text-[#13294b]">
                            {isReturningPhase
                              ? "Return Delivery Driver"
                              : "Pickup Driver Details"}
                          </h3>

                          {activeDriver ? (
                            <div className="mt-3 space-y-3">
                              <div className="flex items-center gap-3">
                                {activeDriver.photograph ? (
                                  <img
                                    src={activeDriver.photograph}
                                    alt={activeDriver.name}
                                    className="h-12 w-12 shrink-0 rounded-full border border-gray-200 object-cover"
                                  />
                                ) : (
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#13294b] text-sm font-bold text-white">
                                    {(activeDriver.name || "D")
                                      .charAt(0)
                                      .toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold text-[#13294b]">
                                    {activeDriver.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {activeDriver.contactNo}
                                  </p>
                                  {activeDriver.licenseNo && (
                                    <p className="text-[11px] text-slate-400">
                                      License: {activeDriver.licenseNo}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs">
                                <div className="flex justify-between gap-2">
                                  <dt className="text-slate-500">Trip Status</dt>
                                  <dd className="font-bold text-[#13294b]">
                                    {activePickupStatus || "Assigned"}
                                  </dd>
                                </div>
                                {activePickup?.distance > 0 && (
                                  <div className="flex justify-between gap-2">
                                    <dt className="text-slate-500">Distance</dt>
                                    <dd className="font-semibold text-slate-700">
                                      {activePickup.distance} km
                                    </dd>
                                  </div>
                                )}
                                {activeBooking.pickupLocation?.address && (
                                  <div className="border-t border-gray-200 pt-1.5 text-[11px] text-slate-600">
                                    📍 {activeBooking.pickupLocation.address}
                                  </div>
                                )}
                              </dl>

                              {activeDriver.contactNo && (
                                <a
                                  href={`tel:${activeDriver.contactNo}`}
                                  className="block w-full rounded-xl bg-[#13294b] py-2.5 text-center text-xs font-bold text-white transition hover:bg-[#1a3660]"
                                >
                                  Call Driver ({activeDriver.contactNo})
                                </a>
                              )}
                            </div>
                          ) : (
                            <p className="mt-3 rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-slate-500">
                              A driver will be assigned shortly for your vehicle
                              pickup.
                            </p>
                          )}
                        </section>
                      )}

                      {/* Show Service Bay card during active workshop phase */}
                      {isInWorkshopPhase && activeBay?.bayName && (
                        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:p-5">
                          <h3 className="text-sm font-bold text-[#13294b]">
                            Workshop Service Bay
                          </h3>
                          <div className="mt-3 rounded-xl bg-blue-50/70 p-3.5">
                            <p className="text-sm font-bold text-[#13294b]">
                              {activeBay.bayName}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              {activeBay.bayType} Bay · Stage:{" "}
                              <strong>{activeBooking.service?.status}</strong>
                            </p>
                          </div>
                        </section>
                      )}

                      {/* Recent Workshop Updates (Only when logs exist) */}
                      {activeLogs.length > 0 && (
                        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:p-5">
                          <h3 className="text-sm font-bold text-[#13294b]">
                            Recent Updates
                          </h3>
                          <div className="mt-3 space-y-2.5">
                            {[...activeLogs]
                              .reverse()
                              .slice(0, 4)
                              .map((log, idx) => (
                                <div
                                  key={`${log.stage}-${log.updatedAt}-${idx}`}
                                  className="rounded-xl bg-slate-50 px-3 py-2 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        STAGE_BADGE[log.stage] ||
                                        "bg-slate-200 text-slate-700"
                                      }`}
                                    >
                                      {log.stage}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {formatTimeAgo(log.updatedAt)}
                                    </span>
                                  </div>
                                  {log.note && (
                                    <p className="mt-1 text-[11px] text-slate-600">
                                      {log.note}
                                    </p>
                                  )}
                                </div>
                              ))}
                          </div>
                        </section>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-gray-200 bg-white px-2 py-2.5 text-xs lg:hidden">
        {NAV_ITEMS.filter((i) => i.id !== "Book a Service").map((item) => {
          const isActive =
            activeTab === item.id ||
            (item.id === "My Bookings" && activeTab === "Book a Service");
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`rounded-lg px-3 py-1 font-semibold transition ${
                isActive ? "text-orange-700" : "text-slate-500"
              }`}
            >
              {item.id === "Dashboard"
                ? "Home"
                : item.id === "My Vehicles"
                  ? "Vehicles"
                  : item.id === "My Bookings"
                    ? "Bookings"
                    : "Profile"}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default CustomerDashboard;
