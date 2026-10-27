const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Create an index on customerId for faster queries
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
      index: true,
    },
    // Snapshot of vehicle details at the time of booking to prevent issues if vehicle details change later
    vehicleSnapshot: {
      registrationNo: { type: String, required: true },
      vehicleType: { type: String, required: true },
      brand: { type: String, default: "" },
      modelName: { type: String, default: "" },
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServicePackage",
      required: true,
    },
    serviceDate: {
      type: Date,
      required: [true, "Service date is required"],
      index: true,
    },
    serviceTime: {
      type: String,
      required: [true, "Service time slot is required"],
      trim: true,
    },
    requiresPickup: {
      type: Boolean,
      default: false,
    },
    pickupLocation: {
      address: { type: String, trim: true },
      coordinates: { type: [Number] }, // [lat, lng]
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "In Progress", "Completed", "Cancelled"],
      default: "Pending",
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true, // Enable optimistic concurrency control to prevent race conditions during updates
  },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
