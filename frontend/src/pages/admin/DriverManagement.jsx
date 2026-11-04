import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { driverFormSchema } from "../../validators/driverSchema";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";

const PICKUP_STATUS_STEPS = [
  "Pending Assignment",
  "Driver Assigned",
  "En Route to Pickup",
  "Vehicle Picked Up",
  "Delivered to Workshop",
  "Out for Return Delivery",
  "Delivered to Customer",
  "Cancelled",
];

const inputClass =
  "py-2.5! rounded-lg! border-gray-300! focus:border-orange-700! focus:ring-orange-700!";
const buttonClass =
  "py-2.5! font-semibold! bg-orange-700! hover:bg-orange-800! text-white!";

const DriverCard = memo(function DriverCard({
  driver,
  isToggling,
  isDeleting,
  isConfirmingDelete,
  onToggleAvailability,
  onOpenTaskLogs,
  onEditDriver,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}) {
  const [imgError, setImgError] = useState(false);

  const initials = (driver.name || "D")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const showPhoto = Boolean(driver.photograph) && !imgError;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs transition hover:border-gray-300 hover:shadow-xs">
      <div>
        {/* Top Row: Avatar + Name/License + Availability Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            {showPhoto ? (
              <img
                src={driver.photograph}
                alt={driver.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-14 w-14 shrink-0 rounded-xl border border-gray-200 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#13294b] text-base font-bold text-white">
                {initials}
              </div>
            )}

            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-[#13294b]">
                {driver.name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-block rounded-md border border-gray-300 bg-slate-100 px-2 py-0.5 text-[11px] font-bold tracking-wider text-[#13294b] uppercase">
                  LIC: {driver.licenseNo}
                </span>
                {driver.isOnDuty && (
                  <span className="rounded-full bg-[#fef3e2] px-2 py-0.5 text-[10px] font-semibold text-orange-800">
                    On Duty ({driver.activeTaskCount})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Real-Time Availability Badge (Green for Available, Gray for Busy/Inactive) */}
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
              driver.isAvailable
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-slate-200 bg-slate-100 text-slate-600"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                driver.isAvailable ? "bg-emerald-600" : "bg-slate-400"
              }`}
            />
            {driver.isAvailable ? "Available" : "Busy / Inactive"}
          </span>
        </div>

        {/* Contact & Account Details */}
        <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Contact No:</span>
            <a
              href={`tel:${driver.contactNo}`}
              className="font-semibold text-[#13294b] hover:underline"
            >
              {driver.contactNo}
            </a>
          </div>

          {driver.userId?.email && (
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Portal Account:</span>
              <span className="max-w-44 truncate font-medium text-slate-700">
                {driver.userId.email}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Active Pickups:</span>
            <button
              type="button"
              onClick={() => onOpenTaskLogs(driver)}
              className="font-semibold text-orange-700 hover:underline"
            >
              {driver.activeTaskCount || 0} active · View Logs
            </button>
          </div>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3.5">
        <button
          type="button"
          disabled={isToggling}
          onClick={() => onToggleAvailability(driver._id, !driver.isAvailable)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
            driver.isAvailable
              ? "border border-gray-300 bg-white text-slate-700 hover:bg-slate-50"
              : "bg-emerald-700 text-white hover:bg-emerald-800"
          }`}
        >
          {isToggling
            ? "Updating..."
            : driver.isAvailable
              ? "Set Unavailable"
              : "Set Available"}
        </button>

        {isConfirmingDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-red-700">
              Confirm?
            </span>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => onConfirmDelete(driver._id)}
              className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? "..." : "Yes"}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenTaskLogs(driver)}
              className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-2 text-xs font-semibold text-orange-800 transition hover:bg-orange-100"
            >
              Task Logs
            </button>

            <button
              type="button"
              onClick={() => onEditDriver(driver)}
              className="rounded-lg border border-[#13294b]/20 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-[#13294b] transition hover:bg-slate-100"
            >
              Edit
            </button>

            <button
              type="button"
              disabled={isDeleting}
              onClick={() => onRequestDelete(driver._id)}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

