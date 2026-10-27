const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/authController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

// Checklist rule: Rate-limit authentication endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "test" ? 100 : 10, // Limit each IP to 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many attempts from this IP. Please try again after 15 minutes.",
  },
});

router.post(
  "/check-availability",
  authLimiter,
  authController.checkAvailability,
);
router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.getMe);

// Role-based protected dashboard routes
router.get("/user-dashboard", protect, restrictTo("Customer"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Test Successfully - User",
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

router.get("/admin-dashboard", protect, restrictTo("Admin"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Test Successfully - Admin",
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

module.exports = router;
