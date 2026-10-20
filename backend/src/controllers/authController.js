const User = require("../models/User");
const jwt = require("jsonwebtoken");

// Helper to issue JWT and set secure HttpOnly cookie
const sendTokenResponse = (user, statusCode, res) => {
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

  res
    .status(statusCode)
    .cookie("token", token, cookieOptions)
    .json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
};

// Register customer
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, contactNo } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered." });
    }

    // Always defaults to Customer role for public registration
    const user = await User.create({
      name,
      email,
      password,
      contactNo,
      role: "Customer",
    });

    sendTokenResponse(user, 201, res);
  } catch (error) {
    next(error);
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
