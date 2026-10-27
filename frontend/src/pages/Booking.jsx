import { useState, useEffect, useCallback } from "react";
import { SmartMap } from "smartmap-pro";
import api from "../services/api";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";

const TIME_SLOTS = [
  "09:00 AM",
  "10:30 AM",
  "12:00 PM",
  "01:30 PM",
  "03:00 PM",
  "04:30 PM",
];

const inputClass =
  "py-2.5! rounded-lg! border-gray-300! focus:border-orange-700! focus:ring-orange-700!";
const buttonClass =
  "py-2.5! font-semibold! bg-orange-700! hover:bg-orange-800! text-white!";

function Booking({ initialTab = "new", onNavigateToVehicles, onBookingsChange }) {
  const [activeSubTab, setActiveSubTab] = useState(initialTab); // 'new' | 'list'
  const [vehicles, setVehicles] = useState([]);
  const [packages, setPackages] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [calculatingFare, setCalculatingFare] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Booking Form State
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceTime, setServiceTime] = useState(TIME_SLOTS[0]);
  const [requiresPickup, setRequiresPickup] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [pickupCharge, setPickupCharge] = useState(0);
  const [pickupDistanceKm, setPickupDistanceKm] = useState(0);
  const [pickupError, setPickupError] = useState("");
  const [mapResetCount, setMapResetCount] = useState(0);

  // Load vehicles and service packages
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      api.get("/vehicles"),
      api.get("/appointments/packages"),
      api.get("/appointments"),
    ])
      .then(([vehRes, pkgRes, bookRes]) => {
        if (!isMounted) return;
        if (vehRes.data.success) {
          const vehList = vehRes.data.vehicles || [];
          setVehicles(vehList);
          if (vehList.length > 0) {
            setSelectedVehicleId(vehList[0]._id);
          }
        }
        if (pkgRes.data.success) {
          const pkgList = pkgRes.data.packages || [];
          setPackages(pkgList);
          if (pkgList.length > 0) {
            setSelectedPackageId(pkgList[0]._id);
          }
          if (pkgRes.data.workshops) {
            setWorkshops(pkgRes.data.workshops);
            setSelectedWorkshop(pkgRes.data.workshops[0] || null);
          }
        }
        if (bookRes.data.success) {
          const appList = bookRes.data.appointments || [];
          setBookings(appList);
          if (onBookingsChange) {
            onBookingsChange(appList);
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.data?.message || "Failed to load booking data.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedVehicle = vehicles.find((v) => v._id === selectedVehicleId);
  const selectedPackage = packages.find((p) => p._id === selectedPackageId);

  // Map route handler for pickup calculation
  const handleMapOrderReady = useCallback(
    async (data) => {
      if (!data || !data.startCoords) return;
      const coords = data.startCoords;
      setError("");
      setPickupError("");

      // Immediate client-side + map check for Western Province bounds
      const [lat, lng] = coords;
      const isInsideWesternProvince =
        lat >= 6.4 && lat <= 7.35 && lng >= 79.8 && lng <= 80.3;

      if (data.outOfZone || !isInsideWesternProvince) {
        setPickupCoords(null);
        setPickupCharge(0);
        setPickupDistanceKm(0);
        setPickupError(
          "Pickup & delivery service is not available in this area yet. Currently available only within the Western Province (Colombo, Gampaha, Kalutara).",
        );
        return;
      }

      setPickupCoords(coords);
      setCalculatingFare(true);

      try {
        const res = await api.post("/appointments/calculate-pickup-fee", {
          endCoords: coords,
          vehicleType: selectedVehicle?.vehicleType || "Car",
        });

        if (res.data.success) {
          setPickupCharge(res.data.pickupCharge || 0);
          setPickupDistanceKm(res.data.distanceKm || 0);
          if (res.data.workshop) {
            setSelectedWorkshop(res.data.workshop);
          }
        }
      } catch (err) {
        const msg =
          err.response?.data?.message || "Could not calculate pickup fee.";
        setPickupCoords(null);
        setPickupCharge(0);
        setPickupDistanceKm(0);
        setPickupError(msg);
      } finally {
        setCalculatingFare(false);
      }
    },
    [selectedVehicle],
  );

  const handleResetMap = (e) => {
    e.stopPropagation();
    setMapResetCount((prev) => prev + 1);
    setPickupCoords(null);
    setPickupCharge(0);
    setPickupDistanceKm(0);
    setPickupError("");
  };

  const handleCreateBooking = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!selectedVehicleId) {
      setError("Please select a vehicle.");
      return;
    }
    if (!selectedPackageId) {
      setError("Please select a service package.");
      return;
    }
    if (!serviceDate) {
      setError("Please choose a service date.");
      return;
    }
    if (requiresPickup && !pickupCoords) {
      setError(
        "Please choose a pickup location on the map for pickup & delivery service."
      );
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        vehicleId: selectedVehicleId,
        packageId: selectedPackageId,
        serviceDate,
        serviceTime,
        requiresPickup,
        pickupLocation: requiresPickup
          ? {
              address: pickupAddress || "Pinned Map Location",
              coordinates: pickupCoords,
            }
          : undefined,
      };

      const res = await api.post("/appointments", payload);

      if (res.data.success) {
        setSuccessMsg(
          "Appointment successfully booked! Initial invoice generated."
        );
        // Refresh bookings
        const bookRes = await api.get("/appointments");
        if (bookRes.data.success) {
          const appList = bookRes.data.appointments || [];
          setBookings(appList);
          if (onBookingsChange) {
            onBookingsChange(appList);
          }
        }
        // Switch to list view to inspect booking
        setActiveSubTab("list");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalEstimate =
    (selectedPackage ? selectedPackage.price : 0) +
    (requiresPickup ? pickupCharge : 0);

  // Today's date in YYYY-MM-DD for min date
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-5">
      {/* Top Header & Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            Service Bookings
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Book a maintenance service and track previous appointments.
          </p>
        </div>

        <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => {
              setActiveSubTab("new");
              setError("");
              setSuccessMsg("");
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              activeSubTab === "new"
                ? "bg-[#13294b] text-white"
                : "text-slate-600 hover:text-[#13294b]"
            }`}
          >
            + New Booking
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSubTab("list");
              setError("");
              setSuccessMsg("");
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              activeSubTab === "list"
                ? "bg-[#13294b] text-white"
                : "text-slate-600 hover:text-[#13294b]"
            }`}
          >
            My Bookings ({bookings.length})
          </button>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{successMsg}</Alert>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs">
          Loading booking details...
        </div>
      ) : activeSubTab === "new" ? (
        /* New Booking Form */
        vehicles.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xs">
            <h3 className="text-base font-bold text-[#13294b]">
              No vehicle registered yet
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please register your vehicle before booking a service appointment.
            </p>
            {onNavigateToVehicles && (
              <button
                type="button"
                onClick={onNavigateToVehicles}
                className={`mt-4 inline-block rounded-lg px-5 py-2.5 text-xs font-semibold text-white ${buttonClass}`}
              >
                Go to My Vehicles
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleCreateBooking} className="space-y-5">
            {/* 1. Vehicle Selection */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
              <h2 className="mb-3 text-sm font-bold text-[#13294b] uppercase tracking-wider">
                1. Select Vehicle
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="selectVehicle"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Your Vehicles
                  </label>
                  <select
                    id="selectVehicle"
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-orange-700 focus:ring-1 focus:ring-orange-700"
                  >
                    {vehicles.map((v) => (
                      <option key={v._id} value={v._id}>
                        {v.registrationNo} — {[v.brand, v.modelName].filter(Boolean).join(" ")} ({v.vehicleType})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* 2. Service Packages Selection */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
              <h2 className="mb-3 text-sm font-bold text-[#13294b] uppercase tracking-wider">
                2. Select Service Package
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {packages.map((pkg) => {
                  const isSelected = selectedPackageId === pkg._id;
                  return (
                    <div
                      key={pkg._id}
                      onClick={() => setSelectedPackageId(pkg._id)}
                      className={`cursor-pointer rounded-xl border p-4 transition ${
                        isSelected
                          ? "border-orange-700 bg-orange-50/40 shadow-xs"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-bold text-[#13294b]">
                          {pkg.packageName}
                        </h3>
                        {isSelected && (
                          <span className="rounded-full bg-orange-700 p-1 text-white">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={3}
                              stroke="currentColor"
                              className="h-3 w-3"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m4.5 12.75 6 6 9-13.5"
                              />
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-500 line-clamp-3">
                        {pkg.description}
                      </p>
                      <p className="mt-3 text-base font-extrabold text-[#13294b]">
                        Rs. {pkg.price.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 3. Schedule Date & Time Slot */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
              <h2 className="mb-3 text-sm font-bold text-[#13294b] uppercase tracking-wider">
                3. Choose Date &amp; Time
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="serviceDate"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Service Date
                  </label>
                  <input
                    type="date"
                    id="serviceDate"
                    min={todayStr}
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    required
                    className={`w-full ${inputClass}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="serviceTime"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Time Slot
                  </label>
                  <select
                    id="serviceTime"
                    value={serviceTime}
                    onChange={(e) => setServiceTime(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-orange-700 focus:ring-1 focus:ring-orange-700"
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* 4. Pickup & Delivery Service (SmartMap Integration) */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#13294b] uppercase tracking-wider">
                    4. Pickup &amp; Delivery
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    We collect your vehicle, service it, and return it to you.
                  </p>
                  <span className="mt-1 inline-block rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                    Western Province Only (Colombo, Gampaha, Kalutara)
                  </span>
                </div>

                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={requiresPickup}
                    onChange={(e) => {
                      setRequiresPickup(e.target.checked);
                      if (!e.target.checked) {
                        setPickupCoords(null);
                        setPickupCharge(0);
                        setPickupDistanceKm(0);
                        setPickupError("");
                      }
                    }}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-orange-700 peer-checked:after:translate-x-full peer-focus:outline-none"></div>
                </label>
              </div>

              {requiresPickup && (
                <div className="mt-5 space-y-4 border-t border-gray-100 pt-4">
                  <Input
                    id="pickupAddress"
                    label="Pickup Address / Landmark"
                    placeholder="e.g. No 45, Galle Road, Bambalapitiya"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    className={inputClass}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-slate-50 p-3 text-xs text-[#13294b]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
                      <span>
                        Nearest Workshop:{" "}
                        <strong>
                          {selectedWorkshop?.name || "Colombo Main Workshop"}
                        </strong>{" "}
                        ({selectedWorkshop?.address || "Colombo, Sri Lanka"})
                      </span>
                    </div>
                    <span className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Auto-Assigned Nearest
                    </span>
                  </div>

                  <div className="relative">
                    <p className="mb-2 text-xs font-medium text-slate-600">
                      Search or Click your Pickup Location on the Map (auto-routes to nearest workshop):
                    </p>

                    <div className="relative mx-auto w-full [&_input]:text-xs sm:[&_input]:text-sm [&_.smart-map-container]:gap-2.5! [&_.smart-map-container>div:nth-of-type(2)]:h-56! sm:[&_.smart-map-container>div:nth-of-type(2)]:h-64!">
                      <button
                        type="button"
                        onClick={handleResetMap}
                        title="Clear Route"
                        className="absolute top-16 left-14 z-400 flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-800 shadow-md backdrop-blur-xs transition hover:bg-gray-100 active:scale-95"
                      >
                        Reset Map
                      </button>

                      <SmartMap
                        resetTrigger={mapResetCount}
                        workshops={workshops}
                        shopCoords={[6.9271, 79.8612]}
                        mode="routing"
                        theme="light"
                        showSearchBox={true}
                        showZoomControls={true}
                        osrmUrl="https://router.project-osrm.org/route/v1/driving"
                        onOrderReady={handleMapOrderReady}
                      />
                    </div>
                  </div>

                  <Alert type="error">{pickupError}</Alert>

                  {calculatingFare ? (
                    <div className="rounded-lg bg-orange-50 p-3 text-xs text-orange-800">
                      Calculating secure pickup fee based on vehicle type and distance...
                    </div>
                  ) : pickupCoords ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs text-[#13294b]">
                      <span>
                        Distance: <strong>{pickupDistanceKm} km</strong>
                      </span>
                      <span>
                        Pickup &amp; Delivery Fee:{" "}
                        <strong className="text-orange-700">
                          Rs. {pickupCharge.toLocaleString()}
                        </strong>
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {/* 5. Cost Summary & Submit */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-[#13294b]">
                    Initial Cost Estimate
                  </h3>
                  <p className="text-xs text-slate-500">
                    An initial estimate invoice will be generated upon booking.
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-extrabold text-orange-700">
                    Rs. {totalEstimate.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-400">
                    {requiresPickup ? "Includes Pickup & Delivery" : "Workshop Drop-off"}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={requiresPickup && (!!pickupError || calculatingFare)}
                  className={`w-full sm:w-auto! px-8! ${buttonClass}`}
                >
                  Confirm &amp; Book Service
                </Button>
              </div>
            </section>
          </form>
        )
      ) : (
        /* My Bookings List */
        <div className="space-y-4">
          {bookings.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xs">
              <p className="text-sm font-semibold text-[#13294b]">
                No appointments booked yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Create a new booking to schedule maintenance for your vehicle.
              </p>
            </div>
          ) : (
            bookings.map((app) => {
              const dateStr = app.serviceDate
                ? new Date(app.serviceDate).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "Scheduled";

              return (
                <div
                  key={app._id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs transition hover:border-gray-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-[#13294b] px-2.5 py-1 text-xs font-bold uppercase text-white">
                          {app.vehicleSnapshot?.registrationNo || "Vehicle"}
                        </span>
                        <span className="text-sm font-bold text-[#13294b]">
                          {[app.vehicleSnapshot?.brand, app.vehicleSnapshot?.modelName]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">
                        {app.packageId?.packageName || "Service Package"} · {dateStr} at{" "}
                        {app.serviceTime}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#fef3e2] px-3 py-1 text-[11px] font-semibold text-orange-800">
                        {app.status}
                      </span>
                    </div>
                  </div>

                  {/* Invoice / Pricing Details */}
                  {app.invoice && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-slate-600">
                      <div>
                        <span>Stage: <strong>{app.invoice.invoiceStage}</strong></span>
                        <span className="mx-2">·</span>
                        <span>Payment: <strong>{app.invoice.paymentStatus}</strong></span>
                      </div>
                      <div>
                        <span>
                          Total:{" "}
                          <strong className="text-sm font-bold text-[#13294b]">
                            Rs. {app.invoice.totalAmount?.toLocaleString()}
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default Booking;

