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

// Protect all routes with JWT verification from HttpOnly cookies and Admin role check
router.use(protect, restrictTo("Admin"));

router.get("/available", adminDriverController.getAvailableDrivers);

// Update a pickup/delivery task's status & log entry
router.patch(
  "/tasks/:taskId/status",
  adminWriteLimiter,
  adminDriverController.updatePickupTaskStatus,
);

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
