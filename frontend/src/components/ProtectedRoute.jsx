import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// eslint-disable-next-line react-refresh/only-export-components
export function getDashboardPathByRole(role) {
  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase();

  switch (normalizedRole) {
    case "admin":
      return "/admin-dashboard";
    case "driver":
      return "/driver-dashboard";
    case "mechanic":
      return "/mechanic-dashboard";
    case "customer":
    default:
      return "/user-dashboard";
  }
}

function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles) {
    const userRoleNorm = String(user.role || "")
      .trim()
      .toLowerCase();
    const isAllowed = allowedRoles.some(
      (r) => String(r).trim().toLowerCase() === userRoleNorm,
    );

    if (!isAllowed) {
      return <Navigate to={getDashboardPathByRole(user.role)} replace />;
    }
  }

  return children;
}

export default ProtectedRoute;
