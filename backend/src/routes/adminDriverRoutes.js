const express = require("express");
const rateLimit = require("express-rate-limit");
const adminDriverController = require("../controllers/adminDriverController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

// Rate-limit Admin write operations (especially bcrypt password hashing on driver account creation/update)
const adminWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "test" ? 300 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many driver management write requests. Please try again shortly.",
  },
});

// Protect all routes with JWT verification from HttpOnly cookies
router.use(protect);

// Driver & Admin shared endpoints: view own assigned tasks & update task status
router.get(
  "/my-tasks",
  restrictTo("Driver", "Admin"),
  adminDriverController.getMyAssignedTasks,
);

router.patch(
  "/tasks/:taskId/status",
  restrictTo("Driver", "Admin"),
  adminWriteLimiter,
  adminDriverController.updatePickupTaskStatus,
);

// Admin-only routes below
router.use(restrictTo("Admin"));

router.get("/available", adminDriverController.getAvailableDrivers);

router
  .route("/")
  .get(adminDriverController.getAllDrivers)
  .post(adminWriteLimiter, adminDriverController.createDriver);

router
  .route("/:id")
  .put(adminWriteLimiter, adminDriverController.updateDriver)
  .delete(adminWriteLimiter, adminDriverController.deleteDriver);

router.patch(
  "/:id/availability",
  adminWriteLimiter,
  adminDriverController.toggleDriverAvailability,
);

// Driver task history & assignment endpoints
router.get("/:id/tasks", adminDriverController.getDriverTaskLogs);
router.patch(
  "/:id/assign-task",
  adminWriteLimiter,
  adminDriverController.assignDriverToTask,
);

module.exports = router;
