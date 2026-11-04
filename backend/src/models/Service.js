const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
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
      index: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
      index: true,
    },
    vehicleSnapshot: {
      registrationNo: { type: String },
      vehicleType: { type: String },
      brand: { type: String },
      modelName: { type: String },
    },
    mechanicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceBay",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "Vehicle Received",
        "Inspection",
        "In Progress",
        "Waiting for Parts",
        "Completed",
      ],
      default: "Vehicle Received",
    },
    inspectionNotes: {
      type: String,
      trim: true,
      maxlength: [2000, "Inspection notes cannot exceed 2000 characters"],
      default: "",
    },
    additionalWorkRequired: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

module.exports = mongoose.model("Service", serviceSchema);
