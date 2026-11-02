import { useEffect, useState } from "react";
import api from "../../services/api";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";

const vehicleTypes = ["Car", "Van", "SUV", "Jeep", "Crew Cab", "Other"];

const VEHICLE_REG_REGEX =
  /^(?:[A-Z]{2}[\s-]?)?(?:[A-Z]{2,3}|\d{1,3})[\s-]?\d{4}$/;

const inputClass =
  "py-2.5! rounded-lg! border-gray-300! focus:border-orange-700! focus:ring-orange-700!";
const buttonClass =
  "py-2.5! font-semibold! bg-orange-700! hover:bg-orange-800! text-white!";

function Vehicle({ onVehiclesLoaded }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [form, setForm] = useState({
    registrationNo: "",
    vehicleType: "Car",
    brand: "",
    modelName: "",
  });

  useEffect(() => {
    api
      .get("/vehicles")
      .then((res) => {
        if (res.data.success) {
          const list = res.data.vehicles || [];
          setVehicles(list);
          if (onVehiclesLoaded) {
            onVehiclesLoaded(list);
          }
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Failed to load vehicles.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [onVehiclesLoaded]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const normalizedRegNo = form.registrationNo.trim().toUpperCase();
    if (!VEHICLE_REG_REGEX.test(normalizedRegNo)) {
      setError(
        "Invalid vehicle registration number format (e.g., CAB-1234, AB-1234, 65-1234).",
      );
      return;
    }

    setSubmitting(true);

    try {
      const res = await api.post("/vehicles", {
        ...form,
        registrationNo: normalizedRegNo,
      });
      if (res.data.success) {
        const updated = [...vehicles, res.data.vehicle];
        setVehicles(updated);
        if (onVehiclesLoaded) {
          onVehiclesLoaded(updated);
        }
        setForm({
          registrationNo: "",
          vehicleType: "Car",
          brand: "",
          modelName: "",
        });
        setShowAddForm(false);
        setSuccessMsg("Vehicle registered successfully.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to register vehicle.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVehicle = async (id) => {
    setError("");
    setSuccessMsg("");
    setDeletingId(id);

    try {
      const res = await api.delete(`/vehicles/${id}`);
      if (res.data.success) {
        const updated = vehicles.filter((v) => v._id !== id);
        setVehicles(updated);
        if (onVehiclesLoaded) {
          onVehiclesLoaded(updated);
        }
        setSuccessMsg("Vehicle removed successfully.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete vehicle.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            My Vehicles
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage your registered vehicles for service bookings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError("");
            setSuccessMsg("");
            setShowAddForm((prev) => !prev);
          }}
          className="rounded-lg bg-orange-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-800"
        >
          {showAddForm ? "Cancel" : "+ Add New Vehicle"}
        </button>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{successMsg}</Alert>

      {/* Add Vehicle Form Card */}
      {showAddForm && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
          <h2 className="mb-4 text-base font-bold text-[#13294b]">
            Register a New Vehicle
          </h2>

          <form onSubmit={handleAddVehicle} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="registrationNo"
                name="registrationNo"
                label="Registration No."
                type="text"
                placeholder="CAB-1234"
                value={form.registrationNo}
                onChange={handleChange}
                required
                className={`${inputClass} uppercase`}
              />

              <div className="space-y-1.5">
                <label
                  htmlFor="vehicleType"
                  className="block text-sm font-medium text-gray-700"
                >
                  Vehicle Type
                </label>
                <select
                  id="vehicleType"
                  name="vehicleType"
                  value={form.vehicleType}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-orange-700 focus:ring-1 focus:ring-orange-700"
                >
                  {vehicleTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                id="brand"
                name="brand"
                label="Brand"
                type="text"
                placeholder="Toyota"
                value={form.brand}
                onChange={handleChange}
                required
                className={inputClass}
              />

              <Input
                id="modelName"
                name="modelName"
                label="Model"
                type="text"
                placeholder="Corolla"
                value={form.modelName}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddForm(false)}
                className="w-auto! px-5!"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={submitting}
                className={`w-auto! px-6! ${buttonClass}`}
              >
                Save Vehicle
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Vehicles List */}
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
          Loading your vehicles...
        </div>
      ) : vehicles.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xs">
          <p className="text-sm font-semibold text-[#13294b]">
            No vehicles registered yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Add your vehicle details to start booking services.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {vehicles.map((v) => {
            const title =
              [v.brand, v.modelName].filter(Boolean).join(" ") ||
              "Registered Vehicle";
            const added = v.createdAt ? new Date(v.createdAt) : null;
            const addedLabel = added
              ? added.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "Recently";

            return (
              <div
                key={v._id}
                className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-xs transition hover:shadow-md sm:flex-row sm:items-stretch"
              >
                {/* Photo */}
                <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 sm:h-auto sm:w-44">
                  {v.imageUrl ? (
                    <img
                      src={v.imageUrl}
                      alt={v.registrationNo}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.2}
                      stroke="currentColor"
                      className="h-14 w-14 text-slate-300"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 14.25h16.5M5.25 14.25l1.4-4.2a2 2 0 0 1 1.9-1.37h6.9a2 2 0 0 1 1.9 1.37l1.4 4.2M5.25 14.25v3h2.5v-3m8.5 0v3h2.5v-3"
                      />
                    </svg>
                  )}
                </div>

                {/* Details */}
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold text-[#13294b] sm:text-lg">
                        {title}
                      </h3>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Registered
                      </span>
                    </div>

                    {/* Number plate: yellow background, black text */}
                    <span className="mt-2 inline-block rounded-md border-2 border-black bg-yellow-400 px-4 py-1 text-sm font-extrabold tracking-widest text-black uppercase">
                      {v.registrationNo}
                    </span>

                    <div className="mt-3 flex flex-wrap items-center text-xs text-slate-600">
                      <span className="pr-3">{v.vehicleType}</span>
                      {v.brand && (
                        <span className="border-l border-gray-300 px-3">
                          {v.brand}
                        </span>
                      )}
                      {v.modelName && (
                        <span className="border-l border-gray-300 px-3">
                          {v.modelName}
                        </span>
                      )}
                      <span className="border-l border-gray-300 pl-3">
                        {addedLabel}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">Added on {addedLabel}</p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-end justify-between gap-2 sm:flex-col sm:items-end">
                  <span className="rounded-full bg-[#13294b] px-3 py-0.5 text-[11px] font-semibold text-white">
                    {v.vehicleType}
                  </span>
                  <button
                    type="button"
                    disabled={deletingId === v._id}
                    onClick={() => handleDeleteVehicle(v._id)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingId === v._id ? "Removing..." : "Remove Vehicle"}
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

export default Vehicle;

