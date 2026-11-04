const mongoose = require("mongoose");
const Service = require("../models/Service");
const Appointment = require("../models/Appointment");
const ServiceBay = require("../models/ServiceBay");
const Invoice = require("../models/Invoice");
const User = require("../models/User");

exports.startService = async (req, res, next) => {
  const { appointmentId, mechanicId, bayId } = req.body || {};

  // Strict ObjectId validation to prevent NoSQL injection & CastErrors
  if (
    typeof appointmentId !== "string" ||
    typeof mechanicId !== "string" ||
    typeof bayId !== "string" ||
    !mongoose.Types.ObjectId.isValid(appointmentId) ||
    !mongoose.Types.ObjectId.isValid(mechanicId) ||
    !mongoose.Types.ObjectId.isValid(bayId)
  ) {
    return res.status(400).json({
      message: "Valid appointmentId, mechanicId, and bayId are required.",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 0. Verify mechanicId belongs to an active user with role 'Mechanic'
    const mechanic = await User.findOne({
      _id: mechanicId,
      role: "Mechanic",
      isActive: true,
    })
      .select("_id name")
      .session(session)
      .lean();

    if (!mechanic) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Selected mechanic is invalid or inactive.",
      });
    }

    // 1. Atomically verify the Appointment exists and transition from 'Confirmed' -> 'In Progress' (prevents TOCTOU race conditions)
    const appointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, status: "Confirmed" },
      { $set: { status: "In Progress" } },
      { returnDocument: "after", session },
    );

    if (!appointment) {
      const existingApp = await Appointment.findById(appointmentId)
        .select("status")
        .session(session)
        .lean();
      await session.abortTransaction();
      if (!existingApp) {
        return res.status(404).json({ message: "Appointment not found." });
      }
      return res.status(400).json({
        message: `Cannot start service. Appointment status must be 'Confirmed' (current: '${existingApp.status}').`,
      });
    }

    // 2. Atomically claim the ServiceBay only if isAvailable is true (prevents double-allocating the same bay concurrently)
    const bay = await ServiceBay.findOneAndUpdate(
      { _id: bayId, isAvailable: true },
      { $set: { isAvailable: false } },
      { returnDocument: "after", session },
    );

    if (!bay) {
      const existingBay = await ServiceBay.findById(bayId)
        .select("bayName isAvailable")
        .session(session)
        .lean();
      await session.abortTransaction();
      if (!existingBay) {
        return res.status(404).json({ message: "Service bay not found." });
      }
      return res.status(409).json({
        message: `Service bay '${existingBay.bayName}' is currently occupied.`,
      });
    }

    // 3. Create a new Service record with status 'Vehicle Received'
    const [createdService] = await Service.create(
      [
        {
          appointmentId: appointment._id,
          customerId: appointment.customerId,
          vehicleId: appointment.vehicleId,
          vehicleSnapshot: appointment.vehicleSnapshot,
          mechanicId: mechanic._id,
          bayId: bay._id,
          status: "Vehicle Received",
        },
      ],
      { session },
    );

    // 4. Attach currentServiceId to the claimed ServiceBay
    bay.currentServiceId = createdService._id;
    await bay.save({ session });

    // 5. Update the Invoice: set serviceId to this new service
    await Invoice.findOneAndUpdate(
      { appointmentId: appointment._id },
      { $set: { serviceId: createdService._id } },
      { returnDocument: "after", session },
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Service started successfully.",
      service: createdService,
    });
  } catch (error) {
    await session.abortTransaction();

    if (error.code === 11000) {
      return res.status(409).json({
        message: "A service record already exists for this appointment.",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    next(error);
  } finally {
    session.endSession();
  }
};
