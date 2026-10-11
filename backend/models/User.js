"use strict";

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
  type: String,
  required: function () {
    return !this.googleId;
  },
  default: null
},

googleId: {
  type: String,
  default: null,
  unique: true,
  sparse: true
},

authProvider: {
  type: String,
  enum: ["local", "google", "both"],
  default: "local"
},

avatar: {
  type: String,
  default: null
},
  role: {
    type: String,
    enum: ["USER", "ADMIN"],
    default: "USER",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
    default: null,
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;