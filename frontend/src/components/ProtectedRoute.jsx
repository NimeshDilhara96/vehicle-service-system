import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// eslint-disable-next-line react-refresh/only-export-components
export function getDashboardPathByRole(role) {
  switch (role) {
    case "Admin":
      return "/admin-dashboard";
    case "Driver":
      return "/driver-dashboard";
    case "Mechanic":
      return "/mechanic-dashboard";
    case "Customer":
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

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPathByRole(user.role)} replace />;
  }

  return children;
}

export default ProtectedRoute;
