const express = require("express");
const rateLimit = require("express-rate-limit");
const appointmentController = require("../controllers/appointmentController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

// Rate-limit map routing & booking endpoints to prevent OSRM / DB abuse (DoS protection)
const mapRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "test" ? 200 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many map/booking requests. Please try again shortly.",
  },
});

// Public/Authenticated route to view available packages & workshops
router.get("/packages", appointmentController.getServicePackages);

// All routes below require Customer login
router.use(protect);

// Calculate pickup fee via smartmap-pro
router.post(
  "/calculate-pickup-fee",
  restrictTo("Customer"),
  mapRateLimiter,
  appointmentController.calculatePickupFee,
);

// Create booking (with auto-invoice) & get customer's bookings
router
  .route("/")
  .post(
    restrictTo("Customer"),
    mapRateLimiter,
    appointmentController.createAppointment,
  )
  .get(appointmentController.getMyBookings);

module.exports = router;
