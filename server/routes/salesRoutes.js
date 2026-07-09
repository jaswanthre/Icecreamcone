const express = require("express");
const router = express.Router();
const {
  createSale,
  getHistory,
  getSaleByDate,
  deleteSale,
  getDashboardSummary,
  getMonthlySummary,
} = require("../controllers/salesController");

router.get("/summary/dashboard", getDashboardSummary);
router.get("/summary/monthly", getMonthlySummary);

router.post("/", createSale);
router.get("/", getHistory);
router.get("/:date", getSaleByDate);
router.delete("/:id", deleteSale);

module.exports = router;
