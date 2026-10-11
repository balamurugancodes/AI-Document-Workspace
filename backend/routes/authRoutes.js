"use strict";

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
try {
const { name, email, password } = req.body;

if (!name || !email || !password) {
  return res.status(400).json({
    success: false,
    message: "Name, email, and password are required.",
  });
}

const normalizedEmail = email.trim().toLowerCase();

const existingUser = await User.findOne({
  email: normalizedEmail,
});

if (existingUser) {
  return res.status(409).json({
    success: false,
    message: "An account with this email already exists.",
  });
}

const hashedPassword = await bcrypt.hash(password, 10);

const user = new User({
  name: name.trim(),
  email: normalizedEmail,
  password: hashedPassword,
  authProvider: "local",
});

await user.save();

return res.status(201).json({
  success: true,
  message: "Account created successfully.",
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  },
});

} catch (error) {
console.error("Signup error:", error.message);

return res.status(500).json({
  success: false,
  message: "An unexpected error occurred. Please try again.",
});

}
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
try {
const { email, password } = req.body;

if (!email || !password) {
  return res.status(400).json({
    success: false,
    message: "Email and password are required.",
  });
}

const normalizedEmail = email.trim().toLowerCase();

const user = await User.findOne({
  email: normalizedEmail,
});

if (!user) {
  return res.status(401).json({
    success: false,
    message: "Invalid email or password.",
  });
}

// Google-only accounts cannot use password login unless a password is set.
if (!user.password) {
  return res.status(401).json({
    success: false,
    message: "Please sign in using Continue with Google.",
  });
}

const isMatch = await bcrypt.compare(password, user.password);

if (!isMatch) {
  return res.status(401).json({
    success: false,
    message: "Invalid email or password.",
  });
}

user.lastLogin = new Date();
await user.save();

const token = jwt.sign(
  { id: user._id.toString(), role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: "1d" }
);

return res.status(200).json({
  success: true,
  message: "Login successful.",
  token,
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  },
});

} catch (error) {
console.error("Login error:", error.message);

return res.status(500).json({
  success: false,
  message: "An unexpected error occurred. Please try again.",
});

}
});

// POST /api/auth/google
// Expects a Google Identity Services ID credential in req.body.credential.
router.post("/google", async (req, res) => {
try {
const { credential } = req.body;

if (!credential) {
  return res.status(400).json({
    success: false,
    message: "Google credential is required.",
  });
}

if (!process.env.GOOGLE_CLIENT_ID || !process.env.JWT_SECRET) {
  return res.status(500).json({
    success: false,
    message: "Google authentication is not configured on the server.",
  });
}

// Verify signature, expiry, issuer, and audience with Google's library.
const ticket = await googleClient.verifyIdToken({
  idToken: credential,
  audience: process.env.GOOGLE_CLIENT_ID,
});

const payload = ticket.getPayload();

if (
  !payload ||
  !payload.sub ||
  !payload.email ||
  payload.email_verified !== true
) {
  return res.status(401).json({
    success: false,
    message: "Google account email could not be verified.",
  });
}

const googleId = payload.sub;
const normalizedEmail = payload.email.trim().toLowerCase();

let user = await User.findOne({ googleId });

if (!user) {
  user = await User.findOne({ email: normalizedEmail });

  if (user) {
    // Link the verified Google account to the existing account.
    // Preserve the existing password and MongoDB user ID.
    if (user.googleId && user.googleId !== googleId) {
      return res.status(409).json({
        success: false,
        message: "This email is already linked to another Google account.",
      });
    }

    user.googleId = googleId;
    user.authProvider = user.password ? "both" : "google";
  } else {
    user = new User({
      name: payload.name || normalizedEmail.split("@")[0],
      email: normalizedEmail,
      password: null,
      googleId,
      authProvider: "google",
      avatar: payload.picture || null,
    });
  }
}

// Refresh optional profile information and login timestamp.
if (payload.name && !user.name) {
  user.name = payload.name;
}

if (payload.picture) {
  user.avatar = payload.picture;
}

user.lastLogin = new Date();

await user.save();

const token = jwt.sign(
  { id: user._id.toString(), role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: "1d" }
);

return res.status(200).json({
  success: true,
  message: "Google login successful.",
  token,
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  },
});

} catch (error) {
console.error("Google authentication error:", error.message);

return res.status(401).json({
  success: false,
  message: "Google authentication failed. Please try again.",
});

}
});

// GET /api/auth/me (protected)
router.get("/me", authMiddleware, (req, res) => {
return res.status(200).json({
success: true,
user: req.user,
});
});

module.exports = router;