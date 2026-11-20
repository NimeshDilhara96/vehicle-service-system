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

const WORK_CATEGORIES = ["Repair", "Spare Part", "Fluid / Oil", "Other"];

const PIPELINE_STEPS = [
  { key: "Inspection", label: "Vehicle Check" },
  { key: "In Progress", label: "In Progress" },
  { key: "Waiting for Approval", label: "Customer Approval" },
  { key: "Completed", label: "Completed" },
];

const STAGE_BADGE = {
  "Vehicle Received": "bg-slate-100 text-slate-700",
  Inspection: "bg-sky-100 text-sky-800",
  "Waiting for Approval": "bg-amber-100 text-amber-900",
  "In Progress": "bg-blue-100 text-blue-800",
  "Waiting for Parts": "bg-purple-100 text-purple-800",
  Completed: "bg-emerald-100 text-emerald-800",
};

const WORK_STATUS_BADGE = {
  "Pending Approval": "bg-amber-100 text-amber-900",
  Approved: "bg-emerald-100 text-emerald-800",
  Rejected: "bg-red-100 text-red-700",
};

function formatDateTime(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDateOnly(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function getPipelineProgress(stage, additionalWorks = []) {
  const hasPending = additionalWorks.some(
    (w) => w.status === "Pending Approval",
  );
  const hasResponded = additionalWorks.some(
    (w) => w.status === "Approved" || w.status === "Rejected",
  );

  if (stage === "Completed") return { activeIdx: 3, approvalState: "done" };
  if (stage === "Waiting for Approval" || hasPending) {
    return { activeIdx: 2, approvalState: "pending" };
  }
  if (stage === "In Progress" || stage === "Waiting for Parts") {
    return {
      activeIdx: hasResponded ? 2 : 1,
      approvalState: hasResponded ? "done" : "idle",
    };
  }
  return { activeIdx: 0, approvalState: "idle" };
}

function ServiceBayManagement({
  readOnlyBays = false,
  filterAdditionalWork = false,
} = {}) {
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

  // Vehicle Details Modal State
  const [selectedBayId, setSelectedBayId] = useState(null);
  const [notesInput, setNotesInput] = useState("");
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [modalFeedback, setModalFeedback] = useState({ type: "", text: "" });

  // Add Additional Work / Issue Form State
  const [workTitle, setWorkTitle] = useState("");
  const [workCategory, setWorkCategory] = useState("Repair");
  const [workCost, setWorkCost] = useState("");
  const [workDesc, setWorkDesc] = useState("");
  const [addingWork, setAddingWork] = useState(false);
  const [removingItemId, setRemovingItemId] = useState(null);

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
    if (!trimmedName) {
      setError("Please enter a bay name (e.g., Bay 4).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/service-bays", {
        bayName: trimmedName,
        bayType,
      });

      if (res.data.success && res.data.bay) {
        setBays((prev) =>
          [...prev, res.data.bay].sort((a, b) =>
            a.bayName.localeCompare(b.bayName),
          ),
        );
        setBayName("");
        setBayType("General");
        setShowAddForm(false);
        setSuccessMsg(`Service bay '${res.data.bay.bayName}' created.`);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add service bay.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBayStatus = async (bay) => {
    setError("");
    setSuccessMsg("");
    setTogglingId(bay._id);

    try {
      const nextAvailable = !bay.isAvailable;
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

  const openVehicleModal = (bay) => {
    const svc = bay.currentServiceId;
    if (!svc) return;
    setSelectedBayId(bay._id);
    setNotesInput(svc.inspectionNotes || "");
    setWorkTitle("");
    setWorkCategory("Repair");
    setWorkCost("");
    setWorkDesc("");
    setConfirmComplete(false);
    setModalFeedback({ type: "", text: "" });
  };

  const closeVehicleModal = () => {
    if (savingStage || savingNotes || addingWork) return;
    setSelectedBayId(null);
    setConfirmComplete(false);
    setModalFeedback({ type: "", text: "" });
  };

  // Advance stage cleanly
  const handleAdvanceStage = async (targetStage) => {
    if (!selectedBayId) return;

    if (targetStage === "Completed" && !confirmComplete) {
      setConfirmComplete(true);
      return;
    }

    setSavingStage(true);
    setModalFeedback({ type: "", text: "" });
    setError("");
    setSuccessMsg("");

    try {
      const res = await api.patch(
        `/service-bays/${selectedBayId}/job-sheet`,
        { status: targetStage },
      );

      if (res.data.success && res.data.bay) {
        setBays((prev) =>
          prev.map((b) => (b._id === selectedBayId ? res.data.bay : b)),
        );
        setConfirmComplete(false);

        if (targetStage === "Completed") {
          setSuccessMsg(
            res.data.message || "Service completed and bay released.",
          );
          setSelectedBayId(null);
        } else {
          setModalFeedback({
            type: "success",
            text: res.data.message || `Stage updated to '${targetStage}'.`,
          });
        }
      }
    } catch (err) {
      setModalFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to update service stage.",
      });
    } finally {
      setSavingStage(false);
    }
  };

  // Add Additional Work / Issue item and send to Customer for approval
  const handleAddAdditionalWork = async (e) => {
    e.preventDefault();
    if (!selectedBayId) return;

    const trimmedTitle = workTitle.trim();
    const numericCost = Number(workCost);
    if (trimmedTitle.length < 2) {
      setModalFeedback({
        type: "error",
        text: "Please enter the issue or spare part name.",
      });
      return;
    }
    if (!Number.isFinite(numericCost) || numericCost < 0) {
      setModalFeedback({
        type: "error",
        text: "Please enter a valid estimated price in Rs.",
      });
      return;
    }

    setAddingWork(true);
    setModalFeedback({ type: "", text: "" });

    try {
      const res = await api.post(
        `/service-bays/${selectedBayId}/additional-work`,
        {
          title: trimmedTitle,
          category: workCategory,
          estimatedCost: numericCost,
          description: workDesc.trim(),
        },
      );

      if (res.data.success && res.data.bay) {
        setBays((prev) =>
          prev.map((b) => (b._id === selectedBayId ? res.data.bay : b)),
        );
        setWorkTitle("");
        setWorkCost("");
        setWorkDesc("");
        setModalFeedback({
          type: "success",
          text:
            res.data.message ||
            `"${trimmedTitle}" sent to customer for approval.`,
        });
      }
    } catch (err) {
      setModalFeedback({
        type: "error",
        text:
          err.response?.data?.message || "Failed to send additional work item.",
      });
    } finally {
      setAddingWork(false);
    }
  };

  // Remove a still-pending Additional Work item
  const handleRemoveWorkItem = async (itemId) => {
    if (!selectedBayId) return;
    setRemovingItemId(itemId);
    setModalFeedback({ type: "", text: "" });

    try {
      const res = await api.delete(
        `/service-bays/${selectedBayId}/additional-work/${itemId}`,
      );
      if (res.data.success && res.data.bay) {
        setBays((prev) =>
          prev.map((b) => (b._id === selectedBayId ? res.data.bay : b)),
        );
        setModalFeedback({ type: "success", text: "Pending item removed." });
      }
    } catch (err) {
      setModalFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to remove item.",
      });
    } finally {
      setRemovingItemId(null);
    }
  };

  // Save technical / inspection notes independently
  const handleSaveNotes = async (e) => {
    e.preventDefault();
    if (!selectedBayId) return;

    setSavingNotes(true);
    setModalFeedback({ type: "", text: "" });

    try {
      const res = await api.patch(`/service-bays/${selectedBayId}/job-sheet`, {
        inspectionNotes: notesInput,
      });

      if (res.data.success && res.data.bay) {
        setBays((prev) =>
          prev.map((b) => (b._id === selectedBayId ? res.data.bay : b)),
        );
        setModalFeedback({
          type: "success",
          text: "Inspection notes saved.",
        });
      }
    } catch (err) {
      setModalFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to save notes.",
      });
    } finally {
      setSavingNotes(false);
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

  const activeBay = useMemo(
    () => bays.find((b) => b._id === selectedBayId) || null,
    [bays, selectedBayId],
  );

  const visibleBays = useMemo(() => {
    if (!filterAdditionalWork) return bays;
    return bays.filter((b) => {
      const svc = b.currentServiceId;
      return (
        Boolean(svc) &&
        (svc.additionalWorkRequired ||
          svc.status === "Waiting for Approval" ||
          (svc.additionalWorks || []).length > 0)
      );
    });
  }, [bays, filterAdditionalWork]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            {filterAdditionalWork
              ? "Additional Work & Approval Queue"
              : "Service Bay Control"}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Click any occupied vehicle bay to inspect full details, advance
            stages, or send additional issues to the customer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!readOnlyBays && (
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#13294b] transition hover:bg-slate-50"
            >
              {showAddForm ? "Close" : "+ Add Bay"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setRefreshCount((prev) => prev + 1)}
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

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
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
          <p className="text-xs font-medium text-slate-500">In Service</p>
          <p className="mt-1 text-2xl font-extrabold text-orange-700">
            {summary.occupied}
          </p>
        </div>
      </div>

      {/* Add New Service Bay (collapsible) */}
      {!readOnlyBays && showAddForm && (
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
      ) : visibleBays.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-slate-500 shadow-2xs">
          {filterAdditionalWork
            ? "No vehicles currently have additional work or approval requests."
            : "No service bays available."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleBays.map((bay) => {
            const svc = bay.currentServiceId || null;
            const vSnap = svc?.vehicleSnapshot || svc?.vehicleId || null;
            const cust = svc?.customerId || {};
            const pkg = svc?.appointmentId?.packageId || null;
            const inService = !bay.isAvailable && Boolean(svc);
            const currentStage = svc?.status || "Inspection";
            const works = Array.isArray(svc?.additionalWorks)
              ? svc.additionalWorks
              : [];
            const pendingCount = works.filter(
              (w) => w.status === "Pending Approval",
            ).length;
            const approvedCount = works.filter(
              (w) => w.status === "Approved",
            ).length;
            const { activeIdx } = getPipelineProgress(currentStage, works);

            return (
              <div
                key={bay._id}
                role={inService ? "button" : undefined}
                tabIndex={inService ? 0 : undefined}
                onClick={inService ? () => openVehicleModal(bay) : undefined}
                onKeyDown={
                  inService
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openVehicleModal(bay);
                        }
                      }
                    : undefined
                }
                className={`group flex flex-col rounded-2xl border bg-white p-4 shadow-2xs transition ${
                  inService
                    ? "cursor-pointer border-orange-200 hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-md focus:ring-2 focus:ring-orange-400 focus:outline-none"
                    : bay.isAvailable
                      ? "border-emerald-200"
                      : "border-slate-300"
                }`}
              >
                {/* Bay Header */}
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

                {/* Vehicle Info & Clean 4-Step Bar */}
                <div className="mt-3 flex-1">
                  {inService && vSnap ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-block rounded border-2 border-black bg-yellow-400 px-2 py-0.5 text-[11px] font-extrabold tracking-widest text-black uppercase">
                          {vSnap.registrationNo || "Vehicle"}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            STAGE_BADGE[currentStage] ||
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                          {currentStage}
                        </span>
                      </div>

                      <div>
                        <p className="text-sm font-bold text-[#13294b] group-hover:text-orange-700">
                          {[vSnap.brand, vSnap.modelName]
                            .filter(Boolean)
                            .join(" ") || vSnap.vehicleType}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {vSnap.vehicleType || "Vehicle"}
                          {pkg?.packageName ? ` · ${pkg.packageName}` : ""}
                        </p>
                      </div>

                      {/* Clean 4-Step Progress Indicator */}
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
                        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                          <span>
                            Step {activeIdx + 1} of {PIPELINE_STEPS.length}
                          </span>
                          <span className="text-[#13294b]">{currentStage}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {PIPELINE_STEPS.map((step, idx) => (
                            <div
                              key={step.key}
                              title={step.label}
                              className={`h-1.5 rounded-full ${
                                idx < activeIdx
                                  ? "bg-emerald-500"
                                  : idx === activeIdx
                                    ? "bg-orange-600"
                                    : "bg-slate-200"
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500">
                        Customer: {cust.name || "Customer"}
                        {cust.contactNo ? ` · ${cust.contactNo}` : ""}
                      </p>

                      {/* Live Customer Approval Indicators */}
                      {(pendingCount > 0 || approvedCount > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          {pendingCount > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                              ⏳ {pendingCount} awaiting customer
                            </span>
                          )}
                          {approvedCount > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              ✓ {approvedCount} approved
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-xs text-slate-500">
                      {bay.isAvailable
                        ? "Ready for the next vehicle."
                        : "Bay manually locked."}
                    </p>
                  )}
                </div>

                {/* Card Footer */}
                <div className="mt-3 border-t border-gray-100 pt-3">
                  {inService ? (
                    <div className="flex items-center justify-between text-xs font-semibold text-[#13294b] group-hover:text-orange-700">
                      <span>Open Vehicle &amp; Service Pipeline</span>
                      <span className="transition group-hover:translate-x-0.5">
                        →
                      </span>
                    </div>
                  ) : readOnlyBays ? (
                    <p className="text-center text-[11px] font-medium text-slate-400">
                      {bay.isAvailable ? "Bay Available" : "Bay Locked"}
                    </p>
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

      {/* Vehicle Details, Clean Pipeline & Customer Approval Modal */}
      {activeBay &&
        activeBay.currentServiceId &&
        (() => {
          const svc = activeBay.currentServiceId;
          const vSnap = svc.vehicleSnapshot || svc.vehicleId || {};
          const cust = svc.customerId || {};
          const appt = svc.appointmentId || {};
          const pkg = appt.packageId || {};
          const currentStage = svc.status || "Inspection";
          const works = Array.isArray(svc.additionalWorks)
            ? svc.additionalWorks
            : [];
          const logs = Array.isArray(svc.statusLogs) ? svc.statusLogs : [];
          const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

          const pendingItems = works.filter(
            (w) => w.status === "Pending Approval",
          );
          const approvedTotal = works.reduce(
            (sum, w) =>
              w.status === "Approved"
                ? sum + (Number(w.estimatedCost) || 0)
                : sum,
            0,
          );

          const { activeIdx } = getPipelineProgress(currentStage, works);

          const vehicleTitle =
            [vSnap.brand, vSnap.modelName].filter(Boolean).join(" ") ||
            vSnap.vehicleType ||
            "Vehicle";

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:p-5"
              onClick={closeVehicleModal}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                {/* Sticky Vehicle Header */}
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
                        {activeBay.bayName} ({activeBay.bayType}) · Checked in:{" "}
                        {formatDateTime(svc.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        STAGE_BADGE[currentStage] || "bg-white text-[#13294b]"
                      }`}
                    >
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                      {currentStage}
                    </span>
                    <button
                      type="button"
                      onClick={closeVehicleModal}
                      disabled={savingStage || savingNotes || addingWork}
                      aria-label="Close vehicle modal"
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

                  {/* Section 1: Clean Horizontal Service Pipeline + Focused Next-Step Action */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#13294b]">
                        Service Pipeline
                      </h3>
                      {currentStage === "Waiting for Parts" && (
                        <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                          Paused — Waiting for Spare Parts
                        </span>
                      )}
                    </div>

                    {/* Horizontal 4-Step Visual Track */}
                    <div className="flex items-start">
                      {PIPELINE_STEPS.map((step, idx) => {
                        const isDone = idx < activeIdx;
                        const isCurrent = idx === activeIdx;
                        const isLast = idx === PIPELINE_STEPS.length - 1;

                        return (
                          <div
                            key={step.key}
                            className={`flex items-start ${isLast ? "" : "flex-1"}`}
                          >
                            <div className="flex w-20 shrink-0 flex-col items-center text-center sm:w-24">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
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
                                {step.label}
                              </span>
                            </div>
                            {!isLast && (
                              <span
                                className={`mt-3.5 h-0.5 flex-1 ${
                                  isDone ? "bg-emerald-500" : "bg-slate-200"
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Clean Single-Focus Action Bar for Current Stage */}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-slate-50 p-3.5">
                      {currentStage === "Inspection" ||
                      currentStage === "Vehicle Received" ? (
                        <>
                          <p className="text-xs text-slate-600">
                            Finish checking the vehicle, log any issues below,
                            or begin active servicing.
                          </p>
                          <button
                            type="button"
                            disabled={savingStage}
                            onClick={() => handleAdvanceStage("In Progress")}
                            className="rounded-lg bg-orange-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-800 disabled:opacity-50"
                          >
                            {savingStage
                              ? "Updating..."
                              : "Start Service (In Progress) →"}
                          </button>
                        </>
                      ) : currentStage === "Waiting for Approval" ? (
                        <>
                          <p className="text-xs font-medium text-amber-900">
                            {pendingItems.length > 0
                              ? `Waiting for customer to approve/reject ${pendingItems.length} item(s). Status resumes automatically once answered.`
                              : "All items answered — ready to continue servicing."}
                          </p>
                          <button
                            type="button"
                            disabled={savingStage}
                            onClick={() => handleAdvanceStage("In Progress")}
                            className="rounded-lg bg-[#13294b] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#1a3660] disabled:opacity-50"
                          >
                            {savingStage
                              ? "Updating..."
                              : "Continue In Progress →"}
                          </button>
                        </>
                      ) : currentStage === "Waiting for Parts" ? (
                        <>
                          <p className="text-xs text-slate-600">
                            Service paused awaiting spare parts.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={savingStage}
                              onClick={() => handleAdvanceStage("In Progress")}
                              className="rounded-lg bg-orange-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-800 disabled:opacity-50"
                            >
                              {savingStage
                                ? "Updating..."
                                : "Parts Arrived — Resume →"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-slate-600">
                            {pendingItems.length > 0
                              ? `${pendingItems.length} additional item(s) still awaiting customer approval.`
                              : "Vehicle is actively in service. Mark completed once quality check is done."}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {confirmComplete ? (
                              <>
                                <button
                                  type="button"
                                  disabled={savingStage}
                                  onClick={() =>
                                    handleAdvanceStage("Completed")
                                  }
                                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  {savingStage
                                    ? "Completing..."
                                    : "Confirm Complete & Release Bay ✓"}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingStage}
                                  onClick={() => setConfirmComplete(false)}
                                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={savingStage}
                                  onClick={() =>
                                    handleAdvanceStage("Waiting for Parts")
                                  }
                                  className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-800 transition hover:bg-purple-50 disabled:opacity-50"
                                >
                                  Pause for Parts
                                </button>
                                <button
                                  type="button"
                                  disabled={savingStage}
                                  onClick={() =>
                                    handleAdvanceStage("Completed")
                                  }
                                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  Complete Service &amp; Release Bay ✓
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Section 2: Additional Issues & Spare Parts (Live Customer Approval) */}
                  <div className="rounded-2xl border border-orange-200 bg-orange-50/30 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-[#13294b]">
                          Issues &amp; Additional Parts (Customer Approval)
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Anything you add here immediately appears on the
                          customer&apos;s dashboard for Approve / Reject.
                        </p>
                      </div>
                      {approvedTotal > 0 && (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                          Approved Extras: Rs. {approvedTotal.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Add New Issue / Part Form */}
                    <form
                      onSubmit={handleAddAdditionalWork}
                      className="mt-3.5 grid grid-cols-1 gap-2.5 rounded-xl border border-gray-200 bg-white p-3.5 sm:grid-cols-12"
                    >
                      <div className="sm:col-span-5">
                        <label
                          htmlFor="workTitle"
                          className="mb-1 block text-[11px] font-semibold text-slate-600"
                        >
                          Issue / Part Name
                        </label>
                        <input
                          id="workTitle"
                          type="text"
                          required
                          maxLength={120}
                          value={workTitle}
                          onChange={(e) => setWorkTitle(e.target.value)}
                          placeholder="e.g. Front Brake Pads Replacement"
                          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-orange-700"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label
                          htmlFor="workCategory"
                          className="mb-1 block text-[11px] font-semibold text-slate-600"
                        >
                          Category
                        </label>
                        <select
                          id="workCategory"
                          value={workCategory}
                          onChange={(e) => setWorkCategory(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-orange-700"
                        >
                          {WORK_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-4">
                        <label
                          htmlFor="workCost"
                          className="mb-1 block text-[11px] font-semibold text-slate-600"
                        >
                          Estimated Cost (Rs.)
                        </label>
                        <input
                          id="workCost"
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={workCost}
                          onChange={(e) => setWorkCost(e.target.value)}
                          placeholder="e.g. 8500"
                          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-orange-700"
                        />
                      </div>

                      <div className="sm:col-span-8">
                        <input
                          type="text"
                          maxLength={500}
                          value={workDesc}
                          onChange={(e) => setWorkDesc(e.target.value)}
                          placeholder="Optional note for customer (e.g. Pads are worn down to 2mm)"
                          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-orange-700"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <button
                          type="submit"
                          disabled={addingWork}
                          className="w-full rounded-lg bg-[#13294b] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1a3660] disabled:opacity-50"
                        >
                          {addingWork ? "Sending..." : "+ Send to Customer"}
                        </button>
                      </div>
                    </form>

                    {/* List of Sent Additional Work Items & Live Customer Decisions */}
                    {works.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {works.map((item) => (
                          <div
                            key={item._id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-[#13294b]">
                                  {item.title}
                                </span>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {item.category || "Repair"}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    WORK_STATUS_BADGE[item.status] ||
                                    "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {item.status === "Pending Approval"
                                    ? "Waiting Customer"
                                    : item.status === "Approved"
                                      ? "✓ Approved by Customer"
                                      : "✕ Rejected by Customer"}
                                </span>
                              </div>
                              {item.description && (
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-xs font-extrabold text-[#13294b]">
                                Rs.{" "}
                                {Number(
                                  item.estimatedCost || 0,
                                ).toLocaleString()}
                              </span>
                              {item.status === "Pending Approval" && (
                                <button
                                  type="button"
                                  disabled={removingItemId === item._id}
                                  onClick={() => handleRemoveWorkItem(item._id)}
                                  className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                                >
                                  {removingItemId === item._id
                                    ? "..."
                                    : "Remove"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-center text-xs text-slate-500">
                        No additional issues or extra parts reported yet.
                      </p>
                    )}
                  </div>

                  {/* Section 3: Complete Vehicle, Package & Customer Details */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-slate-50/70 p-4">
                      <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                        Vehicle &amp; Service Package
                      </p>
                      <dl className="mt-2.5 space-y-1.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Brand / Model</dt>
                          <dd className="text-right font-semibold text-[#13294b]">
                            {vehicleTitle}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Package</dt>
                          <dd className="text-right font-semibold text-orange-800">
                            {pkg.packageName || "Standard Service"}
                            {typeof pkg.price === "number"
                              ? ` (Rs. ${pkg.price.toLocaleString()})`
                              : ""}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Appointment</dt>
                          <dd className="font-medium text-slate-800">
                            {formatDateOnly(appt.serviceDate)}
                            {appt.serviceTime ? ` · ${appt.serviceTime}` : ""}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Handover</dt>
                          <dd className="font-medium text-slate-800">
                            {appt.requiresPickup
                              ? "Pickup & Delivery"
                              : "Workshop Drop-off"}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl border border-gray-200 bg-slate-50/70 p-4">
                        <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                          Customer Details
                        </p>
                        <p className="mt-1.5 text-sm font-bold text-[#13294b]">
                          {cust.name || "Customer"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {cust.contactNo || "No phone"} ·{" "}
                          {cust.email || "No email"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-slate-50/70 p-4">
                        <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                          Latest Activity
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-700">
                          {latestLog
                            ? `${latestLog.note || latestLog.stage} — ${latestLog.updatedByName || "Staff"} (${formatDateTime(latestLog.updatedAt)})`
                            : `Checked in: ${formatDateTime(svc.createdAt)}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Inspection & Technical Notes */}
                  <form
                    onSubmit={handleSaveNotes}
                    className="space-y-2.5 rounded-2xl border border-gray-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="vehicleNotes"
                        className="text-xs font-bold text-[#13294b]"
                      >
                        Inspection &amp; Technical Notes (visible to customer)
                      </label>
                      <button
                        type="submit"
                        disabled={savingNotes || savingStage}
                        className="rounded-lg bg-[#13294b] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a3660] disabled:opacity-50"
                      >
                        {savingNotes ? "Saving..." : "Save Notes"}
                      </button>
                    </div>

                    <textarea
                      id="vehicleNotes"
                      rows={3}
                      maxLength={2000}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Record inspection findings, oil grade, battery/tyre check..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-orange-700"
                    />
                  </form>

                  {/* Section 5: Stage & Approval History */}
                  {logs.length > 0 && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                      <p className="mb-2.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                        Activity Timeline ({logs.length})
                      </p>
                      <div className="space-y-2">
                        {[...logs].reverse().map((entry, idx) => (
                          <div
                            key={`${entry.stage}-${entry.updatedAt}-${idx}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  STAGE_BADGE[entry.stage] ||
                                  "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {entry.stage}
                              </span>
                              <span className="font-medium text-slate-700">
                                {entry.updatedByName || "Staff"}
                              </span>
                              {entry.note && (
                                <span className="text-slate-500">
                                  — {entry.note}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {formatDateTime(entry.updatedAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

export default ServiceBayManagement;
