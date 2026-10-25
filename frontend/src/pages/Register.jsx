import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/ui/AuthLayout";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";

// Styling overrides for the shared UI components (theme: navy + orange)
const inputClass =
  "py-3! rounded-lg! border-gray-300! focus:border-orange-700! focus:ring-orange-700!";
const buttonClass =
  "py-3! font-semibold! bg-orange-700! hover:bg-orange-800! text-white!";

const vehicleTypes = ["Car", "Van", "SUV", "Jeep", "Crew Cab", "Other"];

function Register() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    contactNo: "",
    registrationNo: "",
    vehicleType: "Car",
    brand: "",
    modelName: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    setError("");
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await register(form);

      if (data.success) {
        navigate("/user-dashboard");
      }
    } catch (err) {
      const message = err.response?.data?.message || "Registration failed";
      setError(message);
      if (message.toLowerCase().includes("email")) {
        setStep(1);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={
        step === 1 ? (
          <>
            <span className="lg:hidden">Sign up</span>
            <span className="hidden lg:inline">Create account</span>
          </>
        ) : (
          "Add your vehicle"
        )
      }
      subtitle={
        step === 1
          ? "Step 1 of 2 — Enter your personal details."
          : "Step 2 of 2 — Add your first vehicle to book services right away."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-[#13294b] hover:text-orange-700 hover:underline"
          >
            Log In
          </Link>
        </>
      }
    >
      {/* 2-Step Progress Indicator */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs font-semibold text-[#13294b] mb-2">
          <span className={step === 1 ? "text-orange-700" : "text-[#13294b]"}>
            1. Account Info
          </span>
          <span className={step === 2 ? "text-orange-700" : "text-slate-400"}>
            2. Vehicle Info
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-1.5 rounded-full bg-orange-700 transition-colors" />
          <div
            className={`h-1.5 rounded-full transition-colors ${
              step === 2 ? "bg-orange-700" : "bg-gray-200"
            }`}
          />
        </div>
      </div>

      <form
        onSubmit={step === 1 ? handleNextStep : handleSubmit}
        className="space-y-4"
      >
        <Alert type="error">{error}</Alert>

        {step === 1 ? (
          <>
            <Input
              id="name"
              name="name"
              label="Full name"
              type="text"
              placeholder="John Doe"
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
              required
              className={inputClass}
            />

            <Input
              id="email"
              name="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
              className={inputClass}
            />

            <Input
              id="contactNo"
              name="contactNo"
              label="Contact number"
              type="tel"
              placeholder="0771234567"
              value={form.contactNo}
              onChange={handleChange}
              autoComplete="tel"
              required
              className={inputClass}
            />

            <Input
              id="password"
              name="password"
              label="Password"
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              className={inputClass}
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                    </svg>
                  )}
                </button>
              }
            />

            <Button type="submit" className={buttonClass}>
              Next
            </Button>
          </>
        ) : (
          <>
            <Input
              id="registrationNo"
              name="registrationNo"
              label="Vehicle Registration No."
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
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-orange-700 focus:ring-1 focus:ring-orange-700"
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

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
                disabled={loading}
                className="w-1/3! py-3! font-semibold! border-[#13294b]! text-[#13294b]! hover:bg-slate-50!"
              >
                Back
              </Button>
              <Button
                type="submit"
                loading={loading}
                className={`flex-1! ${buttonClass}`}
              >
                Create account
              </Button>
            </div>
          </>
        )}
      </form>
    </AuthLayout>
  );
}

export default Register;
