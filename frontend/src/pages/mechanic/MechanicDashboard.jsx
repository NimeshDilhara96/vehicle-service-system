import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Profile from "../customer/Profile";

const mechanicNavItems = [
  { label: "Dashboard" },
  { label: "Assigned Jobs" },
  { label: "Additional Work Requests" },
  { label: "Completed Jobs" },
  { label: "Profile" },
];

const SERVICE_STAGES = [
  "Vehicle Received",
  "Inspection",
  "Service",
  "Additional Work Approval",
  "Service Completed",
  "Ready for Delivery",
];

const INITIAL_JOBS = [
  {
    id: "SRV-201",
    registrationNo: "CAB-4582",
    vehicleModel: "Toyota Corolla",
    packageName: "Full Service Package",
    scheduledTime: "09:00 AM",
    stage: "Inspection",
    notes: "Engine oil, oil filter, and brake pad wear inspection.",
  },
  {
    id: "SRV-202",
    registrationNo: "CBA-9921",
    vehicleModel: "Honda Civic",
    packageName: "Major Care Package",
    scheduledTime: "10:30 AM",
    stage: "Service",
    notes: "Full synthetic oil change and transmission fluid check.",
  },
];

function MechanicDashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [jobs, setJobs] = useState(INITIAL_JOBS);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleStageUpdate = (jobId, newStage) => {
    setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, stage: newStage } : job)),
    );
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
                    Mechanic Dashboard — {displayName}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Update the 6-step vehicle service progress and request customer approval for additional repairs.
                  </p>
                </div>
                <span className="rounded-full bg-[#fef3e2] px-3.5 py-1 text-xs font-semibold text-orange-800">
                  Role: {user?.role || "Mechanic"}
                </span>
              </div>

              {/* Active Service Jobs */}
              <div className="space-y-4">
                {jobs.map((job) => (
                  <section
                    key={job.id}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-[#13294b] px-2.5 py-1 text-xs font-bold text-white">
                            {job.registrationNo}
                          </span>
                          <h3 className="text-base font-bold text-[#13294b]">
                            {job.vehicleModel}
                          </h3>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {job.packageName} · Slot: {job.scheduledTime}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Notes: {job.notes}
                        </p>
                      </div>

                      <span className="rounded-full bg-[#fef3e2] px-3 py-1 text-xs font-semibold text-orange-800">
                        Current Stage: {job.stage}
                      </span>
                    </div>

                    {/* 6-Step Progress Stage Selector */}
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="mb-2 text-xs font-semibold text-slate-500">
                        Update Workshop Stage (Syncs with Customer Progress Bar):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {SERVICE_STAGES.map((stage) => {
                          const isCurrent = job.stage === stage;
                          return (
                            <button
                              key={stage}
                              type="button"
                              onClick={() => handleStageUpdate(job.id, stage)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                isCurrent
                                  ? "bg-orange-700 text-white"
                                  : "border border-gray-200 bg-slate-50 text-slate-700 hover:border-[#13294b]"
                              }`}
                            >
                              {stage}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default MechanicDashboard;

