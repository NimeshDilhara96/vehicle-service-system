const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const ServicePackage = require("../models/ServicePackage");
const Vehicle = require("../models/Vehicle");
const PickupDelivery = require("../models/PickupDelivery");
const Invoice = require("../models/Invoice");
const Service = require("../models/Service");
const ServiceBay = require("../models/ServiceBay");
const User = require("../models/User");
const Driver = require("../models/Driver");
const {
  WORKSHOP_COORDS,
  WORKSHOP_ADDRESS,
  getActiveWorkshops,
  calculateSecurePickupFare,
} = require("../services/pickupService");

const VALID_APPOINTMENT_STATUSES = [
  "Pending",
  "Confirmed",
  "In Progress",
  "Completed",
  "Cancelled",
];

const STANDARD_TIME_SLOTS = [
  "09:00 AM",
  "10:30 AM",
  "12:00 PM",
  "01:30 PM",
  "03:00 PM",
  "04:30 PM",
];

const DEFAULT_SLOT_CAPACITY = 3;
const DATE_QUERY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function getLocalTodayAndMinutes(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return { todayStr, currentMinutes };
}

function parseTimeSlotToMinutes(slotStr) {
  if (typeof slotStr !== "string") return -1;
  const match = slotStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function isSlotInPast(dateStr, slotStr, now = new Date()) {
  const { todayStr, currentMinutes } = getLocalTodayAndMinutes(now);
  if (dateStr < todayStr) return true;
  if (dateStr > todayStr) return false;
  const slotMinutes = parseTimeSlotToMinutes(slotStr);
  return slotMinutes <= currentMinutes;
}

// Ensure default 3 ServiceBays exist in DB
async function ensureDefaultBays() {
  const count = await ServiceBay.countDocuments({});
  if (count === 0) {
    await ServiceBay.insertMany([
      { bayName: "Bay 1", bayType: "Mechanical", isAvailable: true },
      { bayName: "Bay 2", bayType: "General", isAvailable: true },
      { bayName: "Bay 3", bayType: "Washing", isAvailable: true },
    ]).catch(() => {});
  }
}

// 1a. Get available time slots for a specific date (YYYY-MM-DD) before booking
// Vehicles that have not exited the workshop (status not Completed/Cancelled) continue to hold their bay/slot
exports.getAvailableSlots = async (req, res, next) => {
  try {
    await ensureDefaultBays();

    const now = new Date();
    const { todayStr } = getLocalTodayAndMinutes(now);

    const rawDate = req.query?.date;
    const dateStr =
      typeof rawDate === "string" && DATE_QUERY_REGEX.test(rawDate.trim())
        ? rawDate.trim()
        : todayStr;

    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

    if (Number.isNaN(dayEnd.getTime())) {
      return res.status(400).json({ message: "Invalid service date format." });
    }

    const [slotCounts, totalBaysCount, occupiedBaysDocs, inProgressCount] =
      await Promise.all([
        // Count uncompleted appointments (Pending/Confirmed) up to the selected date by time slot
        Appointment.aggregate([
          {
            $match: {
              serviceDate: { $lte: dayEnd },
              status: { $in: ["Pending", "Confirmed"] },
            },
          },
          {
            $group: {
              _id: "$serviceTime",
              count: { $sum: 1 },
            },
          },
        ]),
        ServiceBay.countDocuments({}),
        ServiceBay.countDocuments({ isAvailable: false }),
        Appointment.countDocuments({
          serviceDate: { $lte: dayEnd },
          status: "In Progress",
        }),
      ]);

    const maxCapacity = Math.max(DEFAULT_SLOT_CAPACITY, totalBaysCount || 0);
    // Bays physically locked by vehicles currently inside the workshop ("In Progress" or bay.isAvailable === false)
    const lockedBaysInWorkshop = Math.max(occupiedBaysDocs, inProgressCount);

    const bookedMap = {};
    for (const item of slotCounts) {
      if (item._id) {
        bookedMap[item._id] = item.count;
      }
    }

    const slots = STANDARD_TIME_SLOTS.map((time) => {
      const slotPendingOrConfirmed = bookedMap[time] || 0;
      const totalOccupiedForSlot =
        lockedBaysInWorkshop + slotPendingOrConfirmed;
      const remaining = Math.max(0, maxCapacity - totalOccupiedForSlot);
      const isPast = isSlotInPast(dateStr, time, now);
      return {
        time,
        bookedCount: totalOccupiedForSlot,
        lockedBaysInWorkshop,
        maxCapacity,
        remaining,
        isPast,
        isAvailable: !isPast && remaining > 0,
      };
    });

    res.status(200).json({
      success: true,
      date: dateStr,
      maxCapacity,
      lockedBaysInWorkshop,
      slots,
    });
  } catch (error) {
    next(error);
  }
};

// 1. Get all service packages & active workshop branches (Auto-seeds default packages if empty)
exports.getServicePackages = async (req, res, next) => {
  try {
    let packages = await ServicePackage.find({ isActive: true }).lean();

    // Database එක හිස් නම් පරීක්ෂා කිරීමට පැකේජ් 3ක් ඉබේම ඇතුළත් කරයි
    if (packages.length === 0) {
      packages = await ServicePackage.insertMany([
        {
          packageName: "Full Vehicle Service",
          description:
            "Complete engine oil change, filter replacement, underbody wash, vacuum, and 30-point inspection.",
          price: 15000,
          isActive: true,
        },
        {
          packageName: "Oil & Filter Change",
          description:
            "Engine oil replacement, oil filter change, and basic fluid top-up.",
          price: 8500,
          isActive: true,
        },
        {
          packageName: "Body Wash & Interior Detailing",
          description:
            "Exterior foam wash, wax polish, interior vacuuming, and dashboard dressing.",
          price: 3500,
          isActive: true,
        },
      ]);
    }

    res.status(200).json({
      success: true,
      packages,
      workshops: getActiveWorkshops(),
    });
  } catch (error) {
    next(error);
  }
};

// 2. Calculate Pickup Fee securely via pickupService (routes to nearest workshop within Western Province)
exports.calculatePickupFee = async (req, res, next) => {
  try {
    const { endCoords, vehicleType } = req.body;

    if (!endCoords || !Array.isArray(endCoords) || endCoords.length !== 2) {
      return res
        .status(400)
        .json({ message: "Valid pickup coordinates [lat, lng] are required." });
    }

    const { pickupCharge, distanceKm, workshop } =
      await calculateSecurePickupFare(endCoords, vehicleType);

    res.status(200).json({
      success: true,
      pickupCharge,
      distanceKm,
      workshop,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// 3. Create Appointment + PickupDelivery + Initial Invoice in an atomic DB transaction
exports.createAppointment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      vehicleId,
      packageId,
      serviceDate,
      serviceTime,
      requiresPickup,
      pickupLocation,
    } = req.body;

    // A. Verify Vehicle Ownership & Active Status (IDOR & Soft-Delete Check)
    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      customerId: req.user._id,
      isDeleted: false,
    }).session(session);

    if (!vehicle) {
      await session.abortTransaction();
      return res.status(403).json({
        message:
          "Invalid vehicle selected or you do not have permission to use this vehicle.",
      });
    }

    // B. Verify Service Package
    const servicePackage = await ServicePackage.findOne({
      _id: packageId,
      isActive: true,
    }).session(session);
    if (!servicePackage) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ message: "Selected service package is not available." });
    }

    // B2. Validate Date & Check Time Slot Capacity within the Transaction (Prevents Overbooking Race Condition)
    if (
      typeof serviceTime !== "string" ||
      !STANDARD_TIME_SLOTS.includes(serviceTime)
    ) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid time slot selected." });
    }

    const parsedDate = new Date(serviceDate);
    if (Number.isNaN(parsedDate.getTime())) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid service date." });
    }

    const dateIso =
      typeof serviceDate === "string" && DATE_QUERY_REGEX.test(serviceDate.trim())
        ? serviceDate.trim()
        : parsedDate.toISOString().split("T")[0];

    const now = new Date();
    const { todayStr } = getLocalTodayAndMinutes(now);

    if (dateIso < todayStr) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Cannot book an appointment for a past date.",
      });
    }

    if (isSlotInPast(dateIso, serviceTime, now)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `The ${serviceTime} time slot on ${dateIso} has already passed. Please choose a future time slot or date.`,
      });
    }

    const dayEnd = new Date(`${dateIso}T23:59:59.999Z`);

    const [
      existingSlotBookings,
      totalBaysCount,
      occupiedBaysDocs,
      inProgressCount,
    ] = await Promise.all([
      Appointment.countDocuments({
        serviceDate: { $lte: dayEnd },
        serviceTime,
        status: { $in: ["Pending", "Confirmed"] },
      }).session(session),
      ServiceBay.countDocuments({}).session(session),
      ServiceBay.countDocuments({ isAvailable: false }).session(session),
      Appointment.countDocuments({
        serviceDate: { $lte: dayEnd },
        status: "In Progress",
      }).session(session),
    ]);

    const maxCapacity = Math.max(DEFAULT_SLOT_CAPACITY, totalBaysCount || 0);
    const lockedBaysInWorkshop = Math.max(occupiedBaysDocs, inProgressCount);
    const totalOccupied = lockedBaysInWorkshop + existingSlotBookings;

    if (totalOccupied >= maxCapacity) {
      await session.abortTransaction();
      return res.status(409).json({
        message: `The ${serviceTime} slot on ${dateIso} has no free service bays available until current vehicles exit the workshop.`,
      });
    }

    // C. Build Historical Vehicle Snapshot
    const vehicleSnapshot = {
      registrationNo: vehicle.registrationNo,
      vehicleType: vehicle.vehicleType,
      brand: vehicle.brand || "",
      modelName: vehicle.modelName || "",
    };

    // D. Server-Side Pickup Fare Recalculation & Nearest Workshop Selection
    let verifiedPickupCharge = 0;
    let verifiedDistanceKm = 0;
    let pickupCoords = null;
    let pickupAddress = "";
    let assignedWorkshop = {
      address: WORKSHOP_ADDRESS,
      coordinates: WORKSHOP_COORDS,
    };

    if (requiresPickup) {
      if (
        !pickupLocation ||
        !Array.isArray(pickupLocation.coordinates) ||
        pickupLocation.coordinates.length !== 2
      ) {
        await session.abortTransaction();
        return res.status(400).json({
          message:
            "Pickup coordinates and address are required for pickup service.",
        });
      }

      pickupCoords = pickupLocation.coordinates;
      pickupAddress = pickupLocation.address || "Pinned Map Location";

      const fareResult = await calculateSecurePickupFare(
        pickupCoords,
        vehicle.vehicleType,
      );

      verifiedPickupCharge = fareResult.pickupCharge;
      verifiedDistanceKm = fareResult.distanceKm;
      if (fareResult.workshop) {
        assignedWorkshop = fareResult.workshop;
      }
    }

    // E. Step 1: Create the Appointment within the transaction
    const [createdAppointment] = await Appointment.create(
      [
        {
          customerId: req.user._id,
          vehicleId: vehicle._id,
          vehicleSnapshot,
          packageId: servicePackage._id,
          serviceDate,
          serviceTime,
          requiresPickup: !!requiresPickup,
          pickupLocation: requiresPickup
            ? { address: pickupAddress, coordinates: pickupCoords }
            : undefined,
          status: "Confirmed",
        },
      ],
      { session },
    );

    // F. Step 2: If Pickup is requested, create PickupDelivery record within the transaction
    let createdPickup = null;
    if (requiresPickup) {
      const [pickupDoc] = await PickupDelivery.create(
        [
          {
            appointmentId: createdAppointment._id,
            customerId: req.user._id,
            pickupLocation: {
              address: pickupAddress,
              coordinates: pickupCoords,
            },
            deliveryLocation: {
              address: assignedWorkshop.address,
              coordinates: assignedWorkshop.coordinates,
            },
            distance: verifiedDistanceKm,
            charge: verifiedPickupCharge,
            pickupStatus: "Pending Assignment",
          },
        ],
        { session },
      );
      createdPickup = pickupDoc;
    }

    // G. Step 3: Immediately generate the Initial Estimate Invoice within the transaction
    const totalInitialAmount = servicePackage.price + verifiedPickupCharge;

    const [createdInvoice] = await Invoice.create(
      [
        {
          appointmentId: createdAppointment._id,
          customerId: req.user._id,
          vehicleSnapshot,
          packageCharge: servicePackage.price,
          pickupDeliveryCharge: verifiedPickupCharge,
          additionalWorkCharge: 0,
          totalAmount: totalInitialAmount,
          invoiceStage: "Initial Estimate",
          paymentStatus: "Unpaid",
        },
      ],
      { session },
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Appointment booked and initial invoice generated successfully.",
      appointment: createdAppointment,
      pickupDelivery: createdPickup,
      invoice: createdInvoice,
    });
  } catch (error) {
    await session.abortTransaction();

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
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

// 4. Get Logged-in Customer's Bookings + Attached Invoices
exports.getMyBookings = async (req, res, next) => {
  try {
    const appointments = await Appointment.find({ customerId: req.user._id })
      .populate("packageId", "packageName price description")
      .sort({ createdAt: -1 })
      .lean();

    // Fetch corresponding invoices and services for these appointments
    const appointmentIds = appointments.map((a) => a._id);
    const [invoices, services] = await Promise.all([
      Invoice.find({
        appointmentId: { $in: appointmentIds },
        customerId: req.user._id,
      }).lean(),
      Service.find({
        appointmentId: { $in: appointmentIds },
        customerId: req.user._id,
      }).lean(),
    ]);

    const invoiceMap = {};
    invoices.forEach((inv) => {
      invoiceMap[inv.appointmentId.toString()] = inv;
    });

    const serviceMap = {};
    services.forEach((srv) => {
      if (srv.appointmentId) {
        serviceMap[srv.appointmentId.toString()] = srv;
      }
    });

    // Attach invoice and service directly to each appointment object for easy Frontend rendering
    const enrichedAppointments = appointments.map((app) => ({
      ...app,
      invoice: invoiceMap[app._id.toString()] || null,
      service: serviceMap[app._id.toString()] || null,
    }));

    res.status(200).json({
      success: true,
      count: enrichedAppointments.length,
      appointments: enrichedAppointments,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Admin: Get All Appointments with O(N) Batch Joins, Available Drivers & Summary Metrics
exports.getAllAppointmentsAdmin = async (req, res, next) => {
  try {
    const appointments = await Appointment.find({})
      .populate("customerId", "name email contactNo")
      .populate("packageId", "packageName price")
      .sort({ createdAt: -1 })
      .lean();

    const appointmentIds = appointments.map((a) => a._id);

    // Parallel batch fetch (avoids N+1 queries)
    const [invoices, services, pickups, availableDrivers] = await Promise.all([
      Invoice.find({ appointmentId: { $in: appointmentIds } }).lean(),
      Service.find({ appointmentId: { $in: appointmentIds } }).lean(),
      PickupDelivery.find({ appointmentId: { $in: appointmentIds } })
        .populate("driverId", "name contactNo licenseNo photograph isAvailable")
        .lean(),
      Driver.find({ isDeleted: false, isAvailable: true })
        .select("name contactNo licenseNo photograph isAvailable")
        .sort({ name: 1 })
        .lean(),
    ]);

    const invoiceMap = {};
    for (const inv of invoices) {
      invoiceMap[inv.appointmentId.toString()] = inv;
    }

    const serviceMap = {};
    for (const srv of services) {
      if (srv.appointmentId) {
        serviceMap[srv.appointmentId.toString()] = srv;
      }
    }

    const pickupMap = {};
    for (const p of pickups) {
      pickupMap[p.appointmentId.toString()] = p;
    }

    const stats = {
      total: appointments.length,
      Pending: 0,
      Confirmed: 0,
      "In Progress": 0,
      Completed: 0,
      Cancelled: 0,
      pickupCount: 0,
    };

    const enrichedAppointments = appointments.map((app) => {
      const idStr = app._id.toString();
      if (stats[app.status] !== undefined) {
        stats[app.status] += 1;
      }
      if (app.requiresPickup) {
        stats.pickupCount += 1;
      }

      return {
        ...app,
        invoice: invoiceMap[idStr] || null,
        service: serviceMap[idStr] || null,
        pickupDelivery: pickupMap[idStr] || null,
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedAppointments.length,
      stats,
      availableDrivers,
      serverTime: new Date().toISOString(),
      appointments: enrichedAppointments,
    });
  } catch (error) {
    next(error);
  }
};

// 6. Admin: Update Appointment Status & Automatically Create Workshop Service when Vehicle Arrives ("In Progress")
exports.updateAppointmentStatusAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    if (!VALID_APPOINTMENT_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed values: ${VALID_APPOINTMENT_STATUSES.join(", ")}`,
      });
    }

    const updated = await Appointment.findByIdAndUpdate(
      id,
      { status },
      { returnDocument: "after", runValidators: true },
    )
      .populate("customerId", "name email contactNo")
      .populate("packageId", "packageName price")
      .lean();

    if (!updated) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    // Sync Workshop Service record if present (or auto-assign available Mechanic & ServiceBay when transitioning to "In Progress")
    let serviceDoc = await Service.findOne({ appointmentId: updated._id }).lean();

    if (status === "In Progress" && !serviceDoc) {
      const [availableBay, availableMechanic] = await Promise.all([
        ServiceBay.findOneAndUpdate(
          { isAvailable: true },
          { $set: { isAvailable: false } },
          { returnDocument: "after" },
        ),
        User.findOne({ role: "Mechanic", isActive: true }).select("_id").lean(),
      ]);

      if (availableBay && availableMechanic) {
        const createdSrv = await Service.create({
          customerId: updated.customerId?._id || updated.customerId,
          vehicleId: updated.vehicleId,
          vehicleSnapshot: updated.vehicleSnapshot,
          appointmentId: updated._id,
          mechanicId: availableMechanic._id,
          bayId: availableBay._id,
          status: "Vehicle Received",
        });
        availableBay.currentServiceId = createdSrv._id;
        await availableBay.save();
        await Invoice.findOneAndUpdate(
          { appointmentId: updated._id },
          { $set: { serviceId: createdSrv._id } },
          { returnDocument: "after" },
        );
        serviceDoc = createdSrv.toObject();
      }
    } else if (status === "Completed" && serviceDoc) {
      serviceDoc = await Service.findByIdAndUpdate(
        serviceDoc._id,
        { status: "Completed" },
        { returnDocument: "after" },
      ).lean();
      if (serviceDoc?.bayId) {
        await ServiceBay.findByIdAndUpdate(serviceDoc.bayId, {
          $set: { isAvailable: true, currentServiceId: null },
        });
      }
    }

    // If this was a Pickup appointment and Admin marked Vehicle Received ("In Progress"), mark pickup as Delivered to Workshop
    let pickupDoc = await PickupDelivery.findOne({ appointmentId: updated._id })
      .populate("driverId", "name contactNo licenseNo photograph isAvailable")
      .lean();

    if (
      status === "In Progress" &&
      pickupDoc &&
      pickupDoc.pickupStatus !== "Delivered to Workshop" &&
      pickupDoc.pickupStatus !== "Delivered to Customer"
    ) {
      pickupDoc = await PickupDelivery.findByIdAndUpdate(
        pickupDoc._id,
        {
          $set: { pickupStatus: "Delivered to Workshop" },
          $push: {
            statusLogs: {
              $each: [
                {
                  status: "Delivered to Workshop",
                  note: "Vehicle received at workshop — Service started.",
                  updatedByRole: req.user?.role || "Admin",
                  updatedByName: String(req.user?.name || "Admin").slice(
                    0,
                    100,
                  ),
                  timestamp: new Date(),
                },
              ],
              $slice: -100,
            },
          },
        },
        { returnDocument: "after" },
      )
        .populate("driverId", "name contactNo licenseNo photograph isAvailable")
        .lean();
    }

    res.status(200).json({
      success: true,
      message:
        status === "Confirmed"
          ? "Booking slot confirmed."
          : status === "In Progress"
            ? "Vehicle received at workshop! Service job automatically created for Mechanic."
            : `Appointment status updated to ${status}.`,
      appointment: {
        ...updated,
        service: serviceDoc || null,
        pickupDelivery: pickupDoc || null,
      },
    });
  } catch (error) {
    next(error);
  }
};
