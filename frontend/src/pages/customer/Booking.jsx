import { useState, useEffect, useCallback, useMemo } from "react";
import { SmartMap } from "smartmap-pro";
import api from "../../services/api";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";

const TIME_SLOTS = [
  "09:00 AM",
  "10:30 AM",
  "12:00 PM",
  "01:30 PM",
  "03:00 PM",
  "04:30 PM",
];

function getLocalTodayStr(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseSlotToMinutes(slotStr) {
  if (typeof slotStr !== "string") return -1;
  const match = slotStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function isSlotPastForDate(dateStr, slotStr, now = new Date()) {
  if (!dateStr || !slotStr) return false;
  const today = getLocalTodayStr(now);
  if (dateStr < today) return true;
  if (dateStr > today) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slotMinutes = parseSlotToMinutes(slotStr);
  return slotMinutes <= currentMinutes;
}

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

  // Today's local date in YYYY-MM-DD for min date & initial slot check
  const todayStr = getLocalTodayStr();

  // Booking Form State
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [serviceDate, setServiceDate] = useState(todayStr);
  const [serviceTime, setServiceTime] = useState(() => {
    const firstFuture = TIME_SLOTS.find((t) => !isSlotPastForDate(todayStr, t));
    return firstFuture || "";
  });
  const [slotList, setSlotList] = useState(() =>
    TIME_SLOTS.map((time) => {
      const isPast = isSlotPastForDate(todayStr, time);
      return {
        time,
        remaining: 3,
        maxCapacity: 3,
        isPast,
        isAvailable: !isPast,
      };
    }),
  );
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotRefreshCount, setSlotRefreshCount] = useState(0);
  const [requiresPickup, setRequiresPickup] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [userCoords, setUserCoords] = useState(null);
  const [externalStartPoint, setExternalStartPoint] = useState(null);
  const [locatingUser, setLocatingUser] = useState(false);
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
        const appList = bookRes.data?.success ? bookRes.data.appointments || [] : [];
        if (bookRes.data.success) {
          setBookings(appList);
          if (onBookingsChange) {
            onBookingsChange(appList);
          }
        }
        if (vehRes.data.success) {
          const vehList = vehRes.data.vehicles || [];
          setVehicles(vehList);
          if (vehList.length > 0) {
            const activeVehIds = new Set(
              appList
                .filter(
                  (b) => b.status && b.status !== "Completed" && b.status !== "Cancelled",
                )
                .map((b) =>
                  String(typeof b.vehicleId === "object" ? b.vehicleId?._id : b.vehicleId),
                ),
            );
            const firstFreeVeh =
              vehList.find((v) => !activeVehIds.has(String(v._id))) || vehList[0];
            setSelectedVehicleId(firstFreeVeh._id);
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
  }, [onBookingsChange]);

  // Fetch live slot availability whenever serviceDate changes
  useEffect(() => {
    if (!serviceDate) return;
    let isMounted = true;
    const controller = new AbortController();

    api
      .get(`/appointments/available-slots?date=${encodeURIComponent(serviceDate)}`, {
        signal: controller.signal,
      })
      .then((res) => {
        if (isMounted && res.data.success && Array.isArray(res.data.slots)) {
          const now = new Date();
          const fetchedSlots = res.data.slots.map((s) => {
            const isPast = Boolean(s.isPast) || isSlotPastForDate(serviceDate, s.time, now);
            return {
              ...s,
              isPast,
              isAvailable: !isPast && Boolean(s.isAvailable),
            };
          });
          setSlotList(fetchedSlots);
          setServiceTime((prevTime) => {
            const currentSlot = fetchedSlots.find((s) => s.time === prevTime);
            if (currentSlot && currentSlot.isAvailable) {
              return prevTime;
            }
            const firstAvailable = fetchedSlots.find((s) => s.isAvailable);
            return firstAvailable ? firstAvailable.time : "";
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingSlots(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [serviceDate, slotRefreshCount]);

  const selectedVehicle = vehicles.find((v) => v._id === selectedVehicleId);
  const selectedPackage = packages.find((p) => p._id === selectedPackageId);

  // Map of active (non-completed/non-cancelled) bookings by vehicleId / registrationNo
  const activeBookingByVehicle = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (b.status && b.status !== "Completed" && b.status !== "Cancelled") {
        const vId =
          typeof b.vehicleId === "object" ? b.vehicleId?._id : b.vehicleId;
        if (vId) map[String(vId)] = b;
        if (b.vehicleSnapshot?.registrationNo) {
          map[`reg:${b.vehicleSnapshot.registrationNo}`] = b;
        }
      }
    }
    return map;
  }, [bookings]);

  const getActiveBookingForVehicle = useCallback(
    (v) => {
      if (!v) return null;
      return (
        activeBookingByVehicle[String(v._id)] ||
        (v.registrationNo
          ? activeBookingByVehicle[`reg:${v.registrationNo}`]
          : null) ||
        null
      );
    },
    [activeBookingByVehicle],
  );

  const selectedVehicleActiveBooking = getActiveBookingForVehicle(selectedVehicle);

  // Reverse-geocode coordinates to a human-readable street/area address
  const reverseGeocodeAddress = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      );
      const data = await res.json();
      if (data?.display_name) {
        setPickupAddress((prev) => prev || data.display_name);
      }
    } catch {
      // Ignore reverse-geocoding network issues
    }
  }, []);

  // Detect user's current GPS location (with IP fallback for desktop browsers) and set it on the map
  const handleUseMyLocation = useCallback(() => {
    setLocatingUser(true);
    setPickupError("");

    const applyDetectedCoords = (lat, lng) => {
      const coords = [Number(Number(lat).toFixed(6)), Number(Number(lng).toFixed(6))];
      setUserCoords(coords);
      setExternalStartPoint(coords);
      reverseGeocodeAddress(coords[0], coords[1]);
      setLocatingUser(false);
    };

    const fallbackToIpLocation = async () => {
      try {
        const res = await fetch("https://get.geojs.io/v1/ip/geo.json");
        const data = await res.json();
        if (data?.latitude && data?.longitude) {
          applyDetectedCoords(parseFloat(data.latitude), parseFloat(data.longitude));
          return;
        }
      } catch {
        // Ignore network error
      }
      applyDetectedCoords(6.9061, 79.8684);
    };

    if (!navigator.geolocation) {
      fallbackToIpLocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyDetectedCoords(position.coords.latitude, position.coords.longitude);
      },
      () => {
        fallbackToIpLocation();
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
    );
  }, [reverseGeocodeAddress]);

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
      reverseGeocodeAddress(lat, lng);
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
    [selectedVehicle, reverseGeocodeAddress],
  );

  const handleResetMap = (e) => {
    e.stopPropagation();
    setMapResetCount((prev) => prev + 1);
    setExternalStartPoint(null);
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
    if (selectedVehicleActiveBooking) {
      setError(
        `Vehicle ${selectedVehicle?.registrationNo || ""} already has an active booking (${selectedVehicleActiveBooking.status}). You can book again once the current service is completed or cancelled.`,
      );
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
    if (serviceDate < getLocalTodayStr()) {
      setError("Cannot book an appointment for a past date.");
      return;
    }
    if (!serviceTime) {
      setError("Please select an available time slot.");
      return;
    }
    if (isSlotPastForDate(serviceDate, serviceTime)) {
      setError(
        `The ${serviceTime} slot on ${serviceDate} has already passed. Please select a future time slot or date.`,
      );
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
        setSlotRefreshCount((prev) => prev + 1);
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
            {/* 1. Check Date & Available Time Slots First */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#13294b] uppercase tracking-wider">
                    1. Choose Date &amp; Available Time Slot
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Select your preferred date first to view open workshop slots.
                  </p>
                </div>
                {loadingSlots && (
                  <span className="text-xs font-medium text-orange-700">
                    Checking slots...
                  </span>
                )}
              </div>

              <div className="mb-4 max-w-xs space-y-1.5">
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
                  onChange={(e) => {
                    setLoadingSlots(true);
                    setServiceDate(e.target.value);
                  }}
                  required
                  className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-orange-700 focus:ring-1 focus:ring-orange-700`}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-600">
                  Available Time Slots for {serviceDate || todayStr}:
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {slotList.map((slot) => {
                    const isPast =
                      Boolean(slot.isPast) ||
                      isSlotPastForDate(serviceDate, slot.time);
                    const isSlotOpen = !isPast && Boolean(slot.isAvailable);
                    const isSelected = serviceTime === slot.time && isSlotOpen;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!isSlotOpen}
                        onClick={() => setServiceTime(slot.time)}
                        className={`flex flex-col items-start justify-between rounded-xl border p-3.5 text-left transition ${
                          isPast
                            ? "cursor-not-allowed border-slate-200 bg-slate-100/70 text-slate-400 opacity-75"
                            : !isSlotOpen
                              ? "cursor-not-allowed border-red-200 bg-red-50/50 opacity-65"
                              : isSelected
                                ? "border-orange-700 bg-[#13294b] text-white shadow-2xs"
                                : "border-gray-200 bg-white text-[#13294b] hover:border-orange-700/60 hover:bg-orange-50/20"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-sm font-bold">{slot.time}</span>
                          {isPast ? (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              Time Passed
                            </span>
                          ) : isSlotOpen ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isSelected
                                  ? "bg-orange-600 text-white"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              Available
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                              Slot Full
                            </span>
                          )}
                        </div>
                        <span
                          className={`mt-1.5 text-[11px] ${
                            isPast
                              ? "text-slate-400"
                              : !isSlotOpen
                                ? "text-red-600"
                                : isSelected
                                  ? "text-slate-200"
                                  : "text-slate-500"
                          }`}
                        >
                          {isPast
                            ? "Slot time has passed"
                            : isSlotOpen
                              ? `${slot.remaining} of ${slot.maxCapacity} bays open`
                              : "All bays booked"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {slotList.every(
                  (s) => Boolean(s.isPast) || isSlotPastForDate(serviceDate, s.time),
                ) && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                    <span>
                      All workshop time slots for <strong>{serviceDate}</strong> have already passed. Please select a future date.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const tmrw = new Date();
                        tmrw.setDate(tmrw.getDate() + 1);
                        setLoadingSlots(true);
                        setServiceDate(getLocalTodayStr(tmrw));
                      }}
                      className="rounded-lg bg-amber-800 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-amber-900"
                    >
                      Select Tomorrow →
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* 2. Vehicle Selection */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
              <h2 className="mb-3 text-sm font-bold text-[#13294b] uppercase tracking-wider">
                2. Select Vehicle
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
                    {vehicles.map((v) => {
                      const activeBook = getActiveBookingForVehicle(v);
                      return (
                        <option key={v._id} value={v._id}>
                          {v.registrationNo} — {[v.brand, v.modelName].filter(Boolean).join(" ")} ({v.vehicleType})
                          {activeBook ? ` [Active Booking: ${activeBook.status}]` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {selectedVehicleActiveBooking && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                  <span>
                    <strong>{selectedVehicle?.registrationNo}</strong> already has an active booking (Status: <strong>{selectedVehicleActiveBooking.status}</strong>). You cannot place another booking for the same vehicle until the current service is completed or cancelled.
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab("list")}
                    className="rounded-lg bg-amber-800 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-amber-900"
                  >
                    View Active Booking →
                  </button>
                </div>
              )}
            </section>

            {/* 3. Service Packages Selection */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
              <h2 className="mb-3 text-sm font-bold text-[#13294b] uppercase tracking-wider">
                3. Select Service Package
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
                      const checked = e.target.checked;
                      setRequiresPickup(checked);
                      if (!checked) {
                        setExternalStartPoint(null);
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Input
                        id="pickupAddress"
                        label="Pickup Address / Landmark"
                        placeholder="e.g. No 45, Galle Road, Bambalapitiya"
                        value={pickupAddress}
                        onChange={(e) => setPickupAddress(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={locatingUser}
                      onClick={handleUseMyLocation}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
                    >
                      {locatingUser
                        ? "Detecting Location..."
                        : "Use My Current Location"}
                    </button>
                  </div>

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
                        userLocation={userCoords}
                        externalStartPoint={externalStartPoint}
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
                  disabled={
                    Boolean(selectedVehicleActiveBooking) ||
                    (requiresPickup && (!!pickupError || calculatingFare))
                  }
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
                      {app.requiresPickup && app.pickupLocation?.address && (
                        <p className="mt-1 text-xs text-slate-600">
                          Pickup Location:{" "}
                          <strong className="text-[#13294b]">
                            {app.pickupLocation.address}
                          </strong>
                        </p>
                      )}
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

