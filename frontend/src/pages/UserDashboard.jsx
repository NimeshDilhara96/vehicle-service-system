import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

function UserDashboard() {
  const [apiMessage, setApiMessage] = useState("");
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/auth/user-dashboard")
      .then((res) => {
        if (res.data.success) {
          setApiMessage(res.data.message);
        }
      })
      .catch(() => setApiMessage("Error fetching user dashboard"));
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div style={{ maxWidth: "500px", margin: "40px auto", padding: "20px", border: "1px solid #ccc" }}>
      <h2>{apiMessage || "Test Successfully - User"}</h2>
      <p><strong>Name:</strong> {user?.name}</p>
      <p><strong>Email:</strong> {user?.email}</p>
      <p><strong>Role:</strong> {user?.role}</p>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}

export default UserDashboard;
