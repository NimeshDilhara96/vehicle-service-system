import { useEffect, useState } from "react";
import api from "../services/api";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <div
              key={v._id}
              className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs transition hover:border-gray-300"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-block rounded-lg bg-[#13294b] px-3 py-1 text-xs font-bold tracking-wider text-white uppercase">
                    {v.registrationNo}
                  </span>
                  <span className="rounded-full bg-[#fef3e2] px-2.5 py-0.5 text-[11px] font-semibold text-orange-800">
                    {v.vehicleType}
                  </span>
                </div>

                <h3 className="mt-3.5 text-base font-bold text-[#13294b]">
                  {[v.brand, v.modelName].filter(Boolean).join(" ") ||
                    "Registered Vehicle"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Added on{" "}
                  {v.createdAt
                    ? new Date(v.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "Recently"}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-end border-t border-gray-100 pt-3">
                <button
                  type="button"
                  disabled={deletingId === v._id}
                  onClick={() => handleDeleteVehicle(v._id)}
                  className="text-xs font-semibold text-red-600 transition hover:text-red-800 disabled:opacity-50"
                >
                  {deletingId === v._id ? "Removing..." : "Remove Vehicle"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Vehicle;

