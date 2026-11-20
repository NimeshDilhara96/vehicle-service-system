import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import Alert from "../../components/ui/Alert";

const STATUS_BADGE = {
  Confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  "In Progress": "bg-orange-50 text-orange-700 border-orange-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-red-50 text-red-600 border-red-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
};

const PICKUP_BADGE = {
  "Pending Assignment": "bg-amber-50 text-amber-800 border-amber-200",
  "Driver Assigned": "bg-blue-50 text-blue-800 border-blue-200",
  "En Route to Pickup": "bg-indigo-50 text-indigo-800 border-indigo-200",
  "Vehicle Picked Up": "bg-purple-50 text-purple-800 border-purple-200",
  "Delivered to Workshop": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Out for Return Delivery": "bg-orange-50 text-orange-800 border-orange-200",
  "Delivered to Customer": "bg-emerald-100 text-emerald-900 border-emerald-300",
};

const PICKUP_FLOW_STEPS = [
  "Booked",
  "Driver Assigned",
  "En Route",
  "Picked Up",
  "At Workshop",
  "In Service",
  "Completed",
];

const DROPOFF_FLOW_STEPS = ["Booked", "In Service", "Completed"];

const PICKUP_STATUS_TO_STEP = {
  "Pending Assignment": 0,
  "Driver Assigned": 1,
  "En Route to Pickup": 2,
  "Vehicle Picked Up": 3,
  "Delivered to Workshop": 4,
  "Out for Return Delivery": 5,
  "Delivered to Customer": 6,
};

function getBookingProgress(app) {
  const isPickup = Boolean(app.requiresPickup);
  const steps = isPickup ? PICKUP_FLOW_STEPS : DROPOFF_FLOW_STEPS;
  const lastIdx = steps.length - 1;

  let current = 0;
  if (isPickup) {
    current = PICKUP_STATUS_TO_STEP[app.pickupDelivery?.pickupStatus] ?? 0;
    if (app.status === "In Progress") current = Math.max(current, 5);
  } else if (app.status === "In Progress") {
    current = 1;
  }
  if (app.status === "Completed") current = lastIdx;

  return { steps, current, isCancelled: app.status === "Cancelled" };
}

