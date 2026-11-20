import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Profile from "../customer/Profile";
import ServiceBayManagement from "../admin/ServiceBayManagement";

const MECHANIC_TABS = [
  { id: "bays", label: "Workshop Bays" },
  { id: "approvals", label: "Approval Queue" },
  { id: "profile", label: "Profile" },
];

function MechanicDashboard() {
  const [activeTab, setActiveTab] = useState("bays");
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayName = user?.name || "Mechanic";

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
      {/* Sticky Tablet-Friendly Top Bar (No Sidebar) */}
      <header className="sticky top-0 z-30 bg-[#13294b] text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* Brand & Technician Name */}
          <div className="flex items-center gap-3">
            <div>
              <span className="text-base font-bold tracking-tight sm:text-lg">
                Vehicle Service
              </span>
              <p className="text-[11px] font-medium text-orange-300">
                Mechanic Workshop · {displayName}
              </p>
            </div>
          </div>

          {/* Segmented Tablet Tab Bar */}
          <nav className="order-3 flex w-full items-center gap-1.5 rounded-xl bg-white/10 p-1 sm:order-2 sm:w-auto">
            {MECHANIC_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 touch-manipulation rounded-lg px-4 py-2 text-xs font-bold transition sm:flex-none sm:text-sm ${
                    isActive
                      ? "bg-orange-600 text-white shadow-xs"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="order-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/20 sm:order-3"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Full-Width Tablet Workspace */}
      <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-7xl">
          {activeTab === "profile" ? (
            <Profile showCustomerStats={false} onLogout={handleLogout} />
          ) : (
            <ServiceBayManagement
              readOnlyBays={true}
              filterAdditionalWork={activeTab === "approvals"}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default MechanicDashboard;
