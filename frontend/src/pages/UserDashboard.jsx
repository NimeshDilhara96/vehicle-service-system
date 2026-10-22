import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SmartMap } from "smartmap-pro";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const navItems = [
  { label: "Dashboard", active: true },
  { label: "My Vehicles", active: false },
  { label: "My Bookings", active: false },
  { label: "Track Vehicle", active: false },
  { label: "Invoices", active: false },
  { label: "Feedback", active: false },
  { label: "Profile", active: false },
];

const serviceSteps = [
  { label: "Vehicle Received", status: "done" },
  { label: "Inspection", status: "done" },
  { label: "Service", status: "done" },
  { label: "Additional Work Approval", status: "current" },
  { label: "Service Completed", status: "upcoming" },
  { label: "Ready for Delivery", status: "upcoming" },
];

function UserDashboard() {
  const [apiMessage, setApiMessage] = useState("");
  const [routeCoords, setRouteCoords] = useState(null);
  const [resetCount, setResetCount] = useState(0);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/auth/user-dashboard")
      .then((res) => {
        if (res.data.success) {
          setApiMessage(res.data.message);
        }
      })
      .catch(() => setApiMessage("Error fetching user dashboard"));
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleOrderReady = useCallback((data) => {
    setRouteCoords(data);
  }, []);

  const handleResetMap = (e) => {
    e.stopPropagation();
    setResetCount((prev) => prev + 1);
    setRouteCoords(null);
  };

  const displayName = user?.name || "John";

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-[#13294b] text-white lg:flex">
        <div>
          <div className="px-6 pt-7 pb-6">
            <span className="text-base font-bold tracking-tight">
              Vehicle Service
            </span>
          </div>

          <nav className="space-y-1 px-3">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`flex w-full items-center rounded-lg px-4 py-2.5 text-left text-sm transition ${
                  item.active
                    ? "bg-orange-700 font-semibold text-white"
                    : "font-medium text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
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
          <p className="text-xs text-white/80">Welcome,</p>
          <h1 className="truncate text-lg leading-tight font-bold">
            {displayName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-tight">
            Vehicle Service
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 pt-4 pb-24 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-4 lg:space-y-5">
          {/* Desktop Greeting Header */}
          <div className="hidden items-center justify-between lg:flex">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#13294b]">
                Welcome, {displayName}
              </h1>
              <p
                className="mt-0.5 text-sm text-slate-500"
                title={apiMessage || undefined}
              >
                Here is where your vehicle is right now.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-[#13294b] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#1a3660]"
            >
              Book a Service
            </button>
          </div>

          {/* Vehicle Progress Card */}
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:p-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#13294b] sm:text-base">
                  Toyota Corolla · ABC 1234
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 lg:hidden">
                  Full Service · 15 Aug 2026
                </p>
                <p className="mt-0.5 hidden text-xs text-slate-500 lg:block">
                  Full Service Package · 15 Aug 2026 · 09:00 AM
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#fef3e2] px-3 py-1 text-[11px] font-semibold text-orange-800">
                <span className="lg:hidden">Approval needed</span>
                <span className="hidden lg:inline">
                  Additional Work Approval
                </span>
              </span>
            </div>

            {/* 6-Step Progress Bar */}
            <div className="mt-4 grid grid-cols-6 gap-1.5 sm:gap-2">
              {serviceSteps.map((step) => {
                const barColor =
                  step.status === "done"
                    ? "bg-emerald-700"
                    : step.status === "current"
                      ? "bg-orange-700"
                      : "bg-slate-200";
                const textColor =
                  step.status === "done"
                    ? "font-semibold text-emerald-700"
                    : step.status === "current"
                      ? "font-semibold text-orange-700"
                      : "text-slate-400";

                return (
                  <div key={step.label} className="flex flex-col">
                    <div className={`h-1.5 w-full rounded-full ${barColor}`} />
                    <span
                      className={`mt-2 hidden text-center text-[11px] leading-tight lg:block ${textColor}`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="mt-2.5 text-xs text-slate-500 lg:hidden">
              Step 4 of 6 · Additional Work Approval
            </p>
          </section>

          {/* Middle Section: Live Tracking Map + Your Driver */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
            {/* Live Tracking Card */}
            <section className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-3.5 shadow-2xs sm:p-5 lg:col-span-2">
              <div>
                <h3 className="mb-3 hidden text-sm font-bold text-[#13294b] lg:block">
                  Live Tracking
                </h3>

                <div className="relative mx-auto w-full [&_input]:text-xs sm:[&_input]:text-sm [&_.smart-map-container]:gap-2.5! [&_.smart-map-container>div:nth-of-type(2)]:h-52.5! sm:[&_.smart-map-container>div:nth-of-type(2)]:h-62.5!">
                  {/* Reset Navigation Button Overlaid on the Map */}
                  <button
                    type="button"
                    onClick={handleResetMap}
                    title="Clear markers and route without reloading map"
                    className="absolute top-16 left-14 z-400 flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-800 shadow-md backdrop-blur-xs transition hover:bg-gray-100 active:scale-95 sm:px-3 touch-manipulation"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-3.5 w-3.5 shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                      />
                    </svg>
                    <span>Reset Route</span>
                  </button>

                  <SmartMap
                    resetTrigger={resetCount}
                    mode="routing"
                    theme="light"
                    showSearchBox={true}
                    showZoomControls={true}
                    osrmUrl="https://router.project-osrm.org/route/v1/driving"
                    onOrderReady={handleOrderReady}
                  />
                </div>
              </div>

              {routeCoords ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Pickup: {routeCoords.startCoords[0].toFixed(5)},{" "}
                    {routeCoords.startCoords[1].toFixed(5)}
                  </span>
                  <span>
                    Service Centre ({routeCoords.endCoords[0].toFixed(5)},{" "}
                    {routeCoords.endCoords[1].toFixed(5)})
                  </span>
                </div>
              ) : (
                <div className="mt-3 hidden items-center justify-between text-xs text-slate-500 lg:flex">
                  <span>Pickup: No. 25, Main Road, Colombo 05</span>
                  <span>Service Centre</span>
                </div>
              )}
            </section>

            {/* Your Driver Card */}
            <section className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs sm:p-5">
              <div>
                <h3 className="mb-4 hidden text-sm font-bold text-[#13294b] lg:block">
                  Your Driver
                </h3>

                <div className="flex items-center justify-between gap-3.5 lg:justify-start">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-medium text-slate-500 sm:h-14 sm:w-14">
                    Photo
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-bold text-[#13294b]">
                      Nuwan Perera
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500 lg:hidden">
                      DRV001 · 077 123 4567
                    </p>
                    <div className="mt-0.5 hidden space-y-0.5 text-xs text-slate-500 lg:block">
                      <p>ID: DRV001</p>
                      <p>077 123 4567</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="shrink-0 rounded-lg bg-[#13294b] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1a3660] lg:hidden"
                  >
                    Call
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="mt-6 hidden w-full rounded-lg border border-[#13294b] bg-white py-2.5 text-center text-xs font-semibold text-[#13294b] transition hover:bg-slate-50 lg:block"
              >
                Contact Driver
              </button>
            </section>
          </div>

          {/* Additional Work Approval Banner */}
          <section className="flex flex-col gap-3.5 rounded-2xl border border-[#f5d0a9] bg-[#fffaf3] p-4 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#13294b]">
                <span className="lg:hidden">Front brake pads replacement</span>
                <span className="hidden lg:inline">
                  Additional work found: Front brake pads replacement
                </span>
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Parts Rs. 6,500.00 · Labour Rs. 1,500.00 · Total Rs. 8,000.00
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:flex lg:shrink-0 lg:items-center lg:gap-2.5">
              <button
                type="button"
                className="rounded-lg border border-[#13294b] bg-white px-5 py-2.5 text-xs font-semibold text-[#13294b] transition hover:bg-slate-50 lg:py-2"
              >
                Reject
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-800 lg:py-2"
              >
                Approve
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-500 flex items-center justify-around border-t border-gray-200 bg-white px-2 py-3 text-xs lg:hidden">
        <button
          type="button"
          className="font-semibold text-orange-700"
        >
          Home
        </button>
        <button
          type="button"
          className="font-medium text-slate-500 hover:text-[#13294b]"
        >
          Bookings
        </button>
        <button
          type="button"
          className="font-medium text-slate-500 hover:text-[#13294b]"
        >
          Track
        </button>
        <button
          type="button"
          className="font-medium text-slate-500 hover:text-[#13294b]"
        >
          Invoices
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="font-medium text-slate-500 hover:text-[#13294b]"
        >
          Profile
        </button>
      </nav>
    </div>
  );
}

export default UserDashboard;
