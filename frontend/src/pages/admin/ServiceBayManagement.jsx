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

function ServiceBayManagement() {
  const [bays, setBays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Add Bay Form State
  const [bayName, setBayName] = useState("");
  const [bayType, setBayType] = useState("General");

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

  const summary = useMemo(() => {
    let available = 0;
    let occupied = 0;
    const occupiedVehicles = [];

    for (const b of bays) {
      if (b.isAvailable) {
        available += 1;
      } else {
        occupied += 1;
        if (b.currentServiceId) {
          occupiedVehicles.push({
            bayId: b._id,
            bayName: b.bayName,
            bayType: b.bayType,
            service: b.currentServiceId,
          });
        }
      }
    }
    return {
      total: bays.length,
      available,
      occupied,
      occupiedVehicles,
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
            Manage workshop bays, monitor occupied vehicles, and release bays
            when vehicles exit.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshCount((prev) => prev + 1)}
          className="rounded-lg bg-[#13294b] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
        >
          Refresh Bays
        </button>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{successMsg}</Alert>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Total Bays</p>
          <p className="mt-1 text-2xl font-extrabold text-[#13294b]">
            {summary.total}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">
            Available (Open) Bays
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">
            {summary.available}
          </p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Occupied Bays</p>
          <p className="mt-1 text-2xl font-extrabold text-orange-700">
            {summary.occupied}
          </p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Vehicles in Bay</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-700">
            {summary.occupiedVehicles.length}
          </p>
        </div>
      </div>

      {/* Add New Service Bay Form */}
      <form
        onSubmit={handleAddBay}
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:p-5"
      >
        <h2 className="mb-3 text-sm font-bold text-[#13294b]">
          Add New Service Bay
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              {submitting ? "Adding..." : "+ Add Service Bay"}
            </button>
          </div>
        </div>
      </form>

      {/* Vehicles Currently in Workshop Bays Table */}
      {summary.occupiedVehicles.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-2xs">
          <div className="border-b border-orange-100 bg-orange-50/60 px-5 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse" />
                <h2 className="text-sm font-bold text-[#13294b]">
                  Vehicles Currently in Service Bays ({summary.occupiedVehicles.length})
                </h2>
              </div>
              <span className="rounded-full bg-orange-100 px-3 py-0.5 text-[11px] font-bold text-orange-800">
                Live Workshop Activity
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-100 bg-slate-50 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Bay</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Assigned Mechanic</th>
                  <th className="px-4 py-3">Service Stage</th>
                  <th className="px-4 py-3">In Bay Since</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.occupiedVehicles.map((item) => {
                  const s = item.service;
                  const vSnap = s.vehicleSnapshot || {};
                  const cust = s.appointmentId?.customerDetails || s.customerId || {};
                  const mech = s.mechanicId || {};
                  const bayObj = bays.find((b) => b._id === item.bayId);

                  return (
                    <tr key={item.bayId} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 font-semibold text-[#13294b] whitespace-nowrap">
                        <span className="rounded-md bg-[#13294b] px-2 py-0.5 text-[11px] font-bold text-white">
                          {item.bayName}
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-500">
                          ({item.bayType})
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block rounded border border-black bg-yellow-400 px-2 py-0.5 text-[11px] font-extrabold tracking-wider text-black">
                          {vSnap.registrationNo || "Vehicle"}
                        </span>
                        <div className="mt-0.5 text-xs font-semibold text-slate-700">
                          {[vSnap.brand, vSnap.modelName].filter(Boolean).join(" ") ||
                            vSnap.vehicleType ||
                            "Vehicle"}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-semibold text-slate-800">{cust.name || "Customer"}</p>
                        <p className="text-[11px] text-slate-500">{cust.phone || cust.contactNo || "—"}</p>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-slate-700">
                          {mech.name || "Unassigned"}
                        </span>
                        {mech.contactNo && (
                          <p className="text-[11px] text-slate-500">{mech.contactNo}</p>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                          {s.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {s.createdAt
                          ? new Date(s.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {bayObj && (
                          <button
                            type="button"
                            disabled={togglingId === bayObj._id}
                            onClick={() => handleToggleBayStatus(bayObj)}
                            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {togglingId === bayObj._id ? "Releasing..." : "Release Bay"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Service Bays Grid */}
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
          Loading service bays...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {bays.map((bay) => {
            const activeService = bay.currentServiceId || null;
            const vehicleSnap = activeService?.vehicleSnapshot || null;
            const cust =
              activeService?.appointmentId?.customerDetails ||
              activeService?.customerId ||
              {};
            const mech = activeService?.mechanicId || {};

            return (
              <div
                key={bay._id}
                className={`flex flex-col justify-between rounded-2xl border p-5 shadow-2xs transition ${
                  bay.isAvailable
                    ? "border-emerald-200 bg-white"
                    : "border-orange-200 bg-orange-50/20"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[#13294b]">
                        {bay.bayName}
                      </h3>
                      <span className="mt-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {bay.bayType}
                      </span>
                    </div>

                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        bay.isAvailable
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-orange-200 bg-orange-100 text-orange-900"
                      }`}
                    >
                      {bay.isAvailable ? "Available" : "Occupied"}
                    </span>
                  </div>

                  {activeService && vehicleSnap ? (
                    <div className="mt-4 space-y-2 rounded-xl border border-orange-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-block rounded-md border-2 border-black bg-yellow-400 px-2.5 py-0.5 text-[11px] font-extrabold tracking-widest text-black uppercase">
                          {vehicleSnap.registrationNo || "Vehicle"}
                        </span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                          {activeService.status}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-[#13294b]">
                        {[vehicleSnap.brand, vehicleSnap.modelName]
                          .filter(Boolean)
                          .join(" ") || vehicleSnap.vehicleType}
                      </p>

                      <div className="border-t border-dashed border-gray-200 pt-2 text-[11px] text-slate-600 space-y-1">
                        <p className="flex justify-between">
                          <span className="text-slate-400">Customer:</span>
                          <span className="font-semibold text-slate-800">
                            {cust.name || "Customer"}{" "}
                            {cust.phone ? `(${cust.phone})` : ""}
                          </span>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-slate-400">Mechanic:</span>
                          <span className="font-semibold text-slate-800">
                            {mech.name || "Assigned"}
                          </span>
                        </p>
                        {activeService.createdAt && (
                          <p className="flex justify-between">
                            <span className="text-slate-400">Started:</span>
                            <span className="text-slate-600">
                              {new Date(activeService.createdAt).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs text-slate-500">
                      {bay.isAvailable
                        ? "Ready to accept incoming vehicle."
                        : "Bay manually locked / occupied."}
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    disabled={togglingId === bay._id}
                    onClick={() => handleToggleBayStatus(bay)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                      bay.isAvailable
                        ? "border border-gray-300 bg-slate-50 text-[#13294b] hover:bg-slate-100"
                        : "bg-emerald-700 text-white hover:bg-emerald-800"
                    }`}
                  >
                    {togglingId === bay._id
                      ? "Updating..."
                      : bay.isAvailable
                        ? "Mark as Occupied"
                        : "Release Bay (Mark Available)"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ServiceBayManagement;

