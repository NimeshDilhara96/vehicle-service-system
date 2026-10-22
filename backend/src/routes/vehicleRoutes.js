const express = require("express");
const vehicleController = require("../controllers/vehicleController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

// Require authentication for all vehicle routes[cite: 55]
router.use(protect);

router
  .route("/")
  .post(restrictTo("Customer"), vehicleController.registerVehicle)
  .get(vehicleController.getMyVehicles);

router.route("/:id").delete(vehicleController.deleteVehicle);

module.exports = router;
