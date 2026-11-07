import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Profile from "../customer/Profile";
import Alert from "../../components/ui/Alert";
import api from "../../services/api";

const mechanicNavItems = [
  { label: "Dashboard" },
  { label: "Assigned Jobs" },
  { label: "Additional Work Requests" },
  { label: "Profile" },
];

const SERVICE_STAGES = [
  "Inspection",
  "Waiting for Approval",
  "In Progress",
  "Waiting for Parts",
  "Completed",
];

// Unidirectional stage progression
const ALLOWED_STAGE_TRANSITIONS = {
  "Vehicle Received": [
    "Inspection",
    "Waiting for Approval",
    "In Progress",
    "Waiting for Parts",
    "Completed",
  ],
  Inspection: [
    "Waiting for Approval",
    "In Progress",
    "Waiting for Parts",
    "Completed",
  ],
  "Waiting for Approval": [
    "In Progress",
    "Waiting for Parts",
    "Completed",
  ],
  "In Progress": [
    "Waiting for Parts",
    "Completed",
  ],
  "Waiting for Parts": [
    "In Progress",
    "Completed",
  ],
  Completed: [],
};

const STAGE_BADGE = {
  "Vehicle Received": "bg-slate-100 text-slate-700",
  Inspection: "bg-sky-100 text-sky-800",
  "Waiting for Approval": "bg-amber-100 text-amber-800",
  "In Progress": "bg-blue-100 text-blue-800",
  "Waiting for Parts": "bg-purple-100 text-purple-800",
  Completed: "bg-emerald-100 text-emerald-800",
};

function MechanicDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [bays, setBays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingBayId, setUpdatingBayId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  // Note editing state per bay
  const [activeNoteBayId, setActiveNoteBayId] = useState(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingAdditional, setEditingAdditional] = useState(false);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    api
      .get("/service-bays", { signal: controller.signal })
      .then((res) => {
        if (isMounted && res.data.success) {
          setBays(res.data.bays || []);
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
            err.response?.data?.message || "Failed to load workshop jobs.",
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

  const handleStageUpdate = async (bay, newStage) => {
    const currentStage = bay.currentServiceId?.status || "Inspection";
    if (newStage === currentStage) return;

    setError("");
    setSuccessMsg("");
    setUpdatingBayId(bay._id);

    try {
      const payload = { status: newStage };
      if (newStage === "Waiting for Approval") {
        payload.additionalWorkRequired = true;
      }

      const res = await api.patch(`/service-bays/${bay._id}/job-sheet`, payload);
      if (res.data.success) {
        setSuccessMsg(res.data.message || `Stage updated to ${newStage}`);
        setRefreshCount((prev) => prev + 1);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update service stage.");
    } finally {
      setUpdatingBayId(null);
    }
  };

  const handleSaveNotes = async (bayId) => {
    setError("");
    setSuccessMsg("");
    setUpdatingBayId(bayId);

    try {
      const res = await api.patch(`/service-bays/${bayId}/job-sheet`, {
        inspectionNotes: editingNotes,
        additionalWorkRequired: editingAdditional,
      });
      if (res.data.success) {
        setSuccessMsg("Inspection notes updated successfully.");
        setActiveNoteBayId(null);
        setRefreshCount((prev) => prev + 1);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save notes.");
    } finally {
      setUpdatingBayId(null);
    }
  };

  const displayName = user?.name || "Mechanic";

  // Filter bays that have an active service job
  const activeJobs = bays.filter((b) => Boolean(b.currentServiceId));

  // If on "Additional Work Requests" tab, filter jobs that need approval
  const displayedJobs =
    activeTab === "Additional Work Requests"
      ? activeJobs.filter(
          (b) =>
            b.currentServiceId?.additionalWorkRequired ||
            b.currentServiceId?.status === "Waiting for Approval",
        )
      : activeJobs;

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
              Mechanic Workshop Portal
            </p>
          </div>

          <nav className="space-y-1 px-3">
            {mechanicNavItems.map((item) => {
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
          <p className="text-xs text-orange-300">Mechanic Portal</p>
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
                    Mechanic Dashboard — {displayName}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Forward-only workshop job sheet progress. Progress can only move forward.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#fef3e2] px-3.5 py-1 text-xs font-semibold text-orange-800">
                    Active Jobs: {activeJobs.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRefreshCount((c) => c + 1)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-[#13294b] hover:bg-slate-50"
                  >
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {error && (
                <Alert
                  type="error"
                  message={error}
                  onClose={() => setError("")}
                />
              )}
              {successMsg && (
                <Alert
                  type="success"
                  message={successMsg}
                  onClose={() => setSuccessMsg("")}
                />
              )}

              {/* Active Service Jobs */}
              {loading ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
                  Loading active workshop jobs...
                </div>
              ) : displayedJobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-2xs">
                  <p className="text-sm font-semibold text-slate-700">
                    No active vehicles in service bays right now.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    When the workshop administrator receives an incoming vehicle into a bay, it will appear here under Inspection.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedJobs.map((bay) => {
                    const svc = bay.currentServiceId;
                    const vSnap = svc?.vehicleSnapshot || {};
                    const cust = svc?.customerId || {};
                    const currentStage = svc?.status || "Inspection";
                    const isBusy = updatingBayId === bay._id;
                    const allowedNext =
                      ALLOWED_STAGE_TRANSITIONS[currentStage] || [];

                    const isEditingNote = activeNoteBayId === bay._id;

                    return (
                      <section
                        key={bay._id}
                        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded border-2 border-black bg-yellow-400 px-2 py-0.5 text-xs font-extrabold tracking-widest text-black uppercase">
                                {vSnap.registrationNo || "Vehicle"}
                              </span>
                              <h3 className="text-base font-bold text-[#13294b]">
                                {[vSnap.brand, vSnap.modelName]
                                  .filter(Boolean)
                                  .join(" ") || vSnap.vehicleType}
                              </h3>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {bay.bayName} ({bay.bayType})
                              </span>
                            </div>

                            <p className="mt-1.5 text-xs text-slate-500">
                              Customer: <strong>{cust.name || "Customer"}</strong>{" "}
                              {cust.contactNo ? `(${cust.contactNo})` : ""}
                            </p>

                            {svc?.inspectionNotes ? (
                              <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700">
                                <strong>Notes:</strong> {svc.inspectionNotes}
                              </p>
                            ) : null}

                            {svc?.additionalWorkRequired && (
                              <span className="mt-2 inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
                                ⚠ Additional work / parts required
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                STAGE_BADGE[currentStage] ||
                                "bg-slate-100 text-slate-700"
                              }`}
                            >
                              Current: {currentStage}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingNote) {
                                  setActiveNoteBayId(null);
                                } else {
                                  setActiveNoteBayId(bay._id);
                                  setEditingNotes(svc?.inspectionNotes || "");
                                  setEditingAdditional(
                                    Boolean(svc?.additionalWorkRequired),
                                  );
                                }
                              }}
                              className="text-xs font-semibold text-orange-700 hover:underline"
                            >
                              {isEditingNote ? "Cancel Edit" : "✎ Edit Notes"}
                            </button>
                          </div>
                        </div>

                        {/* Inline Inspection Notes Edit Form */}
                        {isEditingNote && (
                          <div className="mt-4 rounded-xl border border-gray-200 bg-slate-50 p-3.5 space-y-3">
                            <label className="block text-xs font-semibold text-slate-700">
                              Update Inspection &amp; Work Notes:
                            </label>
                            <textarea
                              rows={3}
                              maxLength={2000}
                              value={editingNotes}
                              onChange={(e) => setEditingNotes(e.target.value)}
                              placeholder="Record repair findings, required spare parts..."
                              className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-xs text-gray-900 outline-none focus:border-orange-700"
                            />
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={editingAdditional}
                                onChange={(e) =>
                                  setEditingAdditional(e.target.checked)
                                }
                              />
                              Mark additional work required (requires approval)
                            </label>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setActiveNoteBayId(null)}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleSaveNotes(bay._id)}
                                className="rounded-lg bg-orange-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
                              >
                                {isBusy ? "Saving..." : "Save Notes"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Forward-Only Stage Selector */}
                        <div className="mt-4 border-t border-gray-100 pt-4">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-bold text-[#13294b]">
                              Stage Progression (Forward Only):
                            </p>
                            <span className="text-[11px] text-slate-400">
                              Previous stages are locked
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {SERVICE_STAGES.map((stage) => {
                              const isCurrent = currentStage === stage;
                              const isAllowed = allowedNext.includes(stage);
                              const isPassed =
                                !isCurrent &&
                                !isAllowed &&
                                currentStage !== "Vehicle Received";

                              if (isCurrent) {
                                return (
                                  <span
                                    key={stage}
                                    className="rounded-lg bg-[#13294b] px-3 py-1.5 text-xs font-bold text-white shadow-xs"
                                  >
                                    ● {stage} (Current)
                                  </span>
                                );
                              }

                              if (isPassed) {
                                return (
                                  <span
                                    key={stage}
                                    title="Stage already passed — cannot revert backward"
                                    className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-400"
                                  >
                                    ✓ {stage} 🔒
                                  </span>
                                );
                              }

                              return (
                                <button
                                  key={stage}
                                  type="button"
                                  disabled={isBusy || !isAllowed}
                                  onClick={() => handleStageUpdate(bay, stage)}
                                  className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 transition hover:bg-orange-600 hover:text-white disabled:opacity-50"
                                >
                                  ➔ {stage}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default MechanicDashboard;
