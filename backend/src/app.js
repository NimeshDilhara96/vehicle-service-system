const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/authRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || [
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    credentials: true,
  }),
);

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/appointments", appointmentRoutes);

// Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    message:
      statusCode === 500
        ? "An internal error occurred. Please try again later."
        : err.message,
  });
});

module.exports = app;
