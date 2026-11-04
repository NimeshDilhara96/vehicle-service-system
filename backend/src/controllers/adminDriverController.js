const mongoose = require("mongoose");
const Driver = require("../models/Driver");
const User = require("../models/User");
const PickupDelivery = require("../models/PickupDelivery");
const Appointment = require("../models/Appointment");
const Service = require("../models/Service");
const {
  createDriverSchema,
  updateDriverSchema,
  toggleAvailabilitySchema,
  assignTaskSchema,
  updateTaskStatusSchema,
  formatZodError,
} = require("../validators/driverValidator");

// Incomplete pickup/delivery statuses
const ACTIVE_PICKUP_STATUSES = [
  "Driver Assigned",
  "En Route to Pickup",
  "Vehicle Picked Up",
  "Delivered to Workshop",
  "Out for Return Delivery",
];

// Track whether initial User->Driver sync has been verified in this process
let hasSyncedSeededDriverUsers = false;

async function ensureSeededDriversSynced() {
  if (hasSyncedSeededDriverUsers) return;
  try {
    const driverUsers = await User.find({
      role: "Driver",
      isActive: true,
    })
      .select("_id name contactNo")
      .lean();

    if (driverUsers.length > 0) {
      const existingDrivers = await Driver.find({
        $or: [
          { userId: { $in: driverUsers.map((u) => u._id) } },
          { contactNo: { $in: driverUsers.map((u) => u.contactNo) } },
        ],
      })
        .select("userId contactNo")
        .lean();

      const linkedUserIds = new Set(
        existingDrivers
          .filter((d) => d.userId)
          .map((d) => d.userId.toString()),
      );
      const linkedContacts = new Set(existingDrivers.map((d) => d.contactNo));

      const missingOps = [];
      for (const u of driverUsers) {
        if (
          !linkedUserIds.has(u._id.toString()) &&
          !linkedContacts.has(u.contactNo)
        ) {
          const suffix = u._id.toString().slice(-6).toUpperCase();
          missingOps.push({
            updateOne: {
              filter: { userId: u._id, isDeleted: false },
              update: {
                $setOnInsert: {
                  userId: u._id,
                  name: u.name,
                  contactNo: u.contactNo,
                  licenseNo: `DRV-${suffix}`,
                  photograph: "",
                  isAvailable: true,
                  isDeleted: false,
                },
              },
              upsert: true,
            },
          });
        }
      }

      if (missingOps.length > 0) {
        await Driver.bulkWrite(missingOps, { ordered: false }).catch(() => {});
      }
    }
    hasSyncedSeededDriverUsers = true;
  } catch {
    // Non-fatal fallback
  }
}

