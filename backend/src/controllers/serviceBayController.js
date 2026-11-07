const mongoose = require("mongoose");
const ServiceBay = require("../models/ServiceBay");
const Service = require("../models/Service");
const Appointment = require("../models/Appointment");

const SERVICE_STAGES = [
  "Inspection",
  "Waiting for Approval",
  "In Progress",
  "Waiting for Parts",
  "Completed",
];

// Unidirectional forward-only stage transitions.
// Strictly prevents reverting back to previous stages.
const ALLOWED_STAGE_TRANSITIONS = {
  // Legacy support for any record previously created as "Vehicle Received"
  "Vehicle Received": [
    "Inspection",
    "Waiting for Approval",
    "In Progress",
    "Waiting for Parts",
    "Completed",
  ],
  "Inspection": [
    "Waiting for Approval",
    "In Progress",
    "Waiting for Parts",
    "Completed",
  ],
  "Waiting for Approval": [
    "In Progress",
    "Waiting for Parts",
    "Completed",
  ],
  "In Progress": [
    "Waiting for Parts",
    "Completed",
  ],
  "Waiting for Parts": [
    "In Progress",
    "Completed",
  ],
  "Completed": [], // Terminal state: closed once completed
};

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
          "vehicleSnapshot status inspectionNotes additionalWorkRequired mechanicId customerId appointmentId createdAt",
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

    // Prevent releasing the bay if a vehicle is currently in progress / not completed
    if (nextAvailability === true) {
      let activeService = null;
      if (bay.currentServiceId) {
        activeService = await Service.findById(bay.currentServiceId).lean();
      } else {
        activeService = await Service.findOne({
          bayId: bay._id,
          status: { $ne: "Completed" },
        }).lean();
      }

      if (activeService && activeService.status !== "Completed") {
        const vehiclePlate =
          activeService.vehicleSnapshot?.registrationNo || "Vehicle";
        return res.status(409).json({
          message: `Cannot release service bay '${bay.bayName}' while vehicle (${vehiclePlate}) service is currently '${activeService.status}'. Complete the service job before releasing the bay.`,
        });
      }

      bay.currentServiceId = null;
    } else if (currentServiceId !== undefined) {
      bay.currentServiceId = currentServiceId;
    }

    bay.isAvailable = nextAvailability;
    await bay.save();

    const populatedBay = await ServiceBay.findById(bay._id)
      .populate({
        path: "currentServiceId",
        select:
          "vehicleSnapshot status inspectionNotes additionalWorkRequired mechanicId customerId appointmentId createdAt",
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

// 4. Update the Job Sheet (stage, inspection notes, additional work) of the vehicle currently in a bay (Admin only)
exports.updateJobSheet = async (req, res, next) => {
  const { id } = req.params;
  const { status, inspectionNotes, additionalWorkRequired } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid service bay ID." });
  }

  if (status !== undefined && !SERVICE_STAGES.includes(status)) {
    return res.status(400).json({
      message: `Invalid stage. Allowed values: ${SERVICE_STAGES.join(", ")}`,
    });
  }

  if (inspectionNotes !== undefined && typeof inspectionNotes !== "string") {
    return res
      .status(400)
      .json({ message: "inspectionNotes must be a string." });
  }

  if (
    additionalWorkRequired !== undefined &&
    typeof additionalWorkRequired !== "boolean"
  ) {
    return res
      .status(400)
      .json({ message: "additionalWorkRequired must be a boolean." });
  }

  const cleanNotes =
    inspectionNotes !== undefined
      ? inspectionNotes.replace(CONTROL_CHARS_REGEX, "").trim().slice(0, 2000)
      : undefined;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const bay = await ServiceBay.findById(id).session(session);
    if (!bay || !bay.currentServiceId) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ message: "No active service found in this bay." });
    }

    const currentService = await Service.findById(bay.currentServiceId).session(
      session,
    );
    if (!currentService) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ message: "Active service record not found." });
    }

    if (currentService.status === "Completed") {
      await session.abortTransaction();
      return res
        .status(409)
        .json({ message: "This service job is already completed and closed." });
    }

    // Object-level authorization: Mechanics can only update vehicles assigned to them
    if (
      req.user.role === "Mechanic" &&
      currentService.mechanicId &&
      currentService.mechanicId.toString() !== req.user._id.toString()
    ) {
      await session.abortTransaction();
      return res.status(403).json({
        message:
          "You are only authorized to update job sheets for vehicles assigned to you.",
      });
    }

    // Forward-only stage progression validation (cannot revert to previous steps)
    if (status !== undefined && status !== currentService.status) {
      const allowedNext = ALLOWED_STAGE_TRANSITIONS[currentService.status] || [];
      if (!allowedNext.includes(status)) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Cannot revert stage from '${currentService.status}' to '${status}'. Service stages can only progress forward.`,
        });
      }
    }

    const update = {};
    if (status !== undefined) update.status = status;
    if (cleanNotes !== undefined) update.inspectionNotes = cleanNotes;
    if (additionalWorkRequired !== undefined) {
      update.additionalWorkRequired = additionalWorkRequired;
    } else if (
      status === "Waiting for Approval" &&
      !currentService.additionalWorkRequired
    ) {
      update.additionalWorkRequired = true;
    }

    const service = await Service.findOneAndUpdate(
      { _id: bay.currentServiceId, status: { $ne: "Completed" } },
      { $set: update },
      { returnDocument: "after", session },
    );

    if (!service) {
      await session.abortTransaction();
      return res
        .status(409)
        .json({ message: "This service job is already completed." });
    }

    // Completing the job releases the bay atomically; drop-off bookings are completed too
    if (service.status === "Completed") {
      bay.isAvailable = true;
      bay.currentServiceId = null;
      await bay.save({ session });

      const appointment = await Appointment.findById(service.appointmentId)
        .select("requiresPickup status")
        .session(session);
      if (
        appointment &&
        !appointment.requiresPickup &&
        appointment.status === "In Progress"
      ) {
        appointment.status = "Completed";
        await appointment.save({ session });
      }
    }

    await session.commitTransaction();

    const populatedBay = await ServiceBay.findById(bay._id)
      .populate({
        path: "currentServiceId",
        select:
          "vehicleSnapshot status inspectionNotes additionalWorkRequired mechanicId customerId appointmentId createdAt",
        populate: [
          { path: "mechanicId", select: "name contactNo email" },
          { path: "customerId", select: "name contactNo email" },
        ],
      })
      .lean();

    res.status(200).json({
      success: true,
      message:
        service.status === "Completed"
          ? "Service completed and bay released."
          : "Job sheet updated.",
      bay: populatedBay,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};
