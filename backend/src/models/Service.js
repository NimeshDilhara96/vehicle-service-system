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
      default: null,
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
        "Waiting for Approval",
        "In Progress",
        "Waiting for Parts",
        "Completed",
      ],
      default: "Inspection",
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
    additionalWorks: {
      type: [
        {
          title: { type: String, required: true, trim: true, maxlength: 120 },
          description: { type: String, trim: true, maxlength: 500, default: "" },
          category: {
            type: String,
            enum: ["Repair", "Spare Part", "Fluid / Oil", "Other"],
            default: "Repair",
          },
          estimatedCost: { type: Number, required: true, min: 0 },
          status: {
            type: String,
            enum: ["Pending Approval", "Approved", "Rejected"],
            default: "Pending Approval",
          },
          addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          addedByName: { type: String, trim: true, default: "" },
          addedAt: { type: Date, default: Date.now },
          respondedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
    statusLogs: {
      type: [
        {
          stage: { type: String, required: true },
          note: { type: String, trim: true, maxlength: 500, default: "" },
          updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          updatedByName: { type: String, trim: true, default: "" },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

module.exports = mongoose.model("Service", serviceSchema);
