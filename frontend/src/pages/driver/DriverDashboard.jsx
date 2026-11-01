import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SmartMap } from "smartmap-pro";
import { useAuth } from "../../context/AuthContext";
import Profile from "../customer/Profile";

const driverNavItems = [
  { label: "Dashboard" },
  { label: "Assigned Pickups" },
  { label: "Deliveries" },
  { label: "Route Map" },
  { label: "Profile" },
];

const SAMPLE_TRIPS = [
  {
    id: "TRP-101",
    type: "Pickup",
    vehicleReg: "CAB-4582",
    vehicleModel: "Toyota Corolla",
    customerName: "Kamal Perera",
    contactNo: "077 456 7890",
    pickupAddress: "No 45, Galle Road, Bambalapitiya",
    workshopName: "Colombo Main Workshop",
    scheduledTime: "09:00 AM",
    status: "Assigned",
  },
  {
    id: "TRP-102",
    type: "Return Delivery",
    vehicleReg: "CBA-9921",
    vehicleModel: "Honda Civic",
    customerName: "Nimali Silva",
    contactNo: "071 234 5678",
    pickupAddress: "Colombo Main Workshop -> Nugegoda",
    workshopName: "Colombo Main Workshop",
    scheduledTime: "01:30 PM",
    status: "In Transit",
  },
];

function DriverDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [trips, setTrips] = useState(SAMPLE_TRIPS);
  const [resetCount, setResetCount] = useState(0);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleStatusChange = (tripId, nextStatus) => {
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, status: nextStatus } : t)),
    );
  };

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
            <Profile
              showCustomerStats={false}
              onLogout={handleLogout}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#13294b]">
                    Driver Dashboard — {displayName}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Manage your assigned vehicle pickups and return deliveries.
                  </p>
                </div>
                <span className="rounded-full bg-[#fef3e2] px-3.5 py-1 text-xs font-semibold text-orange-800">
                  Role: {user?.role || "Driver"}
                </span>
              </div>

              {/* Assigned Pickups & Deliveries */}
              <section className="space-y-3">
                <h2 className="text-base font-bold text-[#13294b]">
                  Today&apos;s Assigned Trips ({trips.length})
                </h2>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {trips.map((trip) => (
                    <div
                      key={trip.id}
                      className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-lg bg-[#13294b] px-2.5 py-1 text-xs font-bold text-white">
                            {trip.vehicleReg}
                          </span>
                          <span className="rounded-full bg-[#fef3e2] px-3 py-0.5 text-[11px] font-semibold text-orange-800">
                            {trip.type} · {trip.status}
                          </span>
                        </div>

                        <h3 className="mt-3 text-base font-bold text-[#13294b]">
                          {trip.vehicleModel} — {trip.customerName}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Location: {trip.pickupAddress}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Time: {trip.scheduledTime} · Contact: {trip.contactNo}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleStatusChange(trip.id, "In Transit")
                          }
                          className="rounded-lg bg-[#13294b] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
                        >
                          Start Trip
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleStatusChange(trip.id, "Completed")
                          }
                          className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                        >
                          Mark Completed
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

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

