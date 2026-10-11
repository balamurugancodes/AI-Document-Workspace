"use strict";

const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AI Document Workspace API is working",
  });
});

module.exports = router;