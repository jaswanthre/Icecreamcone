// Normalizes any date input to midnight UTC so each calendar day
// maps to exactly one Sale / Expense document.
function normalizeDate(input) {
  const d = input ? new Date(input) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

module.exports = normalizeDate;
