"use strict";

const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  analyzeDocumentController,
} = require("../controllers/aiController");

const router = express.Router();

// POST /api/ai/analyze — protected AI document analysis
router.post("/analyze", authMiddleware, analyzeDocumentController);

module.exports = router;