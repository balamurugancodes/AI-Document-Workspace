"use strict";

const { analyzeDocument } = require("../services/geminiService");

const analyzeDocumentController = async (req, res) => {
  try {
    const {
      action,
      prompt,
      documentText,
      fileName,
      pageCount,
      chatHistory,
    } = req.body || {};

    if (
      typeof documentText !== "string" ||
      !documentText.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Document text is required for analysis.",
      });
    }

    if (documentText.length > 120000) {
      return res.status(413).json({
        success: false,
        message:
          "The extracted document text is too large. Please shorten the document or analyse a smaller section.",
      });
    }

    if (
      typeof prompt !== "string" ||
      !prompt.trim() ||
      prompt.length > 5000
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid prompt is required.",
      });
    }

    const result = await analyzeDocument({
      action,
      prompt,
      documentText,
      fileName,
      pageCount,
      chatHistory,
    });

    return res.status(200).json({
      success: true,
      message: "Document analysis completed successfully.",
      result: result.text,
    });
  } catch (error) {
    console.error("AI document analysis failed:", error.message);

    const statusCode = [400, 413, 429, 503].includes(error.statusCode)
      ? error.statusCode
      : 502;

    const message =
      statusCode === 429
        ? "The AI service rate limit was reached. Please try again later."
        : statusCode === 503
          ? "Gemini AI is not configured on the server."
          : statusCode === 400
            ? error.message
            : statusCode === 413
              ? error.message
              : "Document analysis failed. Please try again later.";

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

module.exports = { analyzeDocumentController };