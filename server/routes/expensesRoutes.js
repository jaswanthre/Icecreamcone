const express = require("express");
const router = express.Router();
const {
  upsertCategoryExpense,
  addOtherExpense,
  deleteOtherExpense,
  deleteExpenseByDate,
  getExpenseByDate,
  getAllExpenses,
} = require("../controllers/expensesController");

router.get("/", getAllExpenses);

// category = stock | salary | rent
router.post("/:date/others", addOtherExpense);
router.delete("/:date/others/:itemId", deleteOtherExpense);
router.delete("/:date", deleteExpenseByDate);
router.get("/:date", getExpenseByDate);
router.post("/:date/:category", upsertCategoryExpense);

module.exports = router;
