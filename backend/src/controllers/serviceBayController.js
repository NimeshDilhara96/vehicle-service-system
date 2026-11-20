const mongoose = require("mongoose");
const ServiceBay = require("../models/ServiceBay");
const Service = require("../models/Service");
const Appointment = require("../models/Appointment");
const Invoice = require("../models/Invoice");

const SERVICE_STAGES = [
  "Inspection",
  "Waiting for Approval",
  "In Progress",
  "Waiting for Parts",
  "Completed",
];

// Forward stage transitions (allows pausing for Customer Approval or Parts during active work)
const ALLOWED_STAGE_TRANSITIONS = {
  // Legacy support for any record previously created as "Vehicle Received"
  "Vehicle Received": [
    "Inspection",
    "Waiting for Approval",
    "In Progress",
    "Waiting for Parts",
    "Completed",
  ],
  Inspection: [
    "Waiting for Approval",
    "In Progress",
    "Waiting for Parts",
    "Completed",
  ],
  "Waiting for Approval": ["In Progress", "Waiting for Parts", "Completed"],
  "In Progress": ["Waiting for Approval", "Waiting for Parts", "Completed"],
  "Waiting for Parts": ["Waiting for Approval", "In Progress", "Completed"],
  Completed: [], // Terminal state: closed once completed
};

const ALLOWED_WORK_CATEGORIES = ["Repair", "Spare Part", "Fluid / Oil", "Other"];

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

// Reusable populate configuration so all bay responses include full vehicle, package, customer & additional work details
const BAY_POPULATE_CONFIG = {
  path: "currentServiceId",
  select:
    "vehicleSnapshot status inspectionNotes additionalWorkRequired additionalWorks statusLogs mechanicId customerId appointmentId vehicleId createdAt updatedAt",
  populate: [
    { path: "mechanicId", select: "name contactNo email" },
    { path: "customerId", select: "name contactNo email" },
    {
      path: "vehicleId",
      select: "registrationNo vehicleType brand modelName createdAt",
    },
    {
      path: "appointmentId",
      select:
        "serviceDate serviceTime requiresPickup pickupLocation status packageId createdAt",
      populate: {
        path: "packageId",
        select: "packageName description price",
      },
    },
  ],
};

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
      .populate(BAY_POPULATE_CONFIG)
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
      .populate(BAY_POPULATE_CONFIG)
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

