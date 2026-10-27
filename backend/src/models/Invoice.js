// backend/src/models/Invoice.js
const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true, // Each appointment can have only one invoice
      index: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null, // after service is completed, this will be set to the service ID
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    vehicleSnapshot: {
      registrationNo: { type: String, required: true },
      vehicleType: { type: String, required: true },
      brand: { type: String },
      modelName: { type: String },
    },
    packageCharge: {
      type: Number,
      required: true,
      min: 0,
    },
    pickupDeliveryCharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    additionalWorkCharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    invoiceStage: {
      type: String,
      enum: ["Initial Estimate", "Finalized"],
      default: "Initial Estimate",
    },
    paymentStatus: {
      type: String,
      enum: ["Unpaid", "Paid on Delivery"],
      default: "Unpaid",
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

module.exports = mongoose.model("Invoice", invoiceSchema);
