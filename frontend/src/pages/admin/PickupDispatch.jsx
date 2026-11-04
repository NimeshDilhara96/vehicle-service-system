import { memo, useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import Alert from "../../components/ui/Alert";

const PICKUP_STATUS_STYLES = {
  "Pending Assignment": "bg-amber-50 text-amber-800 border-amber-200",
  "Driver Assigned": "bg-blue-50 text-blue-800 border-blue-200",
  "En Route to Pickup": "bg-indigo-50 text-indigo-800 border-indigo-200",
  "Vehicle Picked Up": "bg-purple-50 text-purple-800 border-purple-200",
  "Delivered to Workshop": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Out for Return Delivery": "bg-orange-50 text-orange-800 border-orange-200",
  "Delivered to Customer": "bg-emerald-100 text-emerald-900 border-emerald-300",
};

const NEXT_PICKUP_ACTION = {
  "Driver Assigned": {
    nextStatus: "En Route to Pickup",
    label: "Mark En Route",
    btnClass: "bg-indigo-700 hover:bg-indigo-800 text-white",
  },
  "En Route to Pickup": {
    nextStatus: "Vehicle Picked Up",
    label: "Mark Vehicle Picked Up",
    btnClass: "bg-purple-700 hover:bg-purple-800 text-white",
  },
  "Vehicle Picked Up": {
    nextStatus: "Delivered to Workshop",
    label: "Delivered to Workshop (Start Service)",
    btnClass: "bg-orange-700 hover:bg-orange-800 text-white",
  },
  "Delivered to Workshop": {
    nextStatus: "Out for Return Delivery",
    label: "Send Out for Return Delivery",
    btnClass: "bg-[#13294b] hover:bg-[#1a3660] text-white",
  },
  "Out for Return Delivery": {
    nextStatus: "Delivered to Customer",
    label: "Complete Return Delivery",
    btnClass: "bg-emerald-700 hover:bg-emerald-800 text-white",
  },
};

const POLL_INTERVAL_MS = 10000;

const DispatchItemCard = memo(function DispatchItemCard({
  booking,
  todayDateStr,
  availableDrivers,
  assigningId,
  updatingTaskId,
  onAssignDriver,
  onUpdatePickupStatus,
}) {
  const snapshot = booking.vehicleSnapshot || {};
  const customer = booking.customerId || {};
  const pkg = booking.packageId || {};
  const pickup = booking.pickupDelivery || {};
  const service = booking.service || null;
  const assignedDriver = pickup.driverId || null;

  const [selectedDriverId, setSelectedDriverId] = useState(
    assignedDriver?._id || "",
  );

  const bookingDateIso = booking.serviceDate
    ? new Date(booking.serviceDate).toISOString().split("T")[0]
    : "";
  const isToday = bookingDateIso === todayDateStr;

  const formattedServiceDate = booking.serviceDate
    ? new Date(booking.serviceDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "N/A";

  const pickupStatus = pickup.pickupStatus || "Pending Assignment";
  const pickupBadgeStyle =
    PICKUP_STATUS_STYLES[pickupStatus] ||
    "bg-slate-100 text-slate-700 border-slate-200";

  const nextAction = NEXT_PICKUP_ACTION[pickupStatus] || null;
  const isBusy =
    assigningId === booking._id ||
    (pickup._id && updatingTaskId === pickup._id);
  const effectiveDriverId = selectedDriverId || assignedDriver?._id || "";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs transition hover:border-gray-300 sm:p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        {/* Left: Plate + Vehicle, Customer & Pickup Location */}
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex shrink-0 flex-col items-start">
            <span className="inline-block rounded-md border-2 border-black bg-yellow-400 px-3.5 py-1 text-xs font-extrabold tracking-widest text-black uppercase shadow-2xs">
              {snapshot.registrationNo || "N/A"}
            </span>
            <span className="mt-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
              {snapshot.vehicleType || "Vehicle"}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-[#13294b]">
                {[snapshot.brand, snapshot.modelName]
                  .filter(Boolean)
                  .join(" ") || "Registered Vehicle"}
              </h3>

              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pickupBadgeStyle}`}
              >
                {pickupStatus}
              </span>

              {isToday && pickupStatus !== "Delivered to Customer" && (
                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  Today
                </span>
              )}

              {service && (
                <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-800">
                  Service: {service.status}
                </span>
              )}
            </div>

            <p className="text-xs font-medium text-slate-700">
              <span className="font-semibold text-[#13294b]">
                {pkg.packageName || "Service Package"}
              </span>{" "}
              · Pickup Time:{" "}
              <span className="font-semibold text-orange-700">
                {formattedServiceDate} at {booking.serviceTime}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>
                Customer:{" "}
                <strong className="text-slate-700">
                  {customer.name || "Customer"}
                </strong>
              </span>
              {customer.contactNo && (
                <span>
                  Tel:{" "}
                  <a
                    href={`tel:${customer.contactNo}`}
                    className="font-semibold text-[#13294b] hover:underline"
                  >
                    {customer.contactNo}
                  </a>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600">
              Pickup Location:{" "}
              <strong className="text-[#13294b]">
                {pickup.pickupLocation?.address ||
                  booking.pickupLocation?.address ||
                  "Pinned Map Location"}
              </strong>
              {pickup.distance ? (
                <span className="ml-1.5 text-[11px] text-slate-500">
                  ({pickup.distance} km · Rs.{" "}
                  {(pickup.charge || 0).toLocaleString()})
                </span>
              ) : null}
            </p>

            {assignedDriver && (
              <div className="pt-0.5 text-xs text-slate-600">
                Assigned Driver:{" "}
                <strong className="text-[#13294b]">
                  {assignedDriver.name}
                </strong>{" "}
                <span className="text-[11px] text-slate-500">
                  ({assignedDriver.licenseNo} · {assignedDriver.contactNo})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Driver Selector + Live Dispatch Action Button */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-gray-100 pt-3 lg:flex-col lg:items-end lg:justify-center lg:border-t-0 lg:pt-0">
          {pickupStatus !== "Delivered to Customer" && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Select Driver"
                value={effectiveDriverId}
                disabled={isBusy}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="rounded-lg border border-gray-300 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-[#13294b] outline-none focus:border-orange-700"
              >
                <option value="">
                  Select Driver ({availableDrivers.length})
                </option>
                {availableDrivers.map((drv) => (
                  <option key={drv._id} value={drv._id}>
                    {drv.name} ({drv.licenseNo})
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!effectiveDriverId || isBusy}
                onClick={() => onAssignDriver(booking._id, effectiveDriverId)}
                className="rounded-lg bg-[#13294b] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a3660] disabled:opacity-50"
              >
                {assigningId === booking._id
                  ? "Assigning..."
                  : assignedDriver
                    ? "Change Driver"
                    : "Assign Driver"}
              </button>
            </div>
          )}

          {nextAction && pickup._id && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onUpdatePickupStatus(
                  booking._id,
                  pickup._id,
                  nextAction.nextStatus,
                )
              }
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold shadow-2xs transition disabled:opacity-50 ${nextAction.btnClass}`}
            >
              {updatingTaskId === pickup._id
                ? "Updating..."
                : nextAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function PickupDispatch() {
  const [appointments, setAppointments] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [assigningId, setAssigningId] = useState(null);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filter States
  const [viewFilter, setViewFilter] = useState("All"); // 'All' | 'TodayNeedsDriver' | 'Ongoing' | 'Upcoming' | 'Completed'
  const [searchInput, setSearchInput] = useState("");

  const todayDateStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchDispatchData = (silent = false) => {
      api
        .get("/appointments/admin", { signal: controller.signal })
        .then((res) => {
          if (isMounted && res.data.success) {
            setAppointments(res.data.appointments || []);
            if (Array.isArray(res.data.availableDrivers)) {
              setAvailableDrivers(res.data.availableDrivers);
            }
            setError("");
          }
        })
        .catch((err) => {
          if (
            isMounted &&
            err.name !== "CanceledError" &&
            err.code !== "ERR_CANCELED" &&
            !silent
          ) {
            setError(
              err.response?.data?.message ||
                "Failed to load pickup dispatch data.",
            );
          }
        })
        .finally(() => {
          if (isMounted) {
            setLoading(false);
            setIsRefreshing(false);
          }
        });
    };

    fetchDispatchData(false);

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchDispatchData(true);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      controller.abort();
    };
  }, [refreshCount]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setRefreshCount((prev) => prev + 1);
  };

  const handleAssignDriver = useCallback(async (appointmentId, driverId) => {
    if (!driverId) return;
    setError("");
    setSuccessMsg("");
    setAssigningId(appointmentId);

    try {
      const res = await api.patch(`/admin/drivers/${driverId}/assign-task`, {
        appointmentId,
      });

      if (res.data.success && res.data.pickupDelivery) {
        setAppointments((prev) =>
          prev.map((app) =>
            app._id === appointmentId
              ? { ...app, pickupDelivery: res.data.pickupDelivery }
              : app,
          ),
        );
        setSuccessMsg(res.data.message || "Driver assigned successfully.");
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to assign driver to pickup.",
      );
    } finally {
      setAssigningId(null);
    }
  }, []);

  const handleUpdatePickupStatus = useCallback(
    async (appointmentId, taskId, nextStatus) => {
      setError("");
      setSuccessMsg("");
      setUpdatingTaskId(taskId);

      try {
        const res = await api.patch(`/admin/drivers/tasks/${taskId}/status`, {
          pickupStatus: nextStatus,
        });

        if (res.data.success && res.data.task) {
          setAppointments((prev) =>
            prev.map((app) => {
              if (app._id !== appointmentId) return app;
              const nextAppStatus =
                nextStatus === "Delivered to Workshop"
                  ? "In Progress"
                  : nextStatus === "Delivered to Customer"
                    ? "Completed"
                    : app.status;
              return {
                ...app,
                status: nextAppStatus,
                pickupDelivery: res.data.task,
              };
            }),
          );
          setSuccessMsg(
            res.data.message || `Pickup status updated to "${nextStatus}".`,
          );
        }
      } catch (err) {
        setError(
          err.response?.data?.message || "Failed to update pickup status.",
        );
      } finally {
        setUpdatingTaskId(null);
      }
    },
    [],
  );

  // Only Confirmed / In Progress / Completed Pickup bookings appear in Dispatch
  const acceptedPickups = useMemo(() => {
    return appointments.filter(
      (app) =>
        app.requiresPickup &&
        app.status !== "Pending" &&
        app.status !== "Cancelled",
    );
  }, [appointments]);

  // Compute summary metrics
  const summary = useMemo(() => {
    let todayNeedsDriver = 0;
    let ongoing = 0;
    let upcoming = 0;
    let completed = 0;

    for (const app of acceptedPickups) {
      const pStatus = app.pickupDelivery?.pickupStatus || "Pending Assignment";
      const dateIso = app.serviceDate
        ? new Date(app.serviceDate).toISOString().split("T")[0]
        : "";

      if (pStatus === "Delivered to Customer" || app.status === "Completed") {
        completed += 1;
      } else if (pStatus === "Pending Assignment") {
        if (dateIso <= todayDateStr) {
          todayNeedsDriver += 1;
        } else {
          upcoming += 1;
        }
      } else {
        ongoing += 1;
      }
    }

    return {
      all: acceptedPickups.length,
      todayNeedsDriver,
      ongoing,
      upcoming,
      completed,
    };
  }, [acceptedPickups, todayDateStr]);

  const filteredPickups = useMemo(() => {
    const q = searchInput.trim().toLowerCase();

    return acceptedPickups.filter((app) => {
      const pStatus = app.pickupDelivery?.pickupStatus || "Pending Assignment";
      const dateIso = app.serviceDate
        ? new Date(app.serviceDate).toISOString().split("T")[0]
        : "";
      const isDone =
        pStatus === "Delivered to Customer" || app.status === "Completed";

      if (viewFilter === "TodayNeedsDriver") {
        if (pStatus !== "Pending Assignment" || dateIso > todayDateStr) {
          return false;
        }
      } else if (viewFilter === "Ongoing") {
        if (pStatus === "Pending Assignment" || isDone) {
          return false;
        }
      } else if (viewFilter === "Upcoming") {
        if (pStatus !== "Pending Assignment" || dateIso <= todayDateStr) {
          return false;
        }
      } else if (viewFilter === "Completed") {
        if (!isDone) return false;
      }

      if (q) {
        const reg = (app.vehicleSnapshot?.registrationNo || "").toLowerCase();
        const cust = (app.customerId?.name || "").toLowerCase();
        const addr = (
          app.pickupDelivery?.pickupLocation?.address ||
          app.pickupLocation?.address ||
          ""
        ).toLowerCase();
        const drv = (app.pickupDelivery?.driverId?.name || "").toLowerCase();

        if (
          !reg.includes(q) &&
          !cust.includes(q) &&
          !addr.includes(q) &&
          !drv.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [acceptedPickups, viewFilter, searchInput, todayDateStr]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            Pickup &amp; Driver Dispatch
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Assign drivers for today&apos;s confirmed pickups and track ongoing
            road dispatches.
          </p>
        </div>

        <button
          type="button"
          disabled={isRefreshing}
          onClick={handleManualRefresh}
          className="rounded-lg bg-[#13294b] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#1a3660] disabled:opacity-50"
        >
          {isRefreshing ? "Syncing..." : "Refresh"}
        </button>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{successMsg}</Alert>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">
            Today (Needs Driver)
          </p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700">
            {summary.todayNeedsDriver}
          </p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Ongoing Pickups</p>
          <p className="mt-1 text-2xl font-extrabold text-[#13294b]">
            {summary.ongoing}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">
            Upcoming Pickups
          </p>
          <p className="mt-1 text-2xl font-extrabold text-slate-700">
            {summary.upcoming}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">
            Available Drivers
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">
            {availableDrivers.length}
          </p>
        </div>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "All", label: "All Confirmed", count: summary.all },
            {
              id: "TodayNeedsDriver",
              label: "Today (Needs Driver)",
              count: summary.todayNeedsDriver,
            },
            { id: "Ongoing", label: "Ongoing", count: summary.ongoing },
            { id: "Upcoming", label: "Upcoming", count: summary.upcoming },
            { id: "Completed", label: "Completed", count: summary.completed },
          ].map((tab) => {
            const isActive = viewFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewFilter(tab.id)}
                className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                  isActive
                    ? "border-[#13294b] bg-[#13294b] text-white shadow-2xs"
                    : "border-gray-200 bg-white text-slate-600 hover:border-gray-300 hover:text-[#13294b]"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search plate, customer, address, driver..."
          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs text-gray-900 outline-none focus:border-orange-700 sm:w-64"
        />
      </div>

      {/* Dispatch List */}
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
          Loading pickup dispatches...
        </div>
      ) : filteredPickups.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xs">
          <p className="text-sm font-semibold text-[#13294b]">
            No pickup tasks in this view
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Confirm a Pickup &amp; Delivery booking in the Appointments tab to
            dispatch it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPickups.map((booking) => (
            <DispatchItemCard
              key={booking._id}
              booking={booking}
              todayDateStr={todayDateStr}
              availableDrivers={availableDrivers}
              assigningId={assigningId}
              updatingTaskId={updatingTaskId}
              onAssignDriver={handleAssignDriver}
              onUpdatePickupStatus={handleUpdatePickupStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default PickupDispatch;

