import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import Profile from "../customer/Profile";

const adminNavItems = [
  { label: "Dashboard" },
  { label: "Appointments" },
  { label: "Workshops" },
  { label: "Staff (Drivers & Mechanics)" },
  { label: "Invoices & Reports" },
  { label: "Profile" },
];

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [message, setMessage] = useState("Loading...");
  const [packages, setPackages] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/auth/admin-dashboard")
      .then((res) => {
        if (res.data.success) {
          setMessage(res.data.message);
        }
      })
      .catch(() => setMessage("Error fetching admin dashboard"));

    api
      .get("/appointments/packages")
      .then((res) => {
        if (res.data.success) {
          setPackages(res.data.packages || []);
          setWorkshops(res.data.workshops || []);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayName = user?.name || "Admin";

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
              Admin Control Panel
            </p>
          </div>

          <nav className="space-y-1 px-3">
            {adminNavItems.map((item) => {
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
          <p className="text-xs text-orange-300">Admin Portal</p>
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
                    Admin Dashboard — {displayName}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500" title={message}>
                    Manage workshop branches, service packages, drivers, mechanics, and bookings.
                  </p>
                </div>
                <span className="rounded-full bg-[#fef3e2] px-3.5 py-1 text-xs font-semibold text-orange-800">
                  Role: {user?.role || "Admin"}
                </span>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Active Workshops
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-[#13294b]">
                    {workshops.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Western Province Service Network
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Service Packages
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-orange-700">
                    {packages.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Standard, Full &amp; Major Care
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Operational Zone
                  </p>
                  <p className="mt-2 text-lg font-extrabold text-emerald-700">
                    Western Province
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Colombo · Gampaha · Kalutara
                  </p>
                </div>
              </div>

              {/* Active Workshops Section */}
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
                <h2 className="mb-3 text-base font-bold text-[#13294b]">
                  Configured Workshop Branches
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {workshops.map((shop) => (
                    <div
                      key={shop.id}
                      className="rounded-xl border border-gray-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-[#13294b] px-2 py-0.5 text-[11px] font-bold text-white">
                          {shop.id}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-700">
                          Active
                        </span>
                      </div>
                      <h3 className="mt-2.5 text-sm font-bold text-[#13294b]">
                        {shop.name}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {shop.address}
                      </p>
                      <p className="mt-1.5 text-xs font-medium text-slate-600">
                        {shop.contactNo}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;