function DriverManagement() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Task Logs Modal state
  const [selectedLogsDriver, setSelectedLogsDriver] = useState(null);
  const [driverTasks, setDriverTasks] = useState([]);
  const [taskSummary, setTaskSummary] = useState({
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    totalDistanceKm: 0,
  });
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [formError, setFormError] = useState("");

  // Search & Debounced Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("All");

  const taskLogsAbortRef = useRef(null);

  // Add / Edit Driver Form State
  const [createLoginAccount, setCreateLoginAccount] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contactNo: "",
    licenseNo: "",
    photograph: "",
    isAvailable: true,
    email: "",
    password: "",
  });

  // Debounce search input (250ms) to avoid re-filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load drivers from /api/admin/drivers
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    api
      .get("/admin/drivers", { signal: controller.signal })
      .then((res) => {
        if (isMounted && res.data.success) {
          setDrivers(res.data.drivers || []);
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
            err.response?.data?.message || "Failed to load drivers list.",
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [refreshTrigger]);

  // Clean up task logs AbortController on unmount
  useEffect(() => {
    return () => {
      if (taskLogsAbortRef.current) {
        taskLogsAbortRef.current.abort();
      }
    };
  }, []);

  // Compute summary metrics dynamically in a single O(N) pass
  const summary = useMemo(() => {
    let available = 0;
    let onDuty = 0;
    for (const d of drivers) {
      if (d.isAvailable) available += 1;
      if (d.isOnDuty || (d.activeTaskCount && d.activeTaskCount > 0)) {
        onDuty += 1;
      }
    }
    return {
      total: drivers.length,
      available,
      onDuty,
      unavailable: drivers.length - available,
    };
  }, [drivers]);

  // Memoized filtered drivers list
  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (availabilityFilter === "Available" && !d.isAvailable) return false;
      if (availabilityFilter === "Unavailable" && d.isAvailable) return false;
      if (availabilityFilter === "OnDuty" && !d.isOnDuty) return false;

      if (debouncedSearch) {
        const matchName = (d.name || "").toLowerCase().includes(debouncedSearch);
        const matchLic = (d.licenseNo || "")
          .toLowerCase()
          .includes(debouncedSearch);
        const matchPhone = (d.contactNo || "")
          .toLowerCase()
          .includes(debouncedSearch);
        if (!matchName && !matchLic && !matchPhone) return false;
      }

      return true;
    });
  }, [drivers, availabilityFilter, debouncedSearch]);

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const openAddModal = () => {
    setEditingDriver(null);
    setForm({
      name: "",
      contactNo: "",
      licenseNo: "",
      photograph: "",
      isAvailable: true,
      email: "",
      password: "",
    });
    setCreateLoginAccount(false);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = useCallback((driver) => {
    setEditingDriver(driver);
    setForm({
      name: driver.name || "",
      contactNo: driver.contactNo || "",
      licenseNo: driver.licenseNo || "",
      photograph: driver.photograph || "",
      isAvailable: Boolean(driver.isAvailable),
      email: driver.userId?.email || "",
      password: "",
    });
    setCreateLoginAccount(Boolean(driver.userId?.email));
    setFormError("");
    setShowModal(true);
  }, []);

  const openTaskLogsModal = useCallback((driver) => {
    if (taskLogsAbortRef.current) {
      taskLogsAbortRef.current.abort();
    }
    const controller = new AbortController();
    taskLogsAbortRef.current = controller;

    setSelectedLogsDriver(driver);
    setDriverTasks([]);
    setLoadingTasks(true);

    api
      .get(`/admin/drivers/${driver._id}/tasks`, {
        signal: controller.signal,
      })
      .then((res) => {
        if (res.data.success) {
          setDriverTasks(res.data.tasks || []);
          setTaskSummary(
            res.data.summary || {
              totalTasks: 0,
              activeTasks: 0,
              completedTasks: 0,
              totalDistanceKm: 0,
            },
          );
        }
      })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          setError(
            err.response?.data?.message || "Failed to load driver task logs.",
          );
        }
      })
      .finally(() => {
        setLoadingTasks(false);
      });
  }, []);

  const closeTaskLogsModal = useCallback(() => {
    if (taskLogsAbortRef.current) {
      taskLogsAbortRef.current.abort();
    }
    setSelectedLogsDriver(null);
  }, []);

  const handleTaskStatusUpdate = async (taskId, newStatus) => {
    setUpdatingTaskId(taskId);
    try {
      const res = await api.patch(`/admin/drivers/tasks/${taskId}/status`, {
        pickupStatus: newStatus,
      });
      if (res.data.success && res.data.task) {
        setDriverTasks((prev) =>
          prev.map((t) => (t._id === taskId ? res.data.task : t)),
        );
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to update task log status.",
      );
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleSaveDriver = async (e) => {
    e.preventDefault();
    setFormError("");
    setError("");
    setSuccessMsg("");

    const hasExistingLogin = Boolean(editingDriver?.userId);
    const parsed = driverFormSchema.safeParse({
      ...form,
      createLoginAccount,
      hasExistingLogin,
    });

    if (!parsed.success) {
      const issues = parsed.error?.issues || parsed.error?.errors || [];
      setFormError(issues[0]?.message || "Please check your input fields.");
      return;
    }

    const validData = parsed.data;

    setSubmitting(true);

    try {
      const payload = {
        name: validData.name,
        contactNo: validData.contactNo,
        licenseNo: validData.licenseNo,
        photograph: validData.photograph,
        isAvailable: validData.isAvailable,
        ...(createLoginAccount || hasExistingLogin
          ? {
              email: validData.email,
              ...(validData.password ? { password: validData.password } : {}),
            }
          : {}),
      };

      if (editingDriver) {
        const res = await api.put(
          `/admin/drivers/${editingDriver._id}`,
          payload,
        );
        if (res.data.success && res.data.driver) {
          setDrivers((prev) =>
            prev.map((d) =>
              d._id === editingDriver._id ? res.data.driver : d,
            ),
          );
          setSuccessMsg(
            res.data.message || "Driver details updated successfully.",
          );
          setShowModal(false);
          setEditingDriver(null);
        }
      } else {
        const res = await api.post("/admin/drivers", payload);
        if (res.data.success && res.data.driver) {
          setDrivers((prev) => [res.data.driver, ...prev]);
          setSuccessMsg(res.data.message || "Driver registered successfully.");
          setShowModal(false);
        }
      }
    } catch (err) {
      setFormError(
        err.response?.data?.message ||
          `Failed to ${editingDriver ? "update" : "register"} driver.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAvailability = useCallback(
    async (driverId, nextAvailable) => {
      setError("");
      setSuccessMsg("");
      setTogglingId(driverId);

      // Optimistic UI update
      setDrivers((prev) =>
        prev.map((d) =>
          d._id === driverId ? { ...d, isAvailable: nextAvailable } : d,
        ),
      );

      try {
        const res = await api.patch(`/admin/drivers/${driverId}/availability`, {
          isAvailable: nextAvailable,
        });

        if (res.data.success && res.data.driver) {
          setDrivers((prev) =>
            prev.map((d) => (d._id === driverId ? res.data.driver : d)),
          );
          setSuccessMsg(res.data.message);
        }
      } catch (err) {
        // Revert optimistic update on error
        setDrivers((prev) =>
          prev.map((d) =>
            d._id === driverId ? { ...d, isAvailable: !nextAvailable } : d,
          ),
        );
        setError(
          err.response?.data?.message ||
            "Failed to update driver availability.",
        );
      } finally {
        setTogglingId(null);
      }
    },
    [],
  );

  const handleRequestDelete = useCallback((driverId) => {
    setConfirmDeleteId(driverId);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setConfirmDeleteId(null);
  }, []);

  const handleConfirmDelete = useCallback(async (driverId) => {
    setError("");
    setSuccessMsg("");
    setDeletingId(driverId);

    try {
      const res = await api.delete(`/admin/drivers/${driverId}`);
      if (res.data.success) {
        setDrivers((prev) => prev.filter((d) => d._id !== driverId));
        setSuccessMsg(res.data.message || "Driver removed successfully.");
        setConfirmDeleteId(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to remove driver.");
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            Driver Management
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Register drivers, edit details, inspect task logs, and manage pickup &amp; delivery staff.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-[#13294b] transition hover:bg-slate-50"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="rounded-lg bg-orange-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-800"
          >
            + Add New Driver
          </button>
        </div>
      </div>

      {/* Driver Summary Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total Drivers
          </p>
          <p className="mt-2 text-2xl font-extrabold text-[#13294b]">
            {summary.total}
          </p>
          <p className="mt-1 text-xs text-slate-500">Registered in fleet</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Active / Available
          </p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">
            {summary.available}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ready for pickup assignments
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            On-Duty (In Transit)
          </p>
          <p className="mt-2 text-2xl font-extrabold text-orange-700">
            {summary.onDuty}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Currently handling active pickups
          </p>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{successMsg}</Alert>

      {/* Search & Filter Bar */}
      <section className="flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "All", label: `All (${summary.total})` },
            { key: "Available", label: `Available (${summary.available})` },
            {
              key: "Unavailable",
              label: `Busy / Inactive (${summary.unavailable})`,
            },
            { key: "OnDuty", label: `On Duty (${summary.onDuty})` },
          ].map((tab) => {
            const active = availabilityFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setAvailabilityFilter(tab.key)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-[#13294b] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, license, or phone..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none transition focus:border-orange-700 focus:ring-1 focus:ring-orange-700"
          />
        </div>
      </section>

      {/* Driver Task Logs Modal */}
      {selectedLogsDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#13294b]">
                  Task Logs — {selectedLogsDriver.name} ({selectedLogsDriver.licenseNo})
                </h2>
                <p className="text-xs text-slate-500">
                  Pickup &amp; delivery task history and step-by-step audit timeline.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTaskLogsModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Task Summary Metrics */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-400">
                  Total Assigned
                </p>
                <p className="mt-1 text-lg font-extrabold text-[#13294b]">
                  {taskSummary.totalTasks}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-400">
                  Active Tasks
                </p>
                <p className="mt-1 text-lg font-extrabold text-orange-700">
                  {taskSummary.activeTasks}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-400">
                  Completed
                </p>
                <p className="mt-1 text-lg font-extrabold text-emerald-700">
                  {taskSummary.completedTasks}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-400">
                  Total Distance
                </p>
                <p className="mt-1 text-lg font-extrabold text-[#13294b]">
                  {taskSummary.totalDistanceKm} km
                </p>
              </div>
            </div>

            {loadingTasks ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Loading driver task logs...
              </div>
            ) : driverTasks.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-slate-50 p-8 text-center">
                <p className="text-sm font-semibold text-[#13294b]">
                  No pickup/delivery tasks assigned yet
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  When this driver is assigned to a customer pickup, the full timeline will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {driverTasks.map((task) => {
                  const snap = task.appointmentId?.vehicleSnapshot || {};
                  const cust = task.customerId || {};
                  const logs = task.statusLogs || [];

                  return (
                    <div
                      key={task._id}
                      className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-md border-2 border-black bg-yellow-400 px-2.5 py-0.5 text-xs font-extrabold text-black uppercase">
                              {snap.registrationNo || "Vehicle"}
                            </span>
                            <span className="text-sm font-bold text-[#13294b]">
                              {[snap.brand, snap.modelName]
                                .filter(Boolean)
                                .join(" ")}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            Customer: <strong>{cust.name || "Customer"}</strong>{" "}
                            ({cust.contactNo || "N/A"})
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Route: {task.pickupLocation?.address} →{" "}
                            {task.deliveryLocation?.address} ({task.distance} km
                            · Rs. {(task.charge || 0).toLocaleString()})
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={task.pickupStatus}
                            disabled={updatingTaskId === task._id}
                            onChange={(e) =>
                              handleTaskStatusUpdate(task._id, e.target.value)
                            }
                            className="rounded-lg border border-gray-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-[#13294b] outline-none focus:border-orange-700"
                          >
                            {PICKUP_STATUS_STEPS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Audit Log Timeline */}
                      {logs.length > 0 && (
                        <div className="mt-3 border-t border-gray-100 pt-3">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Audit Log Timeline
                          </p>
                          <div className="space-y-1.5">
                            {logs.map((entry, idx) => (
                              <div
                                key={`${entry.status}-${idx}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-orange-700" />
                                  <span className="font-bold text-[#13294b]">
                                    {entry.status}
                                  </span>
                                  {entry.note && (
                                    <span className="text-slate-600">
                                      — {entry.note}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400">
                                  {entry.updatedByName} ({entry.updatedByRole}) ·{" "}
                                  {entry.timestamp
                                    ? new Date(entry.timestamp).toLocaleString(
                                        "en-GB",
                                        {
                                          day: "2-digit",
                                          month: "short",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        },
                                      )
                                    : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Driver Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#13294b]">
                  {editingDriver ? "Edit Driver Details" : "Register New Driver"}
                </h2>
                <p className="text-xs text-slate-500">
                  {editingDriver
                    ? `Update profile, license, or login credentials for ${editingDriver.name}.`
                    : "Enter driver license, contact details, and initial availability."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditingDriver(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDriver} className="space-y-4">
              <Alert type="error">{formError}</Alert>

              <Input
                id="driver-name"
                name="name"
                label="Full Name"
                type="text"
                placeholder="Nuwan Perera"
                value={form.name}
                onChange={handleFormChange}
                required
                className={inputClass}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="driver-contactNo"
                  name="contactNo"
                  label="Contact Number"
                  type="tel"
                  placeholder="0771234567"
                  value={form.contactNo}
                  onChange={handleFormChange}
                  required
                  className={inputClass}
                />

                <Input
                  id="driver-licenseNo"
                  name="licenseNo"
                  label="License Number"
                  type="text"
                  placeholder="B1234567"
                  value={form.licenseNo}
                  onChange={handleFormChange}
                  required
                  className={`${inputClass} uppercase`}
                />
              </div>

              <Input
                id="driver-photograph"
                name="photograph"
                label="Photograph URL (Optional)"
                type="url"
                placeholder="https://example.com/driver-photo.jpg"
                value={form.photograph}
                onChange={handleFormChange}
                className={inputClass}
              />

              {/* Availability Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-slate-50 p-3.5">
                <div>
                  <p className="text-xs font-bold text-[#13294b]">
                    Availability Status
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Mark driver as available for pickup assignments.
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    name="isAvailable"
                    checked={form.isAvailable}
                    onChange={handleFormChange}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {/* Optional Linked Driver Login Account */}
              <div className="rounded-xl border border-gray-200 p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#13294b]">
                      {editingDriver?.userId
                        ? "Driver Portal Login Account"
                        : "Create Driver Portal Login (Optional)"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {editingDriver?.userId
                        ? "Update login email or set a new password (leave password blank to keep current)."
                        : "Creates a linked User account with the Driver role."}
                    </p>
                  </div>
                  {!editingDriver?.userId && (
                    <input
                      type="checkbox"
                      checked={createLoginAccount}
                      onChange={(e) => setCreateLoginAccount(e.target.checked)}
                      className="h-4 w-4 accent-orange-700"
                    />
                  )}
                </div>

                {(createLoginAccount || editingDriver?.userId) && (
                  <div className="mt-3 grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
                    <Input
                      id="driver-email"
                      name="email"
                      label="Login Email"
                      type="email"
                      placeholder="driver@service.com"
                      value={form.email}
                      onChange={handleFormChange}
                      required={createLoginAccount}
                      className={inputClass}
                    />
                    <Input
                      id="driver-password"
                      name="password"
                      label={
                        editingDriver?.userId
                          ? "New Password (Optional)"
                          : "Initial Password"
                      }
                      type="password"
                      placeholder={
                        editingDriver?.userId
                          ? "Leave blank to keep current"
                          : "Min 6 characters"
                      }
                      value={form.password}
                      onChange={handleFormChange}
                      required={!editingDriver?.userId && createLoginAccount}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowModal(false);
                    setEditingDriver(null);
                  }}
                  className="w-auto! px-5!"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={submitting}
                  className={`w-auto! px-6! ${buttonClass}`}
                >
                  {editingDriver ? "Update Driver" : "Save Driver"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drivers Data Grid */}
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
          Loading drivers...
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xs">
          <p className="text-sm font-semibold text-[#13294b]">
            No drivers found
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Click &ldquo;+ Add New Driver&rdquo; to register your first pickup &amp; delivery driver.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDrivers.map((driver) => (
            <DriverCard
              key={driver._id}
              driver={driver}
              isToggling={togglingId === driver._id}
              isDeleting={deletingId === driver._id}
              isConfirmingDelete={confirmDeleteId === driver._id}
              onToggleAvailability={handleToggleAvailability}
              onOpenTaskLogs={openTaskLogsModal}
              onEditDriver={openEditModal}
              onRequestDelete={handleRequestDelete}
              onCancelDelete={handleCancelDelete}
              onConfirmDelete={handleConfirmDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default DriverManagement;
