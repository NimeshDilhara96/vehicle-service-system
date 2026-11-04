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
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Assign Driver State for today's pickup bookings
  const [assigningAppId, setAssigningAppId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

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

  // Quick inline driver assignment
  const handleAssignDriver = async (appointmentId) => {
    if (!selectedDriverId) {
      setError("Please select an available driver.");
      return;
    }

    setError("");
    setSuccessMsg("");
    setIsAssigning(true);

    try {
      const res = await api.patch(
        `/admin/drivers/${selectedDriverId}/assign-task`,
        { appointmentId },
      );

      if (res.data.success) {
        setSuccessMsg(res.data.message || "Driver assigned successfully.");
        setAssigningAppId(null);
        setSelectedDriverId("");
        setRefreshCount((prev) => prev + 1);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to assign driver.");
    } finally {
      setIsAssigning(false);
    }
  };

  // Cancel booking
  const handleCancelBooking = async (appointmentId) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;

    setError("");
    setSuccessMsg("");
    setCancellingId(appointmentId);

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
        setSuccessMsg("Booking cancelled successfully.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to cancel booking.");
    } finally {
      setCancellingId(null);
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

      // Check if it's today
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

    // Sort upcoming by serviceDate ascending (earliest first)
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
      const brand = `${app.vehicleSnapshot?.brand || ""} ${app.vehicleSnapshot?.modelName || ""}`.toLowerCase();
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

  return (
    <div className="space-y-4">
      {/* Top Header & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            Booking &amp; Schedule Operations
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Monitor today&apos;s active service schedule, dispatch drivers, and plan upcoming bookings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate, customer, phone..."
            className="w-48 sm:w-64 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 outline-none transition focus:border-orange-700"
          />
          <button
            type="button"
            onClick={() => setRefreshCount((c) => c + 1)}
            className="rounded-lg bg-[#13294b] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
          >
            Refresh
          </button>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{successMsg}</Alert>

      {/* Main Operational Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveSubTab("today")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeSubTab === "today"
              ? "border-orange-700 text-orange-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Today&apos;s Schedule</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              activeSubTab === "today"
                ? "bg-orange-100 text-orange-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {categorized.today.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("upcoming")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeSubTab === "upcoming"
              ? "border-orange-700 text-orange-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Upcoming Bookings</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              activeSubTab === "upcoming"
                ? "bg-orange-100 text-orange-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {categorized.upcoming.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("history")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
            activeSubTab === "history"
              ? "border-orange-700 text-orange-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>History &amp; Completed</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              activeSubTab === "history"
                ? "bg-orange-100 text-orange-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {categorized.history.length}
          </span>
        </button>
      </div>

      {/* Today's Operational KPI Highlights (Shown on Today Tab) */}
      {activeSubTab === "today" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xs">
            <p className="text-[11px] font-medium text-slate-500">Today&apos;s Vehicles</p>
            <p className="mt-1 text-xl font-extrabold text-[#13294b]">
              {categorized.today.length}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white p-3.5 shadow-2xs">
            <p className="text-[11px] font-medium text-slate-500">Pickups Pending Driver</p>
            <p className="mt-1 text-xl font-extrabold text-amber-700">
              {categorized.todayPickupsPending}
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-white p-3.5 shadow-2xs">
            <p className="text-[11px] font-medium text-slate-500">In Workshop Service</p>
            <p className="mt-1 text-xl font-extrabold text-blue-700">
              {categorized.todayInWorkshop}
            </p>
          </div>
        </div>
      )}

      {/* Bookings List */}
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-xs text-slate-500 shadow-2xs">
          Loading bookings...
        </div>
      ) : displayedList.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-xs text-slate-500 shadow-2xs">
          {activeSubTab === "today"
            ? "No bookings scheduled for today."
            : activeSubTab === "upcoming"
              ? "No upcoming bookings found."
              : "No historical records found."}
        </div>
      ) : (
        <div className="space-y-3">
          {displayedList.map((app) => {
            const vSnap = app.vehicleSnapshot || {};
            const cust = app.customerId || {};
            const pkg = app.packageId || {};
            const pickup = app.pickupDelivery || null;
            const assignedDriver = pickup?.driverId || null;
            const isToday = formatIsoDate(app.serviceDate) === todayStr;

            return (
              <div
                key={app._id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs transition hover:border-gray-300 sm:flex-row sm:items-center"
              >
                {/* Left: Vehicle Plate, Customer, Schedule & Package */}
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start">
                  {/* Yellow Plate Badge */}
                  <div className="shrink-0">
                    <span className="inline-block rounded-md border-2 border-black bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-widest text-black uppercase shadow-2xs">
                      {vSnap.registrationNo || "Vehicle"}
                    </span>
                    <span className="mt-1 block text-center text-[10px] font-medium text-slate-500">
                      {vSnap.vehicleType || "Car"}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-[#13294b]">
                        {[vSnap.brand, vSnap.modelName].filter(Boolean).join(" ") ||
                          "Registered Vehicle"}
                      </h3>

                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_BADGE[app.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {app.status}
                      </span>

                      {app.requiresPickup ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-900">
                          Pickup &amp; Delivery
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          Workshop Drop-off
                        </span>
                      )}
                    </div>

                    {/* Schedule Date & Slot */}
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {pkg.packageName || "Service Package"}
                      </span>
                      {" · "}
                      <span className="text-orange-700 font-semibold">
                        {isToday ? "Today" : formatDisplayDate(app.serviceDate)} at {app.serviceTime}
                      </span>
                    </p>

                    {/* Customer & Contact Info */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>
                        Customer: <strong className="text-slate-700">{cust.name || "Customer"}</strong>
                      </span>
                      {cust.contactNo && (
                        <span>
                          Tel:{" "}
                          <a
                            href={`tel:${cust.contactNo}`}
                            className="font-semibold text-[#13294b] hover:underline"
                          >
                            {cust.contactNo}
                          </a>
                        </span>
                      )}
                    </div>

                    {/* Pickup Details & Driver Status */}
                    {app.requiresPickup && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {app.pickupLocation?.address && (
                          <span className="text-slate-500 truncate max-w-xs" title={app.pickupLocation.address}>
                            📍 {app.pickupLocation.address}
                          </span>
                        )}

                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            PICKUP_BADGE[pickup?.pickupStatus] ||
                            "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {pickup?.pickupStatus || "Pending Assignment"}
                        </span>

                        {assignedDriver ? (
                          <span className="font-medium text-slate-700">
                            Driver: <strong>{assignedDriver.name}</strong> ({assignedDriver.contactNo})
                          </span>
                        ) : null}
                      </div>
                    )}

                    {/* Workshop Service Indicator */}
                    {app.status === "In Progress" && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                          In Service Bay
                        </span>
                        {onOpenBayControl && (
                          <button
                            type="button"
                            onClick={onOpenBayControl}
                            className="text-[11px] font-semibold text-orange-700 hover:underline"
                          >
                            View in Bay Control →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Price & Operational Actions */}
                <div className="flex shrink-0 flex-col items-end justify-between gap-2.5 border-t border-gray-100 pt-2.5 sm:border-t-0 sm:pt-0">
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-[#13294b]">
                      Rs. {(app.invoice?.totalAmount || pkg.price || 0).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {app.invoice?.paymentStatus || "Unpaid"}
                    </p>
                  </div>

                  {/* Actions for Today's Pickup Bookings */}
                  <div className="flex flex-wrap items-center gap-2">
                    {app.requiresPickup &&
                      !assignedDriver &&
                      app.status !== "Cancelled" &&
                      app.status !== "Completed" && (
                        <>
                          {assigningAppId === app._id ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={selectedDriverId}
                                onChange={(e) => setSelectedDriverId(e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 outline-none"
                              >
                                <option value="">Select Driver</option>
                                {availableDrivers.map((d) => (
                                  <option key={d._id} value={d._id}>
                                    {d.name} ({d.contactNo})
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={isAssigning}
                                onClick={() => handleAssignDriver(app._id)}
                                className="rounded-lg bg-orange-700 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-orange-800 disabled:opacity-50"
                              >
                                {isAssigning ? "..." : "Assign"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setAssigningAppId(null)}
                                className="text-xs text-slate-400 hover:text-slate-600"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningAppId(app._id);
                                setSelectedDriverId("");
                              }}
                              className="rounded-lg bg-[#13294b] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
                            >
                              Assign Driver
                            </button>
                          )}
                        </>
                      )}

                    {app.requiresPickup && onOpenDispatch && (
                      <button
                        type="button"
                        onClick={onOpenDispatch}
                        className="rounded-lg border border-gray-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Dispatch Map
                      </button>
                    )}

                    {app.status === "Confirmed" && (
                      <button
                        type="button"
                        disabled={cancellingId === app._id}
                        onClick={() => handleCancelBooking(app._id)}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      >
                        {cancellingId === app._id ? "Cancelling..." : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ViewBooking;
