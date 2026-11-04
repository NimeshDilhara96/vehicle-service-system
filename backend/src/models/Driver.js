const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Driver full name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    contactNo: {
      type: String,
      required: [true, "Driver contact number is required"],
      trim: true,
    },
    licenseNo: {
      type: String,
      required: [true, "Driving license number is required"],
      trim: true,
      uppercase: true,
    },
    photograph: {
      type: String,
      default: "",
      trim: true,
      maxlength: [2048, "Photograph URL cannot exceed 2048 characters"],
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
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
  {
    timestamps: true,
  },
);

// Partial unique indexes so soft-deleted drivers do not block future re-registration
driverSchema.index(
  { licenseNo: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

driverSchema.index(
  { contactNo: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

// Compound index for fast Admin list & availability filtering
driverSchema.index({ isDeleted: 1, isAvailable: 1, createdAt: -1 });

module.exports = mongoose.model("Driver", driverSchema);
