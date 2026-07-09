const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true, // one sales entry per day
    },
    opening: {
      type: Number,
      required: true,
      default: 0,
    },
    phonepe: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    cash: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    sale: {
      // phonepe + cash, auto-computed
      type: Number,
      default: 0,
    },
    closing: {
      // opening + sale, auto-computed
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

saleSchema.pre("save", function (next) {
  this.sale = (this.phonepe || 0) + (this.cash || 0);
  this.closing = (this.opening || 0) + this.sale;
  next();
});

// Also recompute on findOneAndUpdate upserts
saleSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  const phonepe = update.phonepe ?? update.$set?.phonepe ?? 0;
  const cash = update.cash ?? update.$set?.cash ?? 0;
  const opening = update.opening ?? update.$set?.opening ?? 0;

  const sale = (phonepe || 0) + (cash || 0);
  const closing = (opening || 0) + sale;

  if (update.$set) {
    update.$set.sale = sale;
    update.$set.closing = closing;
  } else {
    update.sale = sale;
    update.closing = closing;
  }
  next();
});

module.exports = mongoose.model("Sale", saleSchema);
