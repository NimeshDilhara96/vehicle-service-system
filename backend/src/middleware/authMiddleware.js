const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect routes middleware
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Checklist rule: Tokens read strictly from HttpOnly cookies, never localStorage
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res
        .status(401)
        .json({ message: "Unauthorized access. Please log in." });
    }

    // Verify token signature
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Checklist rule: Verify user exists and account is active
    const currentUser = await User.findById(decoded.id);
    if (!currentUser || !currentUser.isActive) {
      return res
        .status(401)
        .json({ message: "User account is inactive or not found." });
    }

    // Checklist rule: Invalidate tokens issued before a password change
    if (currentUser.passwordChangedAt) {
      const changedTimestamp = parseInt(
        currentUser.passwordChangedAt.getTime() / 1000,
        10,
      );
      if (decoded.iat < changedTimestamp) {
        return res
          .status(401)
          .json({ message: "Password recently changed. Please log in again." });
      }
    }

    // Assign verified user to request object
    req.user = currentUser;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired session." });
  }
};

// Role-based authorization middleware
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // Checklist rule: Derive role strictly from server-side authenticated state
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action.",
      });
    }
    next();
  };
};
