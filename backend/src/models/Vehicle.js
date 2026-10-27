const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Indexed for data isolation and fast queries[cite: 52]
    },
    registrationNo: {
      type: String,
      required: [true, "Vehicle registration number is required"],
      uppercase: true,
      trim: true,
    },
    vehicleType: {
      type: String,
      required: [true, "Vehicle type is required"],
      enum: ["Car", "Van", "SUV", "Jeep", "Crew Cab", "Other"],
      default: "Car",
    },
    brand: {
      type: String,
      trim: true,
    },
    modelName: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Partial Unique Index: enforce uniqueness only on active (non-deleted) vehicles
vehicleSchema.index(
  { registrationNo: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
