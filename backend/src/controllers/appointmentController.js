const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const ServicePackage = require("../models/ServicePackage");
const Vehicle = require("../models/Vehicle");
const PickupDelivery = require("../models/PickupDelivery");
const Invoice = require("../models/Invoice");
const Service = require("../models/Service");
const {
  WORKSHOP_COORDS,
  WORKSHOP_ADDRESS,
  getActiveWorkshops,
  calculateSecurePickupFare,
} = require("../services/pickupService");

// 1. Get all service packages & active workshop branches (Auto-seeds default packages if empty)
exports.getServicePackages = async (req, res, next) => {
  try {
    let packages = await ServicePackage.find({ isActive: true });

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
          status: "Pending",
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
