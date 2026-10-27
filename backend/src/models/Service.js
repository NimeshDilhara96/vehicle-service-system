const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
      index: true,
    },
    vehicleSnapshot: {
      registrationNo: { type: String, required: true },
      vehicleType: { type: String, required: true },
      brand: { type: String },
      modelName: { type: String },
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
    mechanicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: [
        "Vehicle Received",
        "Inspection",
        "Service",
        "Additional Work Approval",
        "Service Completed",
        "Ready for Delivery",
      ],
      default: "Vehicle Received",
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Service", serviceSchema);

