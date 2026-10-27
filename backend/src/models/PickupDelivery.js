const mongoose = require("mongoose");

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
      ref: "User",
      default: null,
    },
    pickupLocation: {
      address: { type: String, required: true, trim: true },
      coordinates: { type: [Number], required: true }, // [lat, lng]
    },
    deliveryLocation: {
      address: { type: String, required: true, trim: true },
      coordinates: { type: [Number], required: true }, // [lat, lng]
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
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PickupDelivery", pickupDeliverySchema);