// 1. Get all non-deleted drivers with O(1) DB-side active task aggregation
exports.getAllDrivers = async (req, res, next) => {
  try {
    await ensureSeededDriversSynced();

    const drivers = await Driver.find({ isDeleted: false })
      .populate("userId", "name email isActive")
      .sort({ createdAt: -1 })
      .lean();

    const driverLookupIds = [];
    for (const d of drivers) {
      driverLookupIds.push(d._id);
      if (d.userId?._id) {
        driverLookupIds.push(d.userId._id);
      } else if (d.userId) {
        driverLookupIds.push(d.userId);
      }
    }

    // Aggregate active pickup/delivery counts directly in MongoDB using index { driverId: 1, pickupStatus: 1 }
    const taskCountsAgg =
      driverLookupIds.length > 0
        ? await PickupDelivery.aggregate([
            {
              $match: {
                driverId: { $in: driverLookupIds },
                pickupStatus: { $in: ACTIVE_PICKUP_STATUSES },
              },
            },
            {
              $group: {
                _id: "$driverId",
                count: { $sum: 1 },
              },
            },
          ])
        : [];

    const activeTaskMap = {};
    for (const item of taskCountsAgg) {
      if (item._id) {
        activeTaskMap[item._id.toString()] = item.count;
      }
    }

    let availableCount = 0;
    let onDutyCount = 0;

    const enrichedDrivers = drivers.map((d) => {
      const directTasks = activeTaskMap[d._id.toString()] || 0;
      const userTasks = d.userId?._id
        ? activeTaskMap[d.userId._id.toString()] || 0
        : 0;
      const activeTaskCount = directTasks + userTasks;
      const isOnDuty = activeTaskCount > 0;

      if (d.isAvailable) availableCount += 1;
      if (isOnDuty) onDutyCount += 1;

      return {
        ...d,
        activeTaskCount,
        isOnDuty,
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedDrivers.length,
      summary: {
        total: enrichedDrivers.length,
        available: availableCount,
        onDuty: onDutyCount,
        unavailable: enrichedDrivers.length - availableCount,
      },
      drivers: enrichedDrivers,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Get only available drivers (isAvailable: true, isDeleted: false)
exports.getAvailableDrivers = async (req, res, next) => {
  try {
    const drivers = await Driver.find({
      isDeleted: false,
      isAvailable: true,
    })
      .populate("userId", "name email isActive")
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: drivers.length,
      drivers,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Create a new driver validated with Zod (createDriverSchema)
exports.createDriver = async (req, res, next) => {
  const parsed = createDriverSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: formatZodError(parsed.error) });
  }

  const {
    name,
    contactNo,
    licenseNo,
    photograph,
    isAvailable,
    email,
    password,
  } = parsed.data;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check duplicate licenseNo or contactNo among active drivers
    const existingDriver = await Driver.findOne({
      isDeleted: false,
      $or: [{ licenseNo }, { contactNo }],
    }).session(session);

    if (existingDriver) {
      await session.abortTransaction();
      const conflictField =
        existingDriver.licenseNo === licenseNo
          ? "driving license number"
          : "contact number";
      return res.status(400).json({
        message: `A driver with this ${conflictField} is already registered.`,
      });
    }

    // Optionally create a linked User record with role 'Driver' if email is provided
    let linkedUserId = null;
    if (email) {
      const existingUser = await User.findOne({
        $or: [{ email }, { contactNo }],
      }).session(session);

      if (existingUser) {
        await session.abortTransaction();
        return res.status(400).json({
          message:
            "Email or contact number is already associated with an existing user account.",
        });
      }

      const [createdUser] = await User.create(
        [
          {
            name,
            email,
            password,
            contactNo,
            role: "Driver",
          },
        ],
        { session },
      );
      linkedUserId = createdUser._id;
    }

    const [driver] = await Driver.create(
      [
        {
          userId: linkedUserId,
          name,
          contactNo,
          licenseNo,
          photograph,
          isAvailable,
        },
      ],
      { session },
    );

    await session.commitTransaction();

    const populatedDriver = await Driver.findById(driver._id)
      .populate("userId", "name email isActive")
      .lean();

    res.status(201).json({
      success: true,
      message: "Driver added successfully.",
      driver: {
        ...populatedDriver,
        activeTaskCount: 0,
        isOnDuty: false,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    if (error.code === 11000) {
      const duplicateKey = Object.keys(error.keyPattern || {})[0];
      const label =
        duplicateKey === "licenseNo"
          ? "driving license number"
          : duplicateKey === "contactNo"
            ? "contact number"
            : "email";
      return res.status(400).json({
        message: `A record with this ${label} already exists.`,
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((v) => v.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    next(error);
  } finally {
    session.endSession();
  }
};

// 3b. Update driver details validated with Zod (updateDriverSchema)
exports.updateDriver = async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid driver ID." });
  }

  const parsed = updateDriverSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: formatZodError(parsed.error) });
  }

  const {
    name,
    contactNo,
    licenseNo,
    photograph,
    isAvailable,
    email,
    password,
  } = parsed.data;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const driver = await Driver.findOne({ _id: id, isDeleted: false }).session(
      session,
    );
    if (!driver) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Driver not found." });
    }

    // Check duplicate licenseNo or contactNo among other active drivers
    const duplicateDriver = await Driver.findOne({
      _id: { $ne: driver._id },
      isDeleted: false,
      $or: [{ licenseNo }, { contactNo }],
    }).session(session);

    if (duplicateDriver) {
      await session.abortTransaction();
      const conflictField =
        duplicateDriver.licenseNo === licenseNo
          ? "driving license number"
          : "contact number";
      return res.status(400).json({
        message: `Another driver with this ${conflictField} is already registered.`,
      });
    }

    // Sync or create linked User record if applicable
    if (driver.userId) {
      const linkedUser = await User.findById(driver.userId).session(session);
      if (linkedUser) {
        if (email && email !== linkedUser.email) {
          const emailTaken = await User.findOne({
            _id: { $ne: linkedUser._id },
            email,
          }).session(session);
          if (emailTaken) {
            await session.abortTransaction();
            return res.status(400).json({
              message: "Email is already associated with another user account.",
            });
          }
          linkedUser.email = email;
        }

        linkedUser.name = name;
        linkedUser.contactNo = contactNo;

        if (password) {
          linkedUser.password = password;
          linkedUser.passwordChangedAt = new Date();
        }

        await linkedUser.save({ session });
      }
    } else if (email) {
      if (!password || password.length < 6) {
        await session.abortTransaction();
        return res.status(400).json({
          message:
            "A password of at least 6 characters is required when creating a driver login account.",
        });
      }

      const existingUser = await User.findOne({
        $or: [{ email }, { contactNo }],
      }).session(session);

      if (existingUser) {
        await session.abortTransaction();
        return res.status(400).json({
          message:
            "Email or contact number is already associated with an existing user account.",
        });
      }

      const [newUser] = await User.create(
        [
          {
            name,
            email,
            password,
            contactNo,
            role: "Driver",
          },
        ],
        { session },
      );
      driver.userId = newUser._id;
    }

    driver.name = name;
    driver.contactNo = contactNo;
    driver.licenseNo = licenseNo;
    driver.photograph = photograph;
    driver.isAvailable = isAvailable;

    await driver.save({ session });
    await session.commitTransaction();

    const lookupIds = [driver._id];
    if (driver.userId) lookupIds.push(driver.userId);

    const activeTaskCount = await PickupDelivery.countDocuments({
      driverId: { $in: lookupIds },
      pickupStatus: { $in: ACTIVE_PICKUP_STATUSES },
    });

    const populatedDriver = await Driver.findById(driver._id)
      .populate("userId", "name email isActive")
      .lean();

    res.status(200).json({
      success: true,
      message: "Driver details updated successfully.",
      driver: {
        ...populatedDriver,
        activeTaskCount,
        isOnDuty: activeTaskCount > 0,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    if (error.code === 11000) {
      return res.status(400).json({
        message:
          "A driver with this license number, contact number, or email already exists.",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((v) => v.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    next(error);
  } finally {
    session.endSession();
  }
};

// 4. Toggle isAvailable boolean validated with Zod (toggleAvailabilitySchema)
exports.toggleDriverAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid driver ID." });
    }

    const parsed = toggleAvailabilitySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: formatZodError(parsed.error) });
    }

    const driver = await Driver.findOne({ _id: id, isDeleted: false });
    if (!driver) {
      return res.status(404).json({ message: "Driver not found." });
    }

    const nextAvailability =
      typeof parsed.data.isAvailable === "boolean"
        ? parsed.data.isAvailable
        : !driver.isAvailable;

    driver.isAvailable = nextAvailability;
    await driver.save();

    // Check ongoing pickup/delivery tasks so we preserve them and return accurate status
    const lookupIds = [driver._id];
    if (driver.userId) lookupIds.push(driver.userId);

    const activeTaskCount = await PickupDelivery.countDocuments({
      driverId: { $in: lookupIds },
      pickupStatus: { $in: ACTIVE_PICKUP_STATUSES },
    });

    const populatedDriver = await Driver.findById(driver._id)
      .populate("userId", "name email isActive")
      .lean();

    res.status(200).json({
      success: true,
      message: `Driver marked as ${nextAvailability ? "Available" : "Unavailable"}.${
        activeTaskCount > 0
          ? ` (${activeTaskCount} ongoing pickup/delivery task remains unaffected.)`
          : ""
      }`,
      driver: {
        ...populatedDriver,
        activeTaskCount,
        isOnDuty: activeTaskCount > 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 5. Soft-delete driver after verifying no incomplete pickup/delivery tasks are assigned
exports.deleteDriver = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid driver ID." });
    }

    const driver = await Driver.findOne({ _id: id, isDeleted: false });
    if (!driver) {
      return res.status(404).json({ message: "Driver not found." });
    }

    const lookupIds = [driver._id];
    if (driver.userId) lookupIds.push(driver.userId);

    const incompleteTasks = await PickupDelivery.countDocuments({
      driverId: { $in: lookupIds },
      pickupStatus: { $in: ACTIVE_PICKUP_STATUSES },
    });

    if (incompleteTasks > 0) {
      return res.status(400).json({
        message: `Cannot remove driver "${driver.name}" while assigned to ${incompleteTasks} incomplete pickup/delivery task(s).`,
      });
    }

    driver.isDeleted = true;
    driver.deletedAt = new Date();
    driver.isAvailable = false;
    await driver.save();

    // Deactivate linked User login if present
    if (driver.userId) {
      await User.findByIdAndUpdate(driver.userId, { isActive: false });
    }

    res.status(200).json({
      success: true,
      message: "Driver removed successfully.",
    });
  } catch (error) {
    next(error);
  }
};

// 6. Get complete task history & audit logs for a specific driver
exports.getDriverTaskLogs = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid driver ID." });
    }

    const driver = await Driver.findById(id).lean();
    if (!driver) {
      return res.status(404).json({ message: "Driver not found." });
    }

    const lookupIds = [driver._id];
    if (driver.userId) lookupIds.push(driver.userId);

    const tasks = await PickupDelivery.find({
      driverId: { $in: lookupIds },
    })
      .populate(
        "appointmentId",
        "vehicleSnapshot serviceDate serviceTime status",
      )
      .populate("customerId", "name contactNo email")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    let activeTasks = 0;
    let completedTasks = 0;
    let totalDistanceKm = 0;

    for (const t of tasks) {
      if (ACTIVE_PICKUP_STATUSES.includes(t.pickupStatus)) {
        activeTasks += 1;
      }
      if (
        t.pickupStatus === "Delivered to Workshop" ||
        t.pickupStatus === "Delivered to Customer"
      ) {
        completedTasks += 1;
      }
      totalDistanceKm += Number(t.distance || 0);
    }

    res.status(200).json({
      success: true,
      driver: {
        _id: driver._id,
        name: driver.name,
        licenseNo: driver.licenseNo,
        contactNo: driver.contactNo,
        isAvailable: driver.isAvailable,
      },
      summary: {
        totalTasks: tasks.length,
        activeTasks,
        completedTasks,
        totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
      },
      tasks,
    });
  } catch (error) {
    next(error);
  }
};

// 7. Assign a driver to an appointment's PickupDelivery task validated with Zod (assignTaskSchema)
exports.assignDriverToTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid driver ID." });
    }

    const parsed = assignTaskSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: formatZodError(parsed.error) });
    }

    const { appointmentId, note } = parsed.data;

    const driver = await Driver.findOne({ _id: id, isDeleted: false }).lean();
    if (!driver) {
      return res.status(404).json({ message: "Driver not found." });
    }

    const logEntry = {
      status: "Driver Assigned",
      note: note || `Assigned to driver ${driver.name} (${driver.licenseNo})`,
      updatedByRole: req.user?.role || "Admin",
      updatedByName: String(req.user?.name || "Admin").slice(0, 100),
      timestamp: new Date(),
    };

    const updatedTask = await PickupDelivery.findOneAndUpdate(
      { appointmentId },
      {
        $set: {
          driverId: driver._id,
          pickupStatus: "Driver Assigned",
          assignedAt: new Date(),
        },
        $push: {
          statusLogs: {
            $each: [logEntry],
            $slice: -100, // Keep latest 100 audit entries to prevent unbounded document growth
          },
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .populate("driverId", "name contactNo licenseNo photograph")
      .lean();

    if (!updatedTask) {
      return res.status(404).json({
        message: "Pickup & delivery record not found for this appointment.",
      });
    }

    res.status(200).json({
      success: true,
      message: `Driver ${driver.name} assigned to pickup task.`,
      pickupDelivery: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

// 8. Update a pickup/delivery task status validated with Zod (updateTaskStatusSchema)
exports.updatePickupTaskStatus = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: "Invalid pickup task ID." });
    }

    const parsed = updateTaskStatusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: formatZodError(parsed.error) });
    }

    const { pickupStatus, note } = parsed.data;

    const logEntry = {
      status: pickupStatus,
      note: note || `Task status updated to "${pickupStatus}".`,
      updatedByRole: req.user?.role || "Admin",
      updatedByName: String(req.user?.name || "Admin").slice(0, 100),
      timestamp: new Date(),
    };

    const updateSet = { pickupStatus };
    if (pickupStatus === "Delivered to Customer") {
      updateSet.completedAt = new Date();
    }

    const populated = await PickupDelivery.findByIdAndUpdate(
      taskId,
      {
        $set: updateSet,
        $push: {
          statusLogs: {
            $each: [logEntry],
            $slice: -100, // Cap array to latest 100 entries
          },
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .populate(
        "appointmentId",
        "vehicleSnapshot serviceDate serviceTime status",
      )
      .populate("customerId", "name contactNo email")
      .populate("driverId", "name contactNo licenseNo photograph isAvailable")
      .lean();

    if (!populated) {
      return res.status(404).json({ message: "Pickup task not found." });
    }

    // When vehicle is Delivered to Workshop, keep Appointment in "Confirmed" (or "In Progress" if Service already started via startService)
    const appId = populated.appointmentId?._id || populated.appointmentId;
    if (pickupStatus === "Delivered to Customer" && appId) {
      await Appointment.findByIdAndUpdate(appId, { status: "Completed" });
    }

    res.status(200).json({
      success: true,
      message:
        pickupStatus === "Delivered to Workshop"
          ? "Vehicle delivered to workshop! Booking moved to In Progress & Service job started."
          : `Task status updated to ${pickupStatus}.`,
      task: populated,
    });
  } catch (error) {
    next(error);
  }
};
