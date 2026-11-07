import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import Alert from "../../components/ui/Alert";

const BAY_TYPES = [
  "Mechanical",
  "Electrical",
  "Washing",
  "Inspection",
  "General",
];

const SERVICE_STAGES = [
  "Inspection",
  "Waiting for Approval",
  "In Progress",
  "Waiting for Parts",
  "Completed",
];

// Unidirectional stage transitions - previous stages cannot be selected
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

function ServiceBayManagement() {
  const [bays, setBays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Add Bay (collapsible)
  const [showAddForm, setShowAddForm] = useState(false);
  const [bayName, setBayName] = useState("");
  const [bayType, setBayType] = useState("General");

  // Job Sheet modal
  const [sheetBayId, setSheetBayId] = useState(null);
  const [sheetOriginalStage, setSheetOriginalStage] = useState("Inspection");
  const [sheetStage, setSheetStage] = useState("");
  const [sheetNotes, setSheetNotes] = useState("");
  const [sheetAdditional, setSheetAdditional] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);

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
            err.response?.data?.message || "Failed to load service bays.",
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

  const handleAddBay = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const trimmedName = bayName.trim();
    if (trimmedName.length < 2) {
      setError("Service bay name must be at least 2 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/service-bays", {
        bayName: trimmedName,
        bayType,
      });

      if (res.data.success && res.data.bay) {
        setBays((prev) => [...prev, res.data.bay]);
        setBayName("");
        setBayType("General");
        setShowAddForm(false);
        setSuccessMsg(res.data.message || "Service bay added successfully.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create service bay.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBayStatus = async (bay) => {
    setError("");
    setSuccessMsg("");
    setTogglingId(bay._id);

    const nextAvailable = !bay.isAvailable;

    try {
      const res = await api.patch(`/service-bays/${bay._id}/status`, {
        isAvailable: nextAvailable,
      });

      if (res.data.success && res.data.bay) {
        setBays((prev) =>
          prev.map((b) => (b._id === bay._id ? res.data.bay : b)),
        );
        setSuccessMsg(
          res.data.message ||
            `Service bay marked as ${nextAvailable ? "Available" : "Occupied"}.`,
        );
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to update service bay status.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const openJobSheet = (bay) => {
    const svc = bay.currentServiceId;
    const current = svc?.status || "Inspection";
    setSheetBayId(bay._id);
    setSheetOriginalStage(current);
    setSheetStage(current);
    setSheetNotes(svc?.inspectionNotes || "");
    setSheetAdditional(Boolean(svc?.additionalWorkRequired));
  };

  const handleSaveJobSheet = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setSavingSheet(true);

    try {
      const res = await api.patch(`/service-bays/${sheetBayId}/job-sheet`, {
        status: sheetStage,
        inspectionNotes: sheetNotes,
        additionalWorkRequired: sheetAdditional,
      });

      if (res.data.success && res.data.bay) {
        setBays((prev) =>
          prev.map((b) => (b._id === sheetBayId ? res.data.bay : b)),
        );
        setSuccessMsg(res.data.message || "Job sheet updated.");
        setSheetBayId(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update job sheet.");
    } finally {
      setSavingSheet(false);
    }
  };

  const summary = useMemo(() => {
    let available = 0;
    for (const b of bays) {
      if (b.isAvailable) available += 1;
    }
    return {
      total: bays.length,
      available,
      occupied: bays.length - available,
    };
  }, [bays]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            Service Bay Control
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            One vehicle per bay. Track each vehicle&apos;s stage and job sheet.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#13294b] transition hover:bg-slate-50"
          >
            {showAddForm ? "Close" : "+ Add Bay"}
          </button>
          <button
            type="button"
            onClick={() => setRefreshCount((prev) => prev + 1)}
            className="rounded-lg bg-[#13294b] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
          >
            Refresh
          </button>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{successMsg}</Alert>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Total Bays</p>
          <p className="mt-1 text-2xl font-extrabold text-[#13294b]">
            {summary.total}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Available</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">
            {summary.available}
          </p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Occupied</p>
          <p className="mt-1 text-2xl font-extrabold text-orange-700">
            {summary.occupied}
          </p>
        </div>
      </div>

      {/* Add New Service Bay (collapsible) */}
      {showAddForm && (
        <form
          onSubmit={handleAddBay}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:grid-cols-3 sm:p-5"
        >
          <div>
            <label
              htmlFor="bayName"
              className="mb-1 block text-xs font-semibold text-slate-600"
            >
              Bay Name
            </label>
            <input
              id="bayName"
              type="text"
              value={bayName}
              onChange={(e) => setBayName(e.target.value)}
              placeholder="e.g. Bay 4"
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-orange-700"
            />
          </div>

          <div>
            <label
              htmlFor="bayType"
              className="mb-1 block text-xs font-semibold text-slate-600"
            >
              Bay Type
            </label>
            <select
              id="bayType"
              value={bayType}
              onChange={(e) => setBayType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-orange-700"
            >
              {BAY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-orange-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-800 disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Save Bay"}
            </button>
          </div>
        </form>
      )}

      {/* Bay Cards */}
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
          Loading service bays...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bays.map((bay) => {
            const svc = bay.currentServiceId || null;
            const vSnap = svc?.vehicleSnapshot || null;
            const cust = svc?.customerId || {};
            const mech = svc?.mechanicId || {};
            const inService = !bay.isAvailable && svc;

            return (
              <div
                key={bay._id}
                className={`flex flex-col rounded-2xl border bg-white p-4 shadow-2xs ${
                  bay.isAvailable ? "border-emerald-200" : "border-orange-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#13294b]">
                      {bay.bayName}
                    </h3>
                    <p className="text-[11px] text-slate-500">{bay.bayType}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      bay.isAvailable
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {bay.isAvailable ? "Available" : "Occupied"}
                  </span>
                </div>

                <div className="mt-3 flex-1">
                  {inService && vSnap ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-block rounded border-2 border-black bg-yellow-400 px-2 py-0.5 text-[11px] font-extrabold tracking-widest text-black uppercase">
                          {vSnap.registrationNo || "Vehicle"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            STAGE_BADGE[svc.status] ||
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {svc.status}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-[#13294b]">
                        {[vSnap.brand, vSnap.modelName]
                          .filter(Boolean)
                          .join(" ") || vSnap.vehicleType}
                      </p>

                      <p className="text-[11px] text-slate-500">
                        {cust.name || "Customer"} · Mechanic:{" "}
                        {mech.name || "Unassigned"}
                      </p>

                      {svc.additionalWorkRequired && (
                        <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          ⚠ Additional work required
                        </span>
                      )}

                      {svc.inspectionNotes && (
                        <p className="line-clamp-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                          {svc.inspectionNotes}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-slate-500">
                      {bay.isAvailable
                        ? "Ready for the next vehicle."
                        : "Bay manually locked."}
                    </p>
                  )}
                </div>

                <div className="mt-3 border-t border-gray-100 pt-3">
                  {inService ? (
                    <button
                      type="button"
                      onClick={() => openJobSheet(bay)}
                      className="w-full rounded-lg bg-[#13294b] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
                    >
                      Job Sheet &amp; Stage
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={togglingId === bay._id}
                      onClick={() => handleToggleBayStatus(bay)}
                      className="w-full rounded-lg border border-gray-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-[#13294b] transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      {togglingId === bay._id
                        ? "Updating..."
                        : bay.isAvailable
                          ? "Mark as Occupied"
                          : "Release Bay"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Job Sheet Modal */}
      {sheetBayId && (() => {
        const selectedBay = bays.find((b) => b._id === sheetBayId);
        const vSnap = selectedBay?.currentServiceId?.vehicleSnapshot;
        const allowedNextStages =
          ALLOWED_STAGE_TRANSITIONS[sheetOriginalStage] || [];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !savingSheet && setSheetBayId(null)}
          >
            <form
              onSubmit={handleSaveJobSheet}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-[#13294b]">
                    Job Sheet &amp; Service Stage
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedBay?.bayName} ({selectedBay?.bayType}) ·{" "}
                    {vSnap?.brand} {vSnap?.modelName}
                  </p>
                </div>
                {vSnap?.registrationNo && (
                  <span className="rounded border-2 border-black bg-yellow-400 px-2.5 py-0.5 text-xs font-black tracking-widest text-black uppercase">
                    {vSnap.registrationNo}
                  </span>
                )}
              </div>

              {/* Unidirectional Forward Stepper Progress */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    Stage Progression (Forward Only)
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    Cannot revert to passed stages
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {SERVICE_STAGES.map((st, idx) => {
                    const isCurr = st === sheetOriginalStage;
                    const isPast =
                      !isCurr &&
                      !allowedNextStages.includes(st) &&
                      sheetOriginalStage !== "Vehicle Received";
                    const isTarget = st === sheetStage && !isCurr;

                    let badgeClasses =
                      "border border-slate-200 bg-white text-slate-400";
                    if (isPast) {
                      badgeClasses =
                        "bg-emerald-50 text-emerald-700 border-emerald-300 font-medium";
                    } else if (isCurr) {
                      badgeClasses =
                        "bg-[#13294b] text-white font-bold shadow-xs";
                    } else if (isTarget) {
                      badgeClasses =
                        "bg-orange-600 text-white font-bold ring-2 ring-orange-200";
                    }

                    return (
                      <div key={st} className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${badgeClasses}`}
                        >
                          {isPast && <span className="font-bold">✓</span>}
                          {isCurr && <span>●</span>}
                          {isTarget && <span>➔</span>}
                          {st}
                        </span>
                        {idx < SERVICE_STAGES.length - 1 && (
                          <span className="text-slate-300">›</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="sheetStage"
                  className="mb-1 block text-xs font-semibold text-slate-600"
                >
                  Change Service Stage
                </label>
                <select
                  id="sheetStage"
                  value={sheetStage}
                  disabled={sheetOriginalStage === "Completed"}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setSheetStage(nextVal);
                    if (nextVal === "Waiting for Approval") {
                      setSheetAdditional(true);
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-orange-700 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {SERVICE_STAGES.map((stage) => {
                    const isCurrent = stage === sheetOriginalStage;
                    const isAllowed =
                      isCurrent || allowedNextStages.includes(stage);
                    return (
                      <option key={stage} value={stage} disabled={!isAllowed}>
                        {stage}{" "}
                        {isCurrent
                          ? "(Current Stage)"
                          : !isAllowed
                            ? "— 🔒 Passed (Locked)"
                            : "➔ Next Available"}
                      </option>
                    );
                  })}
                </select>
                {sheetStage === "Completed" && (
                  <p className="mt-1.5 rounded bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">
                    ⚠ Completing the job will mark service finished and release this bay.
                  </p>
                )}
                {sheetStage === "Waiting for Approval" && (
                  <p className="mt-1.5 rounded bg-blue-50 p-2 text-[11px] font-medium text-blue-800">
                    ℹ Vehicle placed on hold for customer/admin additional repair approval.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="sheetNotes"
                  className="mb-1 block text-xs font-semibold text-slate-600"
                >
                  Inspection &amp; Work Notes
                </label>
                <textarea
                  id="sheetNotes"
                  rows={4}
                  maxLength={2000}
                  value={sheetNotes}
                  onChange={(e) => setSheetNotes(e.target.value)}
                  placeholder="Record findings, worn parts, or repairs performed..."
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-orange-700"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-slate-50 p-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={sheetAdditional}
                  onChange={(e) => setSheetAdditional(e.target.checked)}
                  className="h-4 w-4 rounded text-orange-600"
                />
                <span>
                  <strong>Additional work required</strong> (mark if extra repairs or parts outside initial package are needed)
                </span>
              </label>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  disabled={savingSheet}
                  onClick={() => setSheetBayId(null)}
                  className="rounded-lg border border-gray-300 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSheet}
                  className="rounded-lg bg-orange-700 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
                >
                  {savingSheet ? "Saving..." : "Save Job Sheet"}
                </button>
              </div>
            </form>
          </div>
        );
      })()}
    </div>
  );
}

export default ServiceBayManagement;
