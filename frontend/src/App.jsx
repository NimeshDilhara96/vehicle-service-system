import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import DriverDashboard from "./pages/driver/DriverDashboard";
import MechanicDashboard from "./pages/mechanic/MechanicDashboard";
import ProtectedRoute, {
  getDashboardPathByRole,
} from "./components/ProtectedRoute";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={getDashboardPathByRole(user.role)} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={getDashboardPathByRole(user.role)} replace />
          ) : (
            <Login />
          )
        }
      />

      <Route
        path="/register"
        element={
          user ? (
            <Navigate to={getDashboardPathByRole(user.role)} replace />
          ) : (
            <Register />
          )
        }
      />

      {/* Customer Dashboard Routes */}
      <Route
        path="/user-dashboard"
        element={
          <ProtectedRoute allowedRoles={["Customer"]}>
            <CustomerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer-dashboard"
        element={
          <ProtectedRoute allowedRoles={["Customer"]}>
            <CustomerDashboard />
          </ProtectedRoute>
        }
      />

      {/* Admin Dashboard Route */}
      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute allowedRoles={["Admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Driver Dashboard Route */}
      <Route
        path="/driver-dashboard"
        element={
          <ProtectedRoute allowedRoles={["Driver"]}>
            <DriverDashboard />
          </ProtectedRoute>
        }
      />

      {/* Mechanic Dashboard Route */}
      <Route
        path="/mechanic-dashboard"
        element={
          <ProtectedRoute allowedRoles={["Mechanic"]}>
            <MechanicDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
