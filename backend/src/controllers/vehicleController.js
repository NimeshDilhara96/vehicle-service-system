const Vehicle = require("../models/Vehicle");

const VEHICLE_REG_REGEX =
  /^(?:[A-Z]{2}[\s-]?)?(?:[A-Z]{2,3}|\d{1,3})[\s-]?\d{4}$/;

// Register a new vehicle
exports.registerVehicle = async (req, res, next) => {
  try {
    const { registrationNo, vehicleType, brand, modelName } = req.body;

    if (!registrationNo || !registrationNo.trim()) {
      return res
        .status(400)
        .json({ message: "Vehicle registration number is required." });
    }

    const normalizedRegNo = registrationNo.trim().toUpperCase();
    if (!VEHICLE_REG_REGEX.test(normalizedRegNo)) {
      return res.status(400).json({
        message:
          "Invalid vehicle registration number format (e.g., CAB-1234, AB-1234, 65-1234).",
      });
    }

    // Only check active (non-deleted) vehicles so a re-sold vehicle number can be registered by a new owner
    const existingVehicle = await Vehicle.findOne({
      registrationNo: normalizedRegNo,
      isDeleted: false,
    });
    if (existingVehicle) {
      return res.status(400).json({
        message: "A vehicle with this registration number already exists.",
      });
    }

    // Derive customerId strictly from verified session (never trust frontend user IDs)
    const vehicle = await Vehicle.create({
      customerId: req.user._id,
      registrationNo: normalizedRegNo,
      vehicleType,
      brand,
      modelName,
    });

    res.status(201).json({
      success: true,
      message: "Vehicle registered successfully.",
      vehicle,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "A vehicle with this registration number already exists.",
      });
    }
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    next(error);
  }
};

// Get active vehicles belonging strictly to the logged-in user
exports.getMyVehicles = async (req, res, next) => {
  try {
    const vehicles = await Vehicle.find({
      customerId: req.user._id,
      isDeleted: false,
    });

    res.status(200).json({
      success: true,
      count: vehicles.length,
      vehicles,
    });
  } catch (error) {
    next(error);
  }
};

// Soft-delete a vehicle with object-level authorization (IDOR protection) to preserve historical audit trails
exports.deleteVehicle = async (req, res, next) => {
  try {
    const vehicleId = req.params.id;

    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      isDeleted: false,
    });
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found." });
    }

    // Verify resource ownership before mutating data
    if (
      vehicle.customerId.toString() !== req.user._id.toString() &&
      req.user.role !== "Admin"
    ) {
      return res
        .status(403)
        .json({ message: "Unauthorized: You do not own this vehicle." });
    }

    vehicle.isDeleted = true;
    vehicle.deletedAt = new Date();
    await vehicle.save();

    res.status(200).json({
      success: true,
      message: "Vehicle deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};
