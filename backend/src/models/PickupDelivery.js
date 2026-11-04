const mongoose = require("mongoose");

const taskLogEntrySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: [250, "Log note cannot exceed 250 characters"],
    },
    updatedByRole: {
      type: String,
      enum: ["Admin", "Driver", "Customer", "System"],
      default: "System",
    },
    updatedByName: {
      type: String,
      default: "System",
      trim: true,
      maxlength: [100, "Updater name cannot exceed 100 characters"],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const pickupDeliverySchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
      index: true,
    },
    pickupLocation: {
      address: { type: String, required: true, trim: true },
      coordinates: { type: [Number], required: true }, // [lat, lng]
    },
    deliveryLocation: {
      address: { type: String, required: true, trim: true },
      coordinates: { type: [Number], required: true }, // [lat, lng]
    },
    driverLiveLocation: {
      coordinates: { type: [Number], default: null }, // [lat, lng]
      updatedAt: { type: Date, default: null },
    },
    distance: {
      type: Number,
      default: 0,
      min: 0,
    },
    charge: {
      type: Number,
      required: true,
      min: 0,
    },
    pickupStatus: {
      type: String,
      enum: [
        "Pending Assignment",
        "Driver Assigned",
        "En Route to Pickup",
        "Vehicle Picked Up",
        "Delivered to Workshop",
        "Out for Return Delivery",
        "Delivered to Customer",
        "Cancelled",
      ],
      default: "Pending Assignment",
      index: true,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    statusLogs: {
      type: [taskLogEntrySchema],
      default: () => [
        {
          status: "Pending Assignment",
          note: "Pickup & delivery request created with booking.",
          updatedByRole: "Customer",
          updatedByName: "Customer Booking",
          timestamp: new Date(),
        },
      ],
    },
  },
  { timestamps: true },
);

// Compound indexes for O(log N) driver active-task aggregation & task history queries
pickupDeliverySchema.index({ driverId: 1, pickupStatus: 1 });
pickupDeliverySchema.index({ driverId: 1, updatedAt: -1 });

module.exports = mongoose.model("PickupDelivery", pickupDeliverySchema);
