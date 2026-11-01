import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";

const MOBILE_REGEX = /^(?:0|\+94)7\d{8}$/;

const inputClass =
  "py-2.5! rounded-lg! border-gray-300! focus:border-orange-700! focus:ring-orange-700!";
const buttonClass =
  "py-2.5! font-semibold! bg-orange-700! hover:bg-orange-800! text-white!";

function Profile({
  vehiclesCount = 0,
  bookingsCount = 0,
  onNavigateTab,
  onLogout,
  showCustomerStats = true,
}) {
  const { user, setUser } = useAuth();

  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    contactNo: user?.contactNo || "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Load latest user profile from /auth/me (including contactNo and createdAt)
  useEffect(() => {
    let isMounted = true;

    api
      .get("/auth/me")
      .then((res) => {
        if (isMounted && res.data.success && res.data.user) {
          const u = res.data.user;
          setUser(u);
          setProfileForm({
            name: u.name || "",
            email: u.email || "",
            contactNo: u.contactNo || "",
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [setUser]);

  const handleProfileChange = (e) => {
    setProfileForm({ ...profileForm, [e.target.name]: e.target.value });
  };

  const handlePasswordChange = (e) => {
    setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    const trimmedContact = profileForm.contactNo.trim();
    if (!MOBILE_REGEX.test(trimmedContact)) {
      setProfileError(
        "Invalid mobile number format. Please use 07XXXXXXXX or +947XXXXXXXX.",
      );
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.put("/auth/profile", {
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        contactNo: trimmedContact,
      });

      if (res.data.success) {
        setUser(res.data.user);
        setProfileSuccess("Profile details updated successfully.");
      }
    } catch (err) {
      setProfileError(
        err.response?.data?.message || "Failed to update profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await api.put("/auth/password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      if (res.data.success) {
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setPasswordSuccess("Password changed successfully.");
      }
    } catch (err) {
      setPasswordError(
        err.response?.data?.message || "Failed to update password.",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const initials = (user?.name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      })
    : "Active Member";

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
            My Profile
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage your personal details and account security.
          </p>
        </div>

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 lg:hidden"
          >
            Logout
          </button>
        )}
      </div>

      {/* Top Profile Summary Card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#13294b] text-xl font-bold text-white shadow-xs">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[#13294b]">
                  {user?.name || "User"}
                </h2>
                <span className="rounded-full bg-[#fef3e2] px-2.5 py-0.5 text-[11px] font-semibold text-orange-800">
                  {user?.role || "Customer"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{user?.email}</p>
              <p className="mt-1 text-xs text-slate-400">
                Member since {memberSince}
              </p>
            </div>
          </div>

          {showCustomerStats && (
            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab("My Vehicles")}
                className="rounded-xl border border-gray-200 bg-slate-50 px-4 py-3 text-left transition hover:border-orange-700/40"
              >
                <p className="text-lg font-extrabold text-[#13294b]">
                  {vehiclesCount}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  My Vehicles
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab("My Bookings")}
                className="rounded-xl border border-gray-200 bg-slate-50 px-4 py-3 text-left transition hover:border-orange-700/40"
              >
                <p className="text-lg font-extrabold text-orange-700">
                  {bookingsCount}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  Service Bookings
                </p>
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Personal Information Form */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
          <h3 className="mb-1 text-base font-bold text-[#13294b]">
            Personal Information
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Update your name, email address, and mobile contact number.
          </p>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <Alert type="error">{profileError}</Alert>
            <Alert type="success">{profileSuccess}</Alert>

            <Input
              id="profile-name"
              name="name"
              label="Full Name"
              type="text"
              placeholder="John Doe"
              value={profileForm.name}
              onChange={handleProfileChange}
              required
              className={inputClass}
            />

            <Input
              id="profile-email"
              name="email"
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={profileForm.email}
              onChange={handleProfileChange}
              required
              className={inputClass}
            />

            <Input
              id="profile-contactNo"
              name="contactNo"
              label="Contact Number"
              type="tel"
              placeholder="0771234567"
              value={profileForm.contactNo}
              onChange={handleProfileChange}
              required
              className={inputClass}
            />

            <div className="pt-1">
              <Button
                type="submit"
                loading={savingProfile}
                className={buttonClass}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </section>

        {/* Change Password Form */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:p-6">
          <h3 className="mb-1 text-base font-bold text-[#13294b]">
            Change Password
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Ensure your account uses a strong password to stay secure.
          </p>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <Alert type="error">{passwordError}</Alert>
            <Alert type="success">{passwordSuccess}</Alert>

            <Input
              id="currentPassword"
              name="currentPassword"
              label="Current Password"
              type="password"
              placeholder="Enter current password"
              value={passwordForm.currentPassword}
              onChange={handlePasswordChange}
              required
              className={inputClass}
            />

            <Input
              id="newPassword"
              name="newPassword"
              label="New Password"
              type="password"
              placeholder="At least 6 characters"
              value={passwordForm.newPassword}
              onChange={handlePasswordChange}
              required
              className={inputClass}
            />

            <Input
              id="confirmPassword"
              name="confirmPassword"
              label="Confirm New Password"
              type="password"
              placeholder="Re-enter new password"
              value={passwordForm.confirmPassword}
              onChange={handlePasswordChange}
              required
              className={inputClass}
            />

            <div className="pt-1">
              <Button
                type="submit"
                loading={savingPassword}
                className="py-2.5! font-semibold! bg-[#13294b]! hover:bg-[#1a3660]! text-white!"
              >
                Update Password
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default Profile;

