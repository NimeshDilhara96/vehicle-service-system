require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");
const Vehicle = require("./models/Vehicle");
const Driver = require("./models/Driver");
const Appointment = require("./models/Appointment");
const PickupDelivery = require("./models/PickupDelivery");

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    await Promise.all([
      Vehicle.syncIndexes(),
      Driver.syncIndexes(),
      Appointment.syncIndexes(),
      PickupDelivery.syncIndexes(),
    ]);
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("MongoDB connection failure:", err));
