import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SmartMap } from "smartmap-pro";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import Alert from "../../components/ui/Alert";
import Profile from "../customer/Profile";

const driverNavItems = [
  { label: "Dashboard" },
  { label: "Assigned Pickups" },
  { label: "Deliveries" },
  { label: "Route Map" },
  { label: "Profile" },
];

const PICKUP_STATUS_STYLES = {
  "Driver Assigned": "bg-blue-50 text-blue-800 border-blue-200",
  "En Route to Pickup": "bg-indigo-50 text-indigo-800 border-indigo-200",
  "Vehicle Picked Up": "bg-purple-50 text-purple-800 border-purple-200",
  "Delivered to Workshop": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Out for Return Delivery": "bg-orange-50 text-orange-800 border-orange-200",
  "Delivered to Customer": "bg-emerald-100 text-emerald-900 border-emerald-300",
};

const DRIVER_NEXT_ACTION = {
  "Driver Assigned": {
    nextStatus: "En Route to Pickup",
    label: "Start Pickup (En Route)",
    btnClass: "bg-indigo-700 hover:bg-indigo-800 text-white",
  },
  "En Route to Pickup": {
    nextStatus: "Vehicle Picked Up",
    label: "Mark Vehicle Picked Up",
    btnClass: "bg-purple-700 hover:bg-purple-800 text-white",
  },
  "Vehicle Picked Up": {
    nextStatus: "Delivered to Workshop",
    label: "Delivered to Workshop",
    btnClass: "bg-orange-700 hover:bg-orange-800 text-white",
  },
  "Delivered to Workshop": {
    nextStatus: "Out for Return Delivery",
    label: "Start Return Delivery",
    btnClass: "bg-[#13294b] hover:bg-[#1a3660] text-white",
  },
  "Out for Return Delivery": {
    nextStatus: "Delivered to Customer",
    label: "Complete Delivery to Customer",
    btnClass: "bg-emerald-700 hover:bg-emerald-800 text-white",
  },
};

function DriverDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [selectedTaskCoords, setSelectedTaskCoords] = useState(null);
  const [resetCount, setResetCount] = useState(0);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    api
      .get("/admin/drivers/my-tasks", { signal: controller.signal })
      .then((res) => {
        if (isMounted && res.data.success) {
          const fetchedTasks = res.data.tasks || [];
          setTasks(fetchedTasks);
          setSelectedTaskCoords((prev) => {
            if (prev) return prev;
            const firstWithCoords = fetchedTasks.find(
              (t) => t.pickupLocation?.coordinates?.length === 2,
            );
            return firstWithCoords
              ? firstWithCoords.pickupLocation.coordinates
              : null;
          });
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
            err.response?.data?.message || "Failed to load assigned trips.",
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

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleStatusUpdate = useCallback(async (taskId, nextStatus) => {
    setError("");
    setSuccessMsg("");
    setUpdatingTaskId(taskId);

    try {
      const res = await api.patch(`/admin/drivers/tasks/${taskId}/status`, {
        pickupStatus: nextStatus,
      });

      if (res.data.success && res.data.task) {
        setTasks((prev) =>
          prev.map((t) => (t._id === taskId ? res.data.task : t)),
        );
        setSuccessMsg(
          res.data.message || `Trip status updated to "${nextStatus}".`,
        );
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to update trip status.",
      );
    } finally {
      setUpdatingTaskId(null);
    }
  }, []);

  const filteredTasks = useMemo(() => {
    if (activeTab === "Assigned Pickups") {
      return tasks.filter((t) =>
        ["Driver Assigned", "En Route to Pickup", "Vehicle Picked Up"].includes(
          t.pickupStatus,
        ),
      );
    }
    if (activeTab === "Deliveries") {
      return tasks.filter((t) =>
        [
          "Delivered to Workshop",
          "Out for Return Delivery",
          "Delivered to Customer",
        ].includes(t.pickupStatus),
      );
    }
    return tasks;
  }, [tasks, activeTab]);

  const displayName = user?.name || "Driver";

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-[#13294b] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
        <div>
          <div className="px-6 pt-7 pb-6">
            <span className="text-base font-bold tracking-tight">
              Vehicle Service
            </span>
            <p className="mt-0.5 text-[11px] font-medium text-orange-400">
              Driver Portal
            </p>
          </div>

          <nav className="space-y-1 px-3">
            {driverNavItems.map((item) => {
              const isActive = activeTab === item.label;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveTab(item.label)}
                  className={`flex w-full items-center rounded-lg px-4 py-2.5 text-left text-sm transition ${
                    isActive
                      ? "bg-orange-700 font-semibold text-white"
                      : "font-medium text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="px-7 py-6">
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-medium text-white/80 transition hover:text-white"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="flex items-center justify-between bg-[#13294b] px-5 py-4 text-white lg:hidden">
        <div className="min-w-0">
          <p className="text-xs text-orange-300">Driver Portal</p>
          <h1 className="truncate text-lg leading-tight font-bold">
            {displayName}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Logout
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 pt-4 pb-24 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-5">
          {activeTab === "Profile" ? (
            <Profile showCustomerStats={false} onLogout={handleLogout} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#13294b]">
                    Driver Dashboard — {displayName}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Update your live pickup &amp; delivery trip stages as you transport customer vehicles.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRefreshCount((c) => c + 1)}
                    className="rounded-lg bg-[#13294b] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
                  >
                    Refresh Trips
                  </button>
                  <span className="rounded-full bg-[#fef3e2] px-3.5 py-1 text-xs font-semibold text-orange-800">
                    Role: {user?.role || "Driver"}
                  </span>
                </div>
              </div>

              <Alert type="error">{error}</Alert>
              <Alert type="success">{successMsg}</Alert>

              {/* Assigned Pickups & Deliveries */}
              {activeTab !== "Route Map" && (
                <section className="space-y-3">
                  <h2 className="text-base font-bold text-[#13294b]">
                    Assigned Trips ({filteredTasks.length})
                  </h2>

                  {loading ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
                      Loading your assigned trips...
                    </div>
                  ) : filteredTasks.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
                      No assigned pickup or delivery trips found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {filteredTasks.map((task) => {
                        const app = task.appointmentId || {};
                        const vSnap = app.vehicleSnapshot || {};
                        const cust = task.customerId || {};
                        const status = task.pickupStatus || "Driver Assigned";
                        const nextAction = DRIVER_NEXT_ACTION[status] || null;
                        const isUpdating = updatingTaskId === task._id;

                        return (
                          <div
                            key={task._id}
                            className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-block rounded-md border-2 border-black bg-yellow-400 px-2.5 py-0.5 text-xs font-extrabold tracking-widest text-black uppercase">
                                  {vSnap.registrationNo || "Vehicle"}
                                </span>
                                <span
                                  className={`rounded-full border px-3 py-0.5 text-[11px] font-semibold ${
                                    PICKUP_STATUS_STYLES[status] ||
                                    "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {status}
                                </span>
                              </div>

                              <h3 className="mt-3 text-base font-bold text-[#13294b]">
                                {[vSnap.brand, vSnap.modelName]
                                  .filter(Boolean)
                                  .join(" ") ||
                                  vSnap.vehicleType ||
                                  "Vehicle"}{" "}
                                — {cust.name || "Customer"}
                              </h3>
                              <p className="mt-1 text-xs text-slate-600">
                                📍 Pickup: {task.pickupLocation?.address || "Customer Location"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Slot: {app.serviceTime || "Scheduled"} · Distance:{" "}
                                {task.distance || 0} km
                              </p>
                              {cust.contactNo && (
                                <p className="mt-1 text-xs text-slate-600">
                                  Tel:{" "}
                                  <a
                                    href={`tel:${cust.contactNo}`}
                                    className="font-semibold text-[#13294b] hover:underline"
                                  >
                                    {cust.contactNo}
                                  </a>
                                </p>
                              )}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                              {nextAction ? (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    handleStatusUpdate(
                                      task._id,
                                      nextAction.nextStatus,
                                    )
                                  }
                                  className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-50 ${nextAction.btnClass}`}
                                >
                                  {isUpdating ? "Updating..." : nextAction.label}
                                </button>
                              ) : (
                                <span className="inline-block rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
                                  ✓ Trip Completed
                                </span>
                              )}

                              {task.pickupLocation?.coordinates?.length === 2 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedTaskCoords(
                                      task.pickupLocation.coordinates,
                                    )
                                  }
                                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-[#13294b] hover:bg-slate-50"
                                >
                                  Show on Map
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* Live Navigation Map */}
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#13294b]">
                    Pickup &amp; Delivery Route Map
                  </h2>
                  <button
                    type="button"
                    onClick={() => setResetCount((c) => c + 1)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#13294b] hover:bg-slate-50"
                  >
                    Reset Route
                  </button>
                </div>

                <div className="relative mx-auto w-full [&_input]:text-xs sm:[&_input]:text-sm [&_.smart-map-container]:gap-2.5! [&_.smart-map-container>div:nth-of-type(2)]:h-64!">
                  <SmartMap
                    resetTrigger={resetCount}
                    shopCoords={[6.9271, 79.8612]}
                    externalStartPoint={selectedTaskCoords}
                    mode="routing"
                    theme="light"
                    showSearchBox={true}
                    showZoomControls={true}
                    osrmUrl="https://router.project-osrm.org/route/v1/driving"
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default DriverDashboard;
