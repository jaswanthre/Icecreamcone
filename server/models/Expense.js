const mongoose = require("mongoose");

const amountPairSchema = new mongoose.Schema(
  {
    phonepe: { type: Number, default: 0, min: 0 },
    cash: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const otherExpenseSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true }, // reason / description
    phonepe: { type: Number, default: 0, min: 0 },
    cash: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const expenseSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true, // one expense document per day, holds all categories
    },
    stock: { type: amountPairSchema, default: () => ({}) },
    salary: { type: amountPairSchema, default: () => ({}) },
    rent: { type: amountPairSchema, default: () => ({}) },
    others: { type: [otherExpenseSchema], default: [] },
  },
  { timestamps: true }
);

// Virtual: total phonepe / cash / grand total paid out that day
expenseSchema.virtual("totalPhonepe").get(function () {
  const othersTotal = (this.others || []).reduce((s, o) => s + (o.phonepe || 0), 0);
  return (this.stock?.phonepe || 0) + (this.salary?.phonepe || 0) + (this.rent?.phonepe || 0) + othersTotal;
});

expenseSchema.virtual("totalCash").get(function () {
  const othersTotal = (this.others || []).reduce((s, o) => s + (o.cash || 0), 0);
  return (this.stock?.cash || 0) + (this.salary?.cash || 0) + (this.rent?.cash || 0) + othersTotal;
});

expenseSchema.virtual("total").get(function () {
  return this.totalPhonepe + this.totalCash;
});

expenseSchema.set("toJSON", { virtuals: true });
expenseSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Expense", expenseSchema);