// 4. Update the service stage, inspection notes, and additional work of the vehicle in a bay (Admin / assigned Mechanic)
exports.updateJobSheet = async (req, res, next) => {
  const { id } = req.params;
  const { status, inspectionNotes, additionalWorkRequired, stageNote } =
    req.body || {};

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

  if (stageNote !== undefined && typeof stageNote !== "string") {
    return res.status(400).json({ message: "stageNote must be a string." });
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

  const cleanStageNote =
    stageNote !== undefined
      ? stageNote.replace(CONTROL_CHARS_REGEX, "").trim().slice(0, 500)
      : "";

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

    const updateOps = { $set: update };
    if (status !== undefined && status !== currentService.status) {
      updateOps.$push = {
        statusLogs: {
          $each: [
            {
              stage: status,
              note: cleanStageNote,
              updatedBy: req.user._id,
              updatedByName: req.user.name || req.user.role || "Staff",
              updatedAt: new Date(),
            },
          ],
          $slice: -100,
        },
      };
    }

    const service = await Service.findOneAndUpdate(
      { _id: bay.currentServiceId, status: { $ne: "Completed" } },
      updateOps,
      { returnDocument: "after", session },
    );

    if (!service) {
      await session.abortTransaction();
      return res
        .status(409)
        .json({ message: "This service job is already completed." });
    }

    // Completing the job releases the bay atomically, finalizes invoice, and completes drop-off bookings
    if (service.status === "Completed") {
      bay.isAvailable = true;
      bay.currentServiceId = null;
      await bay.save({ session });

      await Invoice.findOneAndUpdate(
        { appointmentId: service.appointmentId },
        { $set: { invoiceStage: "Finalized", serviceId: service._id } },
        { returnDocument: "after", session },
      );

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
      .populate(BAY_POPULATE_CONFIG)
      .lean();

    res.status(200).json({
      success: true,
      message:
        service.status === "Completed"
          ? "Service completed and bay released."
          : status && status !== currentService.status
            ? `Vehicle moved to '${status}' stage.`
            : "Vehicle service notes updated.",
      bay: populatedBay,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// 5. Add an Additional Work / Spare Part item and send to Customer for approval (Admin & Mechanic)
exports.addAdditionalWorkItem = async (req, res, next) => {
  const { id } = req.params;
  const { title, description, category, estimatedCost } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid service bay ID." });
  }

  if (typeof title !== "string") {
    return res.status(400).json({ message: "Issue or part title is required." });
  }

  const cleanTitle = title.replace(CONTROL_CHARS_REGEX, "").trim().slice(0, 120);
  if (cleanTitle.length < 2) {
    return res
      .status(400)
      .json({ message: "Title must be at least 2 characters." });
  }

  const cleanDesc =
    typeof description === "string"
      ? description.replace(CONTROL_CHARS_REGEX, "").trim().slice(0, 500)
      : "";

  const cleanCategory =
    typeof category === "string" && ALLOWED_WORK_CATEGORIES.includes(category)
      ? category
      : "Repair";

  const parsedCost = Number(estimatedCost);
  if (!Number.isFinite(parsedCost) || parsedCost < 0 || parsedCost > 5000000) {
    return res.status(400).json({
      message: "Estimated cost must be a valid non-negative amount (LKR).",
    });
  }
  const roundedCost = Math.round(parsedCost);

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
      return res.status(404).json({ message: "Active service record not found." });
    }

    if (currentService.status === "Completed") {
      await session.abortTransaction();
      return res
        .status(409)
        .json({ message: "Cannot add items to a completed service job." });
    }

    if ((currentService.additionalWorks || []).length >= 30) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Maximum limit of 30 additional work items reached.",
      });
    }

    const newItem = {
      title: cleanTitle,
      description: cleanDesc,
      category: cleanCategory,
      estimatedCost: roundedCost,
      status: "Pending Approval",
      addedBy: req.user._id,
      addedByName: req.user.name || req.user.role || "Staff",
      addedAt: new Date(),
      respondedAt: null,
    };

    const nextStatus =
      currentService.status === "Inspection" ||
      currentService.status === "In Progress"
        ? "Waiting for Approval"
        : currentService.status;

    const logEntry = {
      stage: nextStatus,
      note: `Sent for customer approval: ${cleanTitle} (Rs. ${roundedCost.toLocaleString()})`,
      updatedBy: req.user._id,
      updatedByName: req.user.name || req.user.role || "Staff",
      updatedAt: new Date(),
    };

    const updatedService = await Service.findOneAndUpdate(
      { _id: currentService._id, status: { $ne: "Completed" } },
      {
        $set: {
          additionalWorkRequired: true,
          status: nextStatus,
        },
        $push: {
          additionalWorks: newItem,
          statusLogs: {
            $each: [logEntry],
            $slice: -100,
          },
        },
      },
      { returnDocument: "after", session },
    );

    if (!updatedService) {
      await session.abortTransaction();
      return res.status(409).json({ message: "Service job is already completed." });
    }

    await session.commitTransaction();

    const populatedBay = await ServiceBay.findById(bay._id)
      .populate(BAY_POPULATE_CONFIG)
      .lean();

    res.status(201).json({
      success: true,
      message: `"${cleanTitle}" sent to customer for approval.`,
      bay: populatedBay,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// 6. Remove a Pending Additional Work item before customer responds (Admin & Mechanic)
exports.removeAdditionalWorkItem = async (req, res, next) => {
  const { id, itemId } = req.params;

  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !mongoose.Types.ObjectId.isValid(itemId)
  ) {
    return res.status(400).json({ message: "Invalid bay or item ID." });
  }

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
    if (!currentService || currentService.status === "Completed") {
      await session.abortTransaction();
      return res
        .status(409)
        .json({ message: "Active service not found or already completed." });
    }

    const targetItem = (currentService.additionalWorks || []).find(
      (item) => item._id.toString() === itemId,
    );
    if (!targetItem) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Additional work item not found." });
    }

    if (targetItem.status !== "Pending Approval") {
      await session.abortTransaction();
      return res.status(409).json({
        message: `Cannot remove an item already '${targetItem.status}' by the customer.`,
      });
    }

    const remainingItems = currentService.additionalWorks.filter(
      (item) => item._id.toString() !== itemId,
    );
    const hasPending = remainingItems.some((i) => i.status === "Pending Approval");
    const hasAny = remainingItems.length > 0;

    const nextStatus =
      !hasPending && currentService.status === "Waiting for Approval"
        ? "In Progress"
        : currentService.status;

    await Service.findByIdAndUpdate(
      currentService._id,
      {
        $pull: { additionalWorks: { _id: itemId } },
        $set: {
          additionalWorkRequired: hasAny,
          status: nextStatus,
        },
      },
      { returnDocument: "after", session },
    );

    await session.commitTransaction();

    const populatedBay = await ServiceBay.findById(bay._id)
      .populate(BAY_POPULATE_CONFIG)
      .lean();

    res.status(200).json({
      success: true,
      message: "Pending item removed.",
      bay: populatedBay,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// 7. Customer approves or rejects a reported Additional Work / Spare Part item (recalculates Invoice atomically)
exports.respondToAdditionalWork = async (req, res, next) => {
  const { serviceId, itemId } = req.params;
  const { decision } = req.body || {};

  if (
    !mongoose.Types.ObjectId.isValid(serviceId) ||
    !mongoose.Types.ObjectId.isValid(itemId)
  ) {
    return res.status(400).json({ message: "Invalid service or item ID." });
  }

  if (decision !== "Approved" && decision !== "Rejected") {
    return res
      .status(400)
      .json({ message: "Decision must be either 'Approved' or 'Rejected'." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Strict IDOR protection: verify the service belongs to the authenticated Customer
    const service = await Service.findOne({
      _id: serviceId,
      customerId: req.user._id,
    }).session(session);

    if (!service) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "Service record not found or you do not have access to it.",
      });
    }

    if (service.status === "Completed") {
      await session.abortTransaction();
      return res
        .status(409)
        .json({ message: "This service has already been completed." });
    }

    const targetItem = (service.additionalWorks || []).find(
      (item) => item._id.toString() === itemId,
    );
    if (!targetItem) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Additional work item not found." });
    }

    if (targetItem.status !== "Pending Approval") {
      await session.abortTransaction();
      return res.status(409).json({
        message: `You have already marked this item as '${targetItem.status}'.`,
      });
    }

    targetItem.status = decision;
    targetItem.respondedAt = new Date();

    // Server-side recalculation of total approved additional work charges
    const approvedTotal = service.additionalWorks.reduce(
      (sum, item) =>
        item.status === "Approved" ? sum + (Number(item.estimatedCost) || 0) : sum,
      0,
    );

    const stillPending = service.additionalWorks.some(
      (item) => item.status === "Pending Approval",
    );

    // If all pending items are now answered and service was waiting for approval, automatically resume In Progress
    if (!stillPending && service.status === "Waiting for Approval") {
      service.status = "In Progress";
    }

    // Append audit log entry (capped to latest 100)
    service.statusLogs.push({
      stage: service.status,
      note: `Customer ${decision.toLowerCase()} "${targetItem.title}" (Rs. ${Number(targetItem.estimatedCost || 0).toLocaleString()})`,
      updatedBy: req.user._id,
      updatedByName: req.user.name || "Customer",
      updatedAt: new Date(),
    });
    if (service.statusLogs.length > 100) {
      service.statusLogs = service.statusLogs.slice(-100);
    }

    await service.save({ session });

    // Atomically update the customer's Invoice total strictly server-side
    let updatedInvoice = null;
    const invoice = await Invoice.findOne({
      appointmentId: service.appointmentId,
      customerId: req.user._id,
    }).session(session);

    if (invoice) {
      invoice.additionalWorkCharge = Math.round(approvedTotal);
      invoice.totalAmount =
        Math.round(invoice.packageCharge || 0) +
        Math.round(invoice.pickupDeliveryCharge || 0) +
        Math.round(approvedTotal);
      await invoice.save({ session });
      updatedInvoice = invoice.toObject();
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message:
        decision === "Approved"
          ? `Approved "${targetItem.title}" — your service estimate has been updated.`
          : `Rejected "${targetItem.title}" — the workshop has been notified.`,
      service: service.toObject(),
      invoice: updatedInvoice,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};
