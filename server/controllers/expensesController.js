const Expense = require("../models/Expense");
const normalizeDate = require("../utils/normalizeDate");

const VALID_CATEGORIES = ["stock", "salary", "rent"];

async function getOrCreateExpenseDoc(day) {
  let doc = await Expense.findOne({ date: day });
  if (!doc) {
    doc = await Expense.create({ date: day });
  }
  return doc;
}

// @desc  Add/update Stock / Salary / Rent expense for a date
// @route POST /api/expenses/:date/:category  (category: stock|salary|rent)
// @body  { phonepe, cash }
exports.upsertCategoryExpense = async (req, res) => {
  try {
    const { date, category } = req.params;
    const { phonepe = 0, cash = 0 } = req.body;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Invalid category. Use one of: ${VALID_CATEGORIES.join(", ")}` });
    }

    const day = normalizeDate(date);
    const doc = await Expense.findOneAndUpdate(
      { date: day },
      {
        $set: {
          date: day,
          [`${category}.phonepe`]: Number(phonepe) || 0,
          [`${category}.cash`]: Number(cash) || 0,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Add an "Others" expense line item for a date (reason/description + amounts)
// @route POST /api/expenses/:date/others
// @body  { type, phonepe, cash }
exports.addOtherExpense = async (req, res) => {
  try {
    const { date } = req.params;
    const { type, phonepe = 0, cash = 0 } = req.body;

    if (!type || !type.trim()) {
      return res.status(400).json({ message: "A reason/description is required for other expenses." });
    }

    const day = normalizeDate(date);
    const doc = await getOrCreateExpenseDoc(day);

    doc.others.push({ type: type.trim(), phonepe: Number(phonepe) || 0, cash: Number(cash) || 0 });
    await doc.save();

    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Remove a single "Others" line item
// @route DELETE /api/expenses/:date/others/:itemId
exports.deleteOtherExpense = async (req, res) => {
  try {
    const { date, itemId } = req.params;
    const day = normalizeDate(date);
    const doc = await Expense.findOne({ date: day });
    if (!doc) return res.status(404).json({ message: "No expense entry for this date." });

    doc.others = doc.others.filter((o) => o._id.toString() !== itemId);
    await doc.save();

    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get expenses for a single date
// @route GET /api/expenses/:date
exports.getExpenseByDate = async (req, res) => {
  try {
    const day = normalizeDate(req.params.date);
    const doc = await Expense.findOne({ date: day });
    if (!doc) return res.status(404).json({ message: "No expense entry for this date." });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get all expense entries, most recent first
// @route GET /api/expenses?limit=30
exports.getAllExpenses = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const docs = await Expense.find().sort({ date: -1 }).limit(limit);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
