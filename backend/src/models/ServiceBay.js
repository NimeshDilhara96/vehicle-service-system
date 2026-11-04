const mongoose = require("mongoose");

const serviceBaySchema = new mongoose.Schema(
  {
    bayName: {
      type: String,
      required: [true, "Service bay name is required"],
      unique: true,
      trim: true,
      minlength: [2, "Service bay name must be at least 2 characters"],
      maxlength: [60, "Service bay name cannot exceed 60 characters"],
    },
    bayType: {
      type: String,
      enum: ["Mechanical", "Electrical", "Washing", "Inspection", "General"],
      default: "General",
      required: [true, "Service bay type is required"],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    currentServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

serviceBaySchema.index({ isAvailable: 1, bayType: 1 });

module.exports = mongoose.model("ServiceBay", serviceBaySchema);
