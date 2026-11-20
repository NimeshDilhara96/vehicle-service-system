import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Profile from "../customer/Profile";
import ServiceBayManagement from "../admin/ServiceBayManagement";

const mechanicNavItems = [
  { label: "Workshop Bays" },
  { label: "Additional Work Requests" },
  { label: "Profile" },
];

function MechanicDashboard() {
  const [activeTab, setActiveTab] = useState("Workshop Bays");
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayName = user?.name || "Mechanic";

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
              Mechanic Workshop Portal
            </p>
          </div>

          <nav className="space-y-1 px-3">
            {mechanicNavItems.map((item) => {
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
          <p className="text-xs text-orange-300">Mechanic Portal</p>
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

      {/* Mobile Bottom Nav */}
      <nav className="fixed right-0 bottom-0 left-0 z-30 flex items-center justify-around border-t border-gray-200 bg-white px-2 py-2 lg:hidden">
        {mechanicNavItems.map((item) => {
          const isActive = activeTab === item.label;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveTab(item.label)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive ? "bg-orange-700 text-white" : "text-slate-600"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 px-4 pt-4 pb-24 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl space-y-5">
          {activeTab === "Profile" ? (
            <Profile showCustomerStats={false} onLogout={handleLogout} />
          ) : (
            <ServiceBayManagement
              readOnlyBays={true}
              filterAdditionalWork={activeTab === "Additional Work Requests"}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default MechanicDashboard;
