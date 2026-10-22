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
      unique: true,
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
  },
  { timestamps: true },
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
