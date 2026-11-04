const express = require("express");
const rateLimit = require("express-rate-limit");
const serviceBayController = require("../controllers/serviceBayController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

const bayWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 300 : 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many service bay write requests. Please try again shortly.",
  },
});

router.use(protect);

router
  .route("/")
  .get(serviceBayController.getAllBays)
  .post(restrictTo("Admin"), bayWriteLimiter, serviceBayController.addBay);

router.patch(
  "/:id/status",
  restrictTo("Admin"),
  bayWriteLimiter,
  serviceBayController.updateBayStatus,
);

module.exports = router;

