const express = require("express");
const router = express.Router();
const {
  upsertCategoryExpense,
  addOtherExpense,
  deleteOtherExpense,
  getExpenseByDate,
  getAllExpenses,
} = require("../controllers/expensesController");

router.get("/", getAllExpenses);
router.get("/:date", getExpenseByDate);

// category = stock | salary | rent
router.post("/:date/others", addOtherExpense);
router.delete("/:date/others/:itemId", deleteOtherExpense);
router.post("/:date/:category", upsertCategoryExpense);

module.exports = router;
