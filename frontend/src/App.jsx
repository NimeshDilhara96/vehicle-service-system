import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserDashboard from "./pages/UserDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

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
            <Navigate
              to={user.role === "Admin" ? "/admin-dashboard" : "/user-dashboard"}
              replace
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/login"
        element={
          user ? (
            <Navigate
              to={user.role === "Admin" ? "/admin-dashboard" : "/user-dashboard"}
              replace
            />
          ) : (
            <Login />
          )
        }
      />

      <Route
        path="/register"
        element={
          user ? (
            <Navigate
              to={user.role === "Admin" ? "/admin-dashboard" : "/user-dashboard"}
              replace
            />
          ) : (
            <Register />
          )
        }
      />

      <Route
        path="/user-dashboard"
        element={
          <ProtectedRoute allowedRoles={["Customer"]}>
            <UserDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute allowedRoles={["Admin"]}>
            <AdminDashboard />
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
