const mongoose = require("mongoose");
const ServiceBay = require("../models/ServiceBay");

const ALLOWED_BAY_TYPES = [
  "Mechanical",
  "Electrical",
  "Washing",
  "Inspection",
  "General",
];

// Strip control characters to prevent log/header injection
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;

// 1. Fetch all service bays (auto-seeds 3 default bays if none exist)
exports.getAllBays = async (req, res, next) => {
  try {
    const count = await ServiceBay.countDocuments({});
    if (count === 0) {
      await ServiceBay.insertMany([
        { bayName: "Bay 1", bayType: "Mechanical", isAvailable: true },
        { bayName: "Bay 2", bayType: "General", isAvailable: true },
        { bayName: "Bay 3", bayType: "Washing", isAvailable: true },
      ]).catch(() => {});
    }

    const bays = await ServiceBay.find({})
      .populate({
        path: "currentServiceId",
        select:
          "vehicleSnapshot status inspectionNotes mechanicId customerId appointmentId createdAt",
        populate: [
          { path: "mechanicId", select: "name contactNo email" },
          {
            path: "appointmentId",
            select: "bookingDate timeSlot selectedPackage customerDetails",
          },
          { path: "customerId", select: "name contactNo email" },
        ],
      })
      .sort({ bayName: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: bays.length,
      bays,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Create a new service bay (Admin only)
exports.addBay = async (req, res, next) => {
  try {
    const { bayName, bayType } = req.body || {};

    // Prevent NoSQL operator injection by enforcing strict string type
    if (typeof bayName !== "string") {
      return res.status(400).json({ message: "Service bay name is required." });
    }

    const sanitizedBayName = bayName
      .replace(CONTROL_CHARS_REGEX, "")
      .trim();

    if (sanitizedBayName.length < 2 || sanitizedBayName.length > 60) {
      return res.status(400).json({
        message: "Service bay name must be between 2 and 60 characters.",
      });
    }

    const resolvedBayType = bayType !== undefined ? bayType : "General";
    if (
      typeof resolvedBayType !== "string" ||
      !ALLOWED_BAY_TYPES.includes(resolvedBayType)
    ) {
      return res.status(400).json({
        message: `Invalid bay type. Allowed values: ${ALLOWED_BAY_TYPES.join(", ")}`,
      });
    }

    const existingBay = await ServiceBay.findOne({
      bayName: sanitizedBayName,
    }).lean();
    if (existingBay) {
      return res
        .status(400)
        .json({ message: "A service bay with this name already exists." });
    }

    const bay = await ServiceBay.create({
      bayName: sanitizedBayName,
      bayType: resolvedBayType,
    });

    res.status(201).json({
      success: true,
      message: "Service bay created successfully.",
      bay,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "A service bay with this name already exists." });
    }
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    next(error);
  }
};

// 3. Manually toggle isAvailable status and clear currentServiceId if setting to true (Admin only)
exports.updateBayStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isAvailable, currentServiceId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid service bay ID." });
    }

    if (isAvailable !== undefined && typeof isAvailable !== "boolean") {
      return res
        .status(400)
        .json({ message: "isAvailable must be a boolean value." });
    }

    if (
      currentServiceId !== undefined &&
      currentServiceId !== null &&
      !mongoose.Types.ObjectId.isValid(currentServiceId)
    ) {
      return res.status(400).json({ message: "Invalid currentServiceId." });
    }

    const bay = await ServiceBay.findById(id);
    if (!bay) {
      return res.status(404).json({ message: "Service bay not found." });
    }

    const nextAvailability =
      typeof isAvailable === "boolean" ? isAvailable : !bay.isAvailable;

    bay.isAvailable = nextAvailability;

    if (nextAvailability === true) {
      bay.currentServiceId = null;
    } else if (currentServiceId !== undefined) {
      bay.currentServiceId = currentServiceId;
    }

    await bay.save();

    const populatedBay = await ServiceBay.findById(bay._id)
      .populate({
        path: "currentServiceId",
        select:
          "vehicleSnapshot status inspectionNotes mechanicId customerId appointmentId createdAt",
        populate: [
          { path: "mechanicId", select: "name contactNo email" },
          {
            path: "appointmentId",
            select: "bookingDate timeSlot selectedPackage customerDetails",
          },
          { path: "customerId", select: "name contactNo email" },
        ],
      })
      .lean();

    res.status(200).json({
      success: true,
      message: `Service bay marked as ${nextAvailability ? "Available" : "Occupied"}.`,
      bay: populatedBay,
    });
  } catch (error) {
    next(error);
  }
};
