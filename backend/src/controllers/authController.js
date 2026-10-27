const mongoose = require("mongoose");
const User = require("../models/User");
const Vehicle = require("../models/Vehicle");
const jwt = require("jsonwebtoken");

// Helper to issue JWT and set secure HttpOnly cookie
const sendTokenResponse = (user, statusCode, res, vehicle = null) => {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );

  // Checklist rule: HttpOnly, Secure, SameSite cookie configuration
  const cookieOptions = {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  const responsePayload = {
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };

  if (vehicle) {
    responsePayload.vehicle = vehicle;
  }

  res
    .status(statusCode)
    .cookie("token", token, cookieOptions)
    .json(responsePayload);
};

// Validation regex for Sri Lankan mobile numbers (e.g., 0771234567 or +94771234567)
const MOBILE_REGEX = /^(?:0|\+94)7\d{8}$/;

// Validation regex for Sri Lankan vehicle registration numbers (e.g., CAB-1234, AB-1234, WP CAB-1234, 65-1234)
const VEHICLE_REG_REGEX =
  /^(?:[A-Z]{2}[\s-]?)?(?:[A-Z]{2,3}|\d{1,3})[\s-]?\d{4}$/;

// Pre-check email and mobile number availability before moving to Step 2 of registration
exports.checkAvailability = async (req, res, next) => {
  try {
    const { email, contactNo } = req.body;

    const normalizedEmail = email ? email.trim().toLowerCase() : "";
    const normalizedContactNo = contactNo ? contactNo.trim() : "";

    if (!MOBILE_REGEX.test(normalizedContactNo)) {
      return res.status(400).json({
        message:
          "Invalid mobile number format. Use 07XXXXXXXX or +947XXXXXXXX.",
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered." });
    }

    const existingContact = await User.findOne({
      contactNo: normalizedContactNo,
    });
    if (existingContact) {
      return res
        .status(400)
        .json({ message: "Contact number is already registered." });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Register customer and their first vehicle in a single atomic DB transaction
exports.register = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name,
      email,
      password,
      contactNo,
      registrationNo,
      vehicleType,
      brand,
      modelName,
    } = req.body;

    const normalizedContactNo = contactNo ? contactNo.trim() : "";
    if (!MOBILE_REGEX.test(normalizedContactNo)) {
      await session.abortTransaction();
      return res.status(400).json({
        message:
          "Invalid mobile number format. Use 07XXXXXXXX or +947XXXXXXXX.",
      });
    }

    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Email is already registered." });
    }

    const existingContact = await User.findOne({
      contactNo: normalizedContactNo,
    }).session(session);
    if (existingContact) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ message: "Contact number is already registered." });
    }

    if (!registrationNo || !registrationNo.trim()) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ message: "Vehicle registration number is required." });
    }

    const normalizedRegNo = registrationNo.trim().toUpperCase();
    if (!VEHICLE_REG_REGEX.test(normalizedRegNo)) {
      await session.abortTransaction();
      return res.status(400).json({
        message:
          "Invalid vehicle registration number format (e.g., CAB-1234, AB-1234, 65-1234).",
      });
    }

    // Always defaults to Customer role for public registration
    const [user] = await User.create(
      [
        {
          name,
          email,
          password,
          contactNo: normalizedContactNo,
          role: "Customer",
        },
      ],
      { session },
    );

    const existingVehicle = await Vehicle.findOne({
      registrationNo: normalizedRegNo,
      isDeleted: false,
    }).session(session);
    if (existingVehicle) {
      // Roll back the newly created User if the vehicle is already registered
      await session.abortTransaction();
      return res.status(400).json({
        message: "A vehicle with this registration number already exists.",
      });
    }

    const [vehicle] = await Vehicle.create(
      [
        {
          customerId: user._id,
          registrationNo: normalizedRegNo,
          vehicleType: vehicleType || "Car",
          brand,
          modelName,
        },
      ],
      { session },
    );

    await session.commitTransaction();

    sendTokenResponse(user, 201, res, vehicle);
  } catch (error) {
    await session.abortTransaction();

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      const message =
        duplicateField === "registrationNo"
          ? "A vehicle with this registration number already exists."
          : duplicateField === "contactNo"
            ? "Contact number is already registered."
            : "Email is already registered.";
      return res.status(400).json({ message });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    next(error);
  } finally {
    session.endSession();
  }
};

// Login user with brute-force protection
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide both email and password." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Checklist rule: Prevent brute force via lockout
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(429).json({
        message:
          "Account locked due to consecutive failed attempts. Please try again later.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      // Lock account for 15 minutes after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Reset failed login attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// Invalidate session on logout
exports.logout = (req, res) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ success: true, message: "Logged out successfully." });
};

// Checklist rule: Backend single source of truth for user profile
exports.getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
};