function formatIsoDate(dateVal) {
  if (!dateVal) return "";
  try {
    return new Date(dateVal).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function formatDisplayDate(dateVal) {
  if (!dateVal) return "N/A";
  try {
    return new Date(dateVal).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
}

function ViewBooking({ onOpenDispatch, onOpenBayControl }) {
  const [activeSubTab, setActiveSubTab] = useState("today"); // 'today' | 'upcoming' | 'history'
  const [appointments, setAppointments] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [availableBays, setAvailableBays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Popup Modal State
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedBayId, setSelectedBayId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [modalFeedback, setModalFeedback] = useState({ type: "", text: "" });

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    api
      .get("/appointments/admin", { signal: controller.signal })
      .then((res) => {
        if (isMounted && res.data.success) {
          setAppointments(res.data.appointments || []);
          setAvailableDrivers(res.data.availableDrivers || []);
          setAvailableBays(res.data.availableBays || []);
          setError("");
        }
      })
      .catch((err) => {
        if (
          isMounted &&
          err.name !== "CanceledError" &&
          err.code !== "ERR_CANCELED"
        ) {
          setError(
            err.response?.data?.message || "Failed to load appointments.",
          );
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [refreshCount]);

  const openBookingModal = (app) => {
    setSelectedAppId(app._id);
    setSelectedDriverId(availableDrivers[0]?._id || "");
    setSelectedBayId(availableBays[0]?._id || "");
    setConfirmCancel(false);
    setModalFeedback({ type: "", text: "" });
  };

  const closeBookingModal = () => {
    if (isAssigning || isReceiving || isCancelling) return;
    setSelectedAppId(null);
    setConfirmCancel(false);
    setModalFeedback({ type: "", text: "" });
  };

  // Assign Driver inside Popup Modal
  const handleAssignDriver = async (appointmentId) => {
    if (!selectedDriverId) {
      setModalFeedback({
        type: "error",
        text: "Please select an available driver.",
      });
      return;
    }

    setModalFeedback({ type: "", text: "" });
    setError("");
    setSuccessMsg("");
    setIsAssigning(true);

    try {
      const res = await api.patch(
        `/admin/drivers/${selectedDriverId}/assign-task`,
        { appointmentId },
      );

      if (res.data.success) {
        const msg = res.data.message || "Driver assigned successfully.";
        setModalFeedback({ type: "success", text: msg });
        setSuccessMsg(msg);
        setSelectedDriverId("");
        setRefreshCount((prev) => prev + 1);
      }
    } catch (err) {
      setModalFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to assign driver.",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  // Mark Vehicle Received & Allocate Selected Service Bay inside Popup Modal
  const handleReceiveAndAssignBay = async (appointmentId) => {
    if (!selectedBayId) {
      setModalFeedback({
        type: "error",
        text: "Please select an available Service Bay.",
      });
      return;
    }

    setModalFeedback({ type: "", text: "" });
    setError("");
    setSuccessMsg("");
    setIsReceiving(true);

    try {
      const res = await api.patch(
        `/appointments/admin/${appointmentId}/status`,
        {
          status: "In Progress",
          bayId: selectedBayId,
        },
      );

      if (res.data.success) {
        const msg =
          "Vehicle marked as Received and allocated to the selected Service Bay!";
        setModalFeedback({ type: "success", text: msg });
        setSuccessMsg(msg);
        setSelectedBayId("");
        setRefreshCount((prev) => prev + 1);
      }
    } catch (err) {
      setModalFeedback({
        type: "error",
        text:
          err.response?.data?.message ||
          "Failed to mark vehicle as received in service bay.",
      });
    } finally {
      setIsReceiving(false);
    }
  };

  // Cancel booking inside Popup Modal (with inline confirmation)
  const handleCancelBooking = async (appointmentId) => {
    setModalFeedback({ type: "", text: "" });
    setError("");
    setSuccessMsg("");
    setIsCancelling(true);

    try {
      const res = await api.patch(
        `/appointments/admin/${appointmentId}/status`,
        { status: "Cancelled" },
      );

      if (res.data.success) {
        setAppointments((prev) =>
          prev.map((app) =>
            app._id === appointmentId ? { ...app, status: "Cancelled" } : app,
          ),
        );
        setConfirmCancel(false);
        setSuccessMsg("Booking cancelled successfully.");
        setModalFeedback({
          type: "success",
          text: "Booking cancelled successfully.",
        });
      }
    } catch (err) {
      setModalFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to cancel booking.",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // Group appointments into Today, Upcoming, and History
  const categorized = useMemo(() => {
    const todayList = [];
    const upcomingList = [];
    const historyList = [];

    let todayPickupsPending = 0;
    let todayInWorkshop = 0;

    for (const app of appointments) {
      const appDateStr = formatIsoDate(app.serviceDate);

      const isToday =
        appDateStr === todayStr ||
        (app.status === "In Progress" && app.status !== "Completed");

      if (isToday && app.status !== "Completed" && app.status !== "Cancelled") {
        todayList.push(app);
        if (
          app.requiresPickup &&
          (!app.pickupDelivery?.driverId ||
            app.pickupDelivery?.pickupStatus === "Pending Assignment")
        ) {
          todayPickupsPending += 1;
        }
        if (app.status === "In Progress") {
          todayInWorkshop += 1;
        }
      } else if (
        appDateStr > todayStr &&
        app.status !== "Completed" &&
        app.status !== "Cancelled"
      ) {
        upcomingList.push(app);
      } else {
        historyList.push(app);
      }
    }

    upcomingList.sort(
      (a, b) => new Date(a.serviceDate || 0) - new Date(b.serviceDate || 0),
    );

    return {
      today: todayList,
      upcoming: upcomingList,
      history: historyList,
      todayPickupsPending,
      todayInWorkshop,
    };
  }, [appointments, todayStr]);

  // Filter list by search query
  const displayedList = useMemo(() => {
    let list;
    if (activeSubTab === "today") {
      list = categorized.today;
    } else if (activeSubTab === "upcoming") {
      list = categorized.upcoming;
    } else {
      list = categorized.history;
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;

    return list.filter((app) => {
      const reg = (app.vehicleSnapshot?.registrationNo || "").toLowerCase();
      const brand =
        `${app.vehicleSnapshot?.brand || ""} ${app.vehicleSnapshot?.modelName || ""}`.toLowerCase();
      const customer = (app.customerId?.name || "").toLowerCase();
      const phone = (app.customerId?.contactNo || "").toLowerCase();
      const pkg = (app.packageId?.packageName || "").toLowerCase();
      return (
        reg.includes(q) ||
        brand.includes(q) ||
        customer.includes(q) ||
        phone.includes(q) ||
        pkg.includes(q)
      );
    });
  }, [categorized, activeSubTab, search]);

  const activeApp = useMemo(
    () => appointments.find((a) => a._id === selectedAppId) || null,
    [appointments, selectedAppId],
  );

  return (
    <div className="space-y-5">
      {/* Top Header & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            Appointments &amp; Bookings
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Click any appointment row to inspect full details, assign drivers,
            or receive vehicles into a service bay.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate, customer, phone..."
            className="w-48 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none transition focus:border-orange-700 sm:w-64"
          />
          <button
            type="button"
            onClick={() => setRefreshCount((c) => c + 1)}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#13294b] transition hover:bg-slate-50"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <Alert type="error" message={error} onClose={() => setError("")} />
      )}
      {successMsg && (
        <Alert
          type="success"
          message={successMsg}
          onClose={() => setSuccessMsg("")}
        />
      )}

      {/* Main Operational Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          {
            id: "today",
            label: "Today's Schedule",
            count: categorized.today.length,
          },
          {
            id: "upcoming",
            label: "Upcoming Bookings",
            count: categorized.upcoming.length,
          },
          {
            id: "history",
            label: "History & Completed",
            count: categorized.history.length,
          },
        ].map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
                isActive
                  ? "border-orange-700 text-orange-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  isActive
                    ? "bg-orange-100 text-orange-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Today's Operational KPI Highlights */}
      {activeSubTab === "today" && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-medium text-slate-500">
              Today&apos;s Vehicles
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[#13294b]">
              {categorized.today.length}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-medium text-slate-500">
              Pending Driver
            </p>
            <p className="mt-1 text-2xl font-extrabold text-amber-700">
              {categorized.todayPickupsPending}
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-medium text-slate-500">In Workshop</p>
            <p className="mt-1 text-2xl font-extrabold text-blue-700">
              {categorized.todayInWorkshop}
            </p>
          </div>
        </div>
      )}

      {/* Clean Clickable Appointment Bars */}
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
          Loading appointments...
        </div>
      ) : displayedList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-slate-500 shadow-2xs">
          {activeSubTab === "today"
            ? "No bookings scheduled for today."
            : activeSubTab === "upcoming"
              ? "No upcoming bookings found."
              : "No historical records found."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayedList.map((app) => {
            const vSnap = app.vehicleSnapshot || {};
            const cust = app.customerId || {};
            const pkg = app.packageId || {};
            const pickup = app.pickupDelivery || null;
            const assignedDriver = pickup?.driverId || null;
            const isToday = formatIsoDate(app.serviceDate) === todayStr;
            const progress = getBookingProgress(app);

            const needsDriver =
              app.requiresPickup &&
              !assignedDriver &&
              app.status !== "Cancelled" &&
              app.status !== "Completed";

            const readyForBay =
              app.status === "Confirmed" &&
              (!app.requiresPickup ||
                pickup?.pickupStatus === "Delivered to Workshop");

            const vehicleTitle =
              [vSnap.brand, vSnap.modelName].filter(Boolean).join(" ") ||
              vSnap.vehicleType ||
              "Registered Vehicle";

            let leftAccent = "border-l-slate-300";
            if (app.status === "Cancelled") leftAccent = "border-l-red-400";
            else if (app.status === "Completed")
              leftAccent = "border-l-emerald-500";
            else if (app.status === "In Progress")
              leftAccent = "border-l-blue-600";
            else if (readyForBay) leftAccent = "border-l-emerald-500";
            else if (needsDriver) leftAccent = "border-l-amber-500";

            return (
              <div
                key={app._id}
                role="button"
                tabIndex={0}
                onClick={() => openBookingModal(app)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openBookingModal(app);
                  }
                }}
                className={`group cursor-pointer overflow-hidden rounded-xl border border-gray-200 border-l-4 ${leftAccent} bg-white shadow-2xs transition hover:border-orange-300 hover:shadow-sm focus:ring-2 focus:ring-orange-400 focus:outline-none`}
              >
                {/* Top Main Horizontal Bar */}
                <div className="flex flex-col gap-3 px-4 py-3 transition group-hover:bg-orange-50/20 lg:flex-row lg:items-center lg:justify-between">
                  {/* Left: Plate + Vehicle + Package & Customer */}
                  <div className="flex min-w-0 flex-1 items-center gap-3.5">
                    <span className="shrink-0 rounded border-2 border-black bg-yellow-400 px-2.5 py-1 text-xs font-extrabold tracking-widest text-black uppercase">
                      {vSnap.registrationNo || "Vehicle"}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-[#13294b] group-hover:text-orange-700">
                          {vehicleTitle}
                        </h3>
                        <span className="hidden text-slate-300 sm:inline">
                          ·
                        </span>
                        <span className="truncate text-xs font-medium text-slate-600">
                          {pkg.packageName || "Service Package"}
                        </span>
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">
                          {cust.name || "Customer"}
                        </span>
                        <span>·</span>
                        <span className="font-semibold text-orange-700">
                          {isToday ? "Today" : formatDisplayDate(app.serviceDate)}{" "}
                          at {app.serviceTime}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            app.requiresPickup
                              ? "bg-orange-50 text-orange-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {app.requiresPickup ? "Pickup" : "Drop-off"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Action Tag, Status Badge, Price & Open Cue */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-2 lg:shrink-0 lg:justify-end lg:border-t-0 lg:pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {needsDriver && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" />
                          Assign Driver
                        </span>
                      )}
                      {readyForBay && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
                          Select Bay
                        </span>
                      )}
                      {app.status === "In Progress" && (
                        <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-900">
                          {app.service?.status || "Inspection"} ·{" "}
                          {app.service?.bayId?.bayName || "Bay"}
                        </span>
                      )}

                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                          STATUS_BADGE[app.status] ||
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs font-extrabold text-[#13294b]">
                          Rs.{" "}
                          {(
                            app.invoice?.totalAmount ||
                            pkg.price ||
                            0
                          ).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {app.invoice?.paymentStatus || "Unpaid"}
                        </p>
                      </div>

                      <span className="text-sm font-bold text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-orange-700">
                        →
                      </span>
                    </div>
                  </div>
                </div>

                {/* Booking Progress Timeline Below the Bar */}
                <div className="border-t border-gray-100 bg-slate-50/70 px-4 py-2.5">
                  {progress.isCancelled ? (
                    <p className="text-[11px] font-semibold text-red-600">
                      ✕ This booking was cancelled
                    </p>
                  ) : (
                    <div className="flex items-start overflow-x-auto">
                      {progress.steps.map((label, idx) => {
                        const isDone = idx < progress.current;
                        const isCurrent = idx === progress.current;
                        const isLast = idx === progress.steps.length - 1;
                        return (
                          <div
                            key={label}
                            className={`flex items-start ${isLast ? "" : "flex-1"}`}
                          >
                            <div className="flex w-16 shrink-0 flex-col items-center text-center">
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                  isDone
                                    ? "bg-emerald-600 text-white"
                                    : isCurrent
                                      ? "bg-orange-700 text-white ring-4 ring-orange-100"
                                      : "bg-slate-200 text-slate-400"
                                }`}
                              >
                                {isDone ? "✓" : idx + 1}
                              </span>
                              <span
                                className={`mt-1 text-[10px] leading-tight ${
                                  isCurrent
                                    ? "font-bold text-orange-700"
                                    : isDone
                                      ? "font-medium text-emerald-700"
                                      : "text-slate-400"
                                }`}
                              >
                                {label}
                              </span>
                            </div>
                            {!isLast && (
                              <span
                                className={`mt-2.5 h-0.5 min-w-4 flex-1 ${
                                  isDone ? "bg-emerald-500" : "bg-slate-200"
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Appointment Details & Operations Popup Modal */}
      {activeApp &&
        (() => {
          const vSnap = activeApp.vehicleSnapshot || {};
          const cust = activeApp.customerId || {};
          const pkg = activeApp.packageId || {};
          const pickup = activeApp.pickupDelivery || null;
          const assignedDriver = pickup?.driverId || null;
          const isToday = formatIsoDate(activeApp.serviceDate) === todayStr;
          const progress = getBookingProgress(activeApp);

          const vehicleTitle =
            [vSnap.brand, vSnap.modelName].filter(Boolean).join(" ") ||
            vSnap.vehicleType ||
            "Registered Vehicle";

          const needsDriver =
            activeApp.requiresPickup &&
            !assignedDriver &&
            activeApp.status !== "Cancelled" &&
            activeApp.status !== "Completed";

          const readyForBay =
            activeApp.status === "Confirmed" &&
            (!activeApp.requiresPickup ||
              pickup?.pickupStatus === "Delivered to Workshop");

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:p-5"
              onClick={closeBookingModal}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                {/* Sticky Navy Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#13294b] px-5 py-4 text-white sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-md border-2 border-black bg-yellow-400 px-3 py-1 text-sm font-black tracking-widest text-black uppercase shadow-xs">
                      {vSnap.registrationNo || "N/A"}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold sm:text-lg">
                          {vehicleTitle}
                        </h2>
                        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">
                          {vSnap.vehicleType || "Vehicle"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-300">
                        {isToday
                          ? "Today"
                          : formatDisplayDate(activeApp.serviceDate)}{" "}
                        at {activeApp.serviceTime} ·{" "}
                        {activeApp.requiresPickup
                          ? "Pickup & Delivery"
                          : "Workshop Drop-off"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        STATUS_BADGE[activeApp.status] ||
                        "bg-white text-[#13294b]"
                      }`}
                    >
                      {activeApp.status}
                    </span>
                    <button
                      type="button"
                      onClick={closeBookingModal}
                      disabled={isAssigning || isReceiving || isCancelling}
                      aria-label="Close booking details modal"
                      className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-white/20 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                  {modalFeedback.text && (
                    <Alert
                      type={modalFeedback.type || "success"}
                      message={modalFeedback.text}
                      onClose={() => setModalFeedback({ type: "", text: "" })}
                    />
                  )}

                  {/* Section 1: Booking, Pricing & Customer Info */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Package & Invoice Summary */}
                    <div className="rounded-xl border border-gray-200 bg-slate-50/70 p-4">
                      <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                        Service Package &amp; Billing
                      </p>
                      <dl className="mt-2.5 space-y-1.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Package</dt>
                          <dd className="text-right font-semibold text-[#13294b]">
                            {pkg.packageName || "Service Package"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Package Price</dt>
                          <dd className="font-medium text-slate-800">
                            Rs. {(pkg.price || 0).toLocaleString()}
                          </dd>
                        </div>
                        {activeApp.requiresPickup && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500">Pickup &amp; Delivery</dt>
                            <dd className="font-medium text-slate-800">
                              Rs.{" "}
                              {(
                                activeApp.invoice?.pickupDeliveryCharge ||
                                pickup?.charge ||
                                0
                              ).toLocaleString()}
                              {pickup?.distance ? ` (${pickup.distance} km)` : ""}
                            </dd>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-2">
                          <dt className="font-bold text-[#13294b]">Total</dt>
                          <dd className="flex items-center gap-2 font-extrabold text-[#13294b]">
                            <span>
                              Rs.{" "}
                              {(
                                activeApp.invoice?.totalAmount ||
                                pkg.price ||
                                0
                              ).toLocaleString()}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                activeApp.invoice?.paymentStatus === "Paid"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {activeApp.invoice?.paymentStatus || "Unpaid"}
                            </span>
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* Customer & Logistics Info */}
                    <div className="space-y-3">
                      <div className="rounded-xl border border-gray-200 bg-slate-50/70 p-4">
                        <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                          Customer Details
                        </p>
                        <p className="mt-1.5 text-sm font-bold text-[#13294b]">
                          {cust.name || "Customer"}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          {cust.contactNo ? (
                            <a
                              href={`tel:${cust.contactNo}`}
                              className="font-semibold text-[#13294b] hover:underline"
                            >
                              {cust.contactNo}
                            </a>
                          ) : (
                            <span>No phone</span>
                          )}
                          <span>·</span>
                          <span>{cust.email || "No email"}</span>
                        </div>
                      </div>

                      {activeApp.requiresPickup && (
                        <div className="rounded-xl border border-gray-200 bg-slate-50/70 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                              Pickup &amp; Driver
                            </p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                PICKUP_BADGE[pickup?.pickupStatus] ||
                                "border-amber-200 bg-amber-50 text-amber-800"
                              }`}
                            >
                              {pickup?.pickupStatus || "Pending Assignment"}
                            </span>
                          </div>
                          {activeApp.pickupLocation?.address && (
                            <p className="mt-1.5 text-xs text-slate-600">
                              📍 {activeApp.pickupLocation.address}
                            </p>
                          )}
                          {assignedDriver ? (
                            <p className="mt-1 text-xs font-semibold text-[#13294b]">
                              Driver: {assignedDriver.name} (
                              {assignedDriver.contactNo})
                            </p>
                          ) : (
                            <p className="mt-1 text-xs font-medium text-amber-700">
                              No driver assigned yet.
                            </p>
                          )}
                          {onOpenDispatch && (
                            <button
                              type="button"
                              onClick={() => {
                                closeBookingModal();
                                onOpenDispatch();
                              }}
                              className="mt-2 text-xs font-bold text-orange-700 hover:underline"
                            >
                              Open Live Dispatch Map →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 2: Booking Progress Timeline */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-3 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                      Booking Progress
                    </p>
                    {progress.isCancelled ? (
                      <p className="text-xs font-semibold text-red-600">
                        ✕ This booking was cancelled.
                      </p>
                    ) : (
                      <div className="flex items-start overflow-x-auto pb-1">
                        {progress.steps.map((label, idx) => {
                          const isDone = idx < progress.current;
                          const isCurrent = idx === progress.current;
                          const isLast = idx === progress.steps.length - 1;
                          return (
                            <div
                              key={label}
                              className={`flex items-start ${isLast ? "" : "flex-1"}`}
                            >
                              <div className="flex w-16 shrink-0 flex-col items-center text-center">
                                <span
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                                    isDone
                                      ? "bg-emerald-600 text-white"
                                      : isCurrent
                                        ? "bg-orange-700 text-white ring-4 ring-orange-100"
                                        : "bg-slate-200 text-slate-400"
                                  }`}
                                >
                                  {isDone ? "✓" : idx + 1}
                                </span>
                                <span
                                  className={`mt-1.5 text-[10px] leading-tight ${
                                    isCurrent
                                      ? "font-bold text-orange-700"
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
                                  className={`mt-3 h-0.5 min-w-4 flex-1 ${
                                    isDone ? "bg-emerald-500" : "bg-slate-200"
                                  }`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Section 3: Active Workshop Service Banner */}
                  {activeApp.status === "In Progress" && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                      <div>
                        <p className="text-[11px] font-bold tracking-wider text-blue-700 uppercase">
                          Currently in Workshop Service
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-[#13294b]">
                          {activeApp.service?.status || "Inspection"} ·{" "}
                          {activeApp.service?.bayId?.bayName || "Service Bay"}
                        </p>
                      </div>
                      {onOpenBayControl && (
                        <button
                          type="button"
                          onClick={() => {
                            closeBookingModal();
                            onOpenBayControl();
                          }}
                          className="rounded-lg bg-[#13294b] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#1a3660]"
                        >
                          Manage in Service Bay →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Section 4: Assign Driver (when pickup needs driver) */}
                  {needsDriver && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                      <p className="text-xs font-bold text-[#13294b]">
                        Assign Pickup Driver
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        Select an available driver to dispatch for this
                        vehicle&apos;s pickup.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select
                          value={selectedDriverId}
                          onChange={(e) => setSelectedDriverId(e.target.value)}
                          className="min-w-[220px] flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-orange-700"
                        >
                          <option value="">Select Available Driver...</option>
                          {availableDrivers.map((d) => (
                            <option key={d._id} value={d._id}>
                              {d.name} ({d.contactNo})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={isAssigning || !selectedDriverId}
                          onClick={() => handleAssignDriver(activeApp._id)}
                          className="rounded-lg bg-[#13294b] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#1a3660] disabled:opacity-50"
                        >
                          {isAssigning ? "Assigning..." : "Assign Driver"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Section 5: Receive Vehicle & Select Service Bay */}
                  {readyForBay && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                      <p className="text-xs font-bold text-[#13294b]">
                        Receive Vehicle &amp; Allocate Service Bay
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        Choose an available bay to check this vehicle in and
                        start Inspection.
                      </p>
                      {availableBays.length === 0 ? (
                        <p className="mt-2 text-xs font-semibold text-red-600">
                          All service bays are currently occupied. Complete an
                          active service to free a bay.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {availableBays.map((bay) => {
                              const isSelected = selectedBayId === bay._id;
                              return (
                                <button
                                  key={bay._id}
                                  type="button"
                                  onClick={() => setSelectedBayId(bay._id)}
                                  className={`rounded-xl border px-3 py-2 text-left transition ${
                                    isSelected
                                      ? "border-emerald-700 bg-emerald-700 text-white shadow-xs"
                                      : "border-gray-300 bg-white text-[#13294b] hover:border-emerald-500"
                                  }`}
                                >
                                  <p className="text-xs font-bold">
                                    {bay.bayName}
                                  </p>
                                  <p
                                    className={`text-[10px] ${
                                      isSelected
                                        ? "text-emerald-100"
                                        : "text-slate-500"
                                    }`}
                                  >
                                    {bay.bayType}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            disabled={isReceiving || !selectedBayId}
                            onClick={() =>
                              handleReceiveAndAssignBay(activeApp._id)
                            }
                            className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {isReceiving
                              ? "Checking In..."
                              : "Confirm Vehicle Received & Start Inspection ✓"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer Actions (Cancel Booking / Close) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                    {activeApp.status === "Confirmed" ? (
                      confirmCancel ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-red-700">
                            Cancel this booking?
                          </span>
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() => handleCancelBooking(activeApp._id)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {isCancelling ? "Cancelling..." : "Yes, Cancel"}
                          </button>
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() => setConfirmCancel(false)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Keep
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(true)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          Cancel Booking
                        </button>
                      )
                    ) : (
                      <div />
                    )}

                    <button
                      type="button"
                      onClick={closeBookingModal}
                      disabled={isAssigning || isReceiving || isCancelling}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

export default ViewBooking;
