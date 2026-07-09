import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addExpense,
  computeMonthly,
  computeRows,
  deleteEntry,
  downloadExcel,
  getEntries,
  isLoggedIn,
  login,
  logout,
  todayISO,
  upsertEntry,
  type DayEntry,
  type ExpenseCategory,
} from "@/lib/scoops-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nostic Daybook — Ice Cream Shop Sales Tracker" },
      {
        name: "description",
        content:
          "A cute daily sales tracker for your ice cream shop. Log PhonePe & cash, expenses, and export to Excel.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthed(isLoggedIn());
    setReady(true);
  }, []);

  if (!ready) return null;
  return (
    <div className="min-h-screen bg-[#fff5f0] text-[#3a1f2b]">
      {authed ? (
        <Dashboard onLogout={() => setAuthed(false)} />
      ) : (
        <LoginScreen onLogin={() => setAuthed(true)} />
      )}
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl border-4 border-[#ffd4c4]">
        <div className="text-center mb-6">
          <div className="text-6xl mb-2">🍦</div>
          <h1 className="text-2xl font-bold text-[#e85a71]">Nostic Daybook</h1>
          <p className="text-sm text-[#8a6b75] mt-1">Sign in to log today's sales</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (login(u, p)) onLogin();
            else setErr("Wrong username or password");
          }}
          className="space-y-3"
        >
          <input
            className="w-full rounded-full border-2 border-[#ffd4c4] bg-[#fff9f6] px-4 py-3 outline-none focus:border-[#e85a71]"
            placeholder="Username"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            className="w-full rounded-full border-2 border-[#ffd4c4] bg-[#fff9f6] px-4 py-3 outline-none focus:border-[#e85a71]"
            placeholder="Password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
          />
          {err && <p className="text-sm text-red-500 text-center">{err}</p>}
          <button
            type="submit"
            className="w-full rounded-full bg-[#e85a71] py-3 font-semibold text-white shadow hover:bg-[#d94860] transition"
          >
            Log in 🍨
          </button>
          <p className="text-xs text-center text-[#8a6b75] pt-2">
            Default: <b>admin</b> / <b>icecream</b>
          </p>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [date, setDate] = useState(todayISO());
  const [phonepe, setPhonepe] = useState("");
  const [cash, setCash] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const parseAmount = (value: string) => {
    if (value.trim() === "") return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const refresh = async () => {
    setEntries(await getEntries());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const rows = useMemo(() => computeRows(entries), [entries]);
  const monthly = useMemo(() => computeMonthly(entries), [entries]);
  const yesterdayClosing = useMemo(() => {
    const prior = rows.filter((r) => r.date < date);
    return prior.length ? prior[prior.length - 1].closing : 0;
  }, [rows, date]);

  const existing = entries.find((e) => e.date === date);
  useEffect(() => {
    if (existing) {
      setPhonepe(String(existing.phonepe));
      setCash(String(existing.cash));
    } else {
      setPhonepe("");
      setCash("");
    }
  }, [date, existing]);

  const pp = parseAmount(phonepe);
  const cs = parseAmount(cash);
  const todaySale = (Number.isNaN(pp) ? 0 : pp) + (Number.isNaN(cs) ? 0 : cs);

  const runAction = async (task: () => Promise<void>) => {
    setBusy(true);
    setStatus("");
    try {
      await task();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    void runAction(async () => {
      if (Number.isNaN(pp) || Number.isNaN(cs)) {
        throw new Error("Please enter valid numeric values for PhonePe and Cash.");
      }
      if (pp < 0 || cs < 0) {
        throw new Error("Amounts cannot be negative.");
      }

      await upsertEntry({
        date,
        opening: yesterdayClosing,
        phonepe: pp,
        cash: cs,
        expenses: existing?.expenses ?? [],
      });
      await refresh();
      setStatus("Saved to the shared daybook.");
    });
  };

  const addExpenseAndRefresh = (
    category: ExpenseCategory,
    ppAmt: number | undefined,
    csAmt: number | undefined,
    description?: string,
  ) => {
    void runAction(async () => {
      if (Number.isNaN(ppAmt ?? 0) || Number.isNaN(csAmt ?? 0)) {
        throw new Error("Please enter valid numeric values for expense amounts.");
      }
      if ((ppAmt ?? 0) < 0 || (csAmt ?? 0) < 0) {
        throw new Error("Expense amounts cannot be negative.");
      }
      if ((ppAmt ?? 0) + (csAmt ?? 0) <= 0) {
        throw new Error("Enter at least one expense amount greater than zero.");
      }

      if (!existing) {
        await upsertEntry({
          date,
          opening: yesterdayClosing,
          phonepe: pp,
          cash: cs,
          expenses: [],
        });
      }
      await addExpense(date, { category, phonepe: ppAmt, cash: csAmt, description });
      await refresh();
      setStatus("Expense recorded.");
    });
  };

  const totals = rows[rows.length - 1];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🍦</span>
          <div>
            <h1 className="text-2xl font-bold text-[#e85a71]">Nostic Daybook</h1>
            <p className="text-xs text-[#8a6b75]">Sweet numbers, every day</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => downloadExcel(entries)}
            className="rounded-full bg-[#7dd3a0] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#5cbf87] transition"
          >
            ⬇ Download Excel
          </button>
          <button
            onClick={() => {
              logout();
              onLogout();
            }}
            className="rounded-full bg-white border-2 border-[#ffd4c4] px-4 py-2 text-sm font-semibold text-[#e85a71] hover:bg-[#fff0ea] transition"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Totals cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Opening Balance" value={yesterdayClosing} emoji="🌅" color="#ffc9c9" />
        <Stat label="Total Online" value={totals?.onlineTotal ?? 0} emoji="📱" color="#a5d8ff" />
        <Stat label="Total Cash" value={totals?.cashTotal ?? 0} emoji="💵" color="#ffe066" />
        <Stat label="Closing Balance" value={totals?.closing ?? 0} emoji="🏦" color="#b2f2bb" />
        <Stat label="Days Logged" value={entries.length} emoji="📅" color="#ffd4c4" plain />
      </div>

      {/* Entry form */}
      <section className="rounded-3xl bg-white border-4 border-[#ffd4c4] p-6 shadow-lg mb-6">
        <h2 className="text-lg font-bold text-[#e85a71] mb-4">
          {existing ? "Edit day 🖊️" : "Log today's sales 🍨"}
        </h2>
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border-2 border-[#ffd4c4] bg-[#fff9f6] px-3 py-2 outline-none focus:border-[#e85a71]"
            />
          </Field>
          <Field label="Opening (yesterday closing)">
            <input
              readOnly
              value={`₹ ${yesterdayClosing}`}
              className="w-full rounded-xl border-2 border-[#ffd4c4] bg-[#fff0ea] px-3 py-2 text-[#8a6b75]"
            />
          </Field>
          <Field label="Today PhonePe">
            <input
              inputMode="decimal"
              value={phonepe}
              onChange={(e) => setPhonepe(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border-2 border-[#ffd4c4] bg-[#fff9f6] px-3 py-2 outline-none focus:border-[#e85a71]"
            />
          </Field>
          <Field label="Today Cash">
            <input
              inputMode="decimal"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border-2 border-[#ffd4c4] bg-[#fff9f6] px-3 py-2 outline-none focus:border-[#e85a71]"
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[#8a6b75]">
            Total today sale:{" "}
            <span className="text-lg font-bold text-[#e85a71]">₹ {todaySale}</span>
          </div>
          <button
            onClick={save}
            className="rounded-full bg-[#e85a71] px-6 py-2 font-semibold text-white shadow hover:bg-[#d94860] transition"
          >
            {existing ? "Update" : "Save"} 🍧
          </button>
        </div>
      </section>

      {/* Expenses */}
      <ExpensesSection
        date={date}
        expenses={existing?.expenses ?? []}
        onAdd={addExpenseAndRefresh}
      />

      {/* Daily History */}
      <section className="rounded-3xl bg-white border-4 border-[#ffd4c4] p-6 shadow-lg mt-6">
        <h2 className="text-lg font-bold text-[#e85a71] mb-2">
          History 📚{" "}
          <span className="text-xs font-normal text-[#8a6b75]">
            (last 10 days — full data in Excel)
          </span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-center text-[#8a6b75] py-8">
            No entries yet — add today's sales above 🍨
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#8a6b75] border-b-2 border-[#ffd4c4]">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Opening</th>
                  <th className="py-2 pr-3">PhonePe</th>
                  <th className="py-2 pr-3">Cash</th>
                  <th className="py-2 pr-3">Sale</th>
                  <th className="py-2 pr-3">Stock</th>
                  <th className="py-2 pr-3">Salary</th>
                  <th className="py-2 pr-3">Rent</th>
                  <th className="py-2 pr-3">Others</th>
                  <th className="py-2 pr-3">Closing</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .slice(-10)
                  .reverse()
                  .map((r) => (
                    <tr key={r.date} className="border-b border-[#fff0ea] hover:bg-[#fff9f6]">
                      <td className="py-2 pr-3 font-medium">{r.date}</td>
                      <td className="py-2 pr-3">₹{r.opening}</td>
                      <td className="py-2 pr-3">₹{r.phonepe}</td>
                      <td className="py-2 pr-3">₹{r.cash}</td>
                      <td className="py-2 pr-3 font-semibold text-[#e85a71]">₹{r.todaySale}</td>
                      <td className="py-2 pr-3 text-orange-600">
                        {r.stock.pp + r.stock.cs ? `−₹${r.stock.pp + r.stock.cs}` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-orange-600">
                        {r.salary.pp + r.salary.cs ? `−₹${r.salary.pp + r.salary.cs}` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-orange-600">
                        {r.rent.pp + r.rent.cs ? `−₹${r.rent.pp + r.rent.cs}` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-orange-600">
                        {r.others.pp + r.others.cs ? `−₹${r.others.pp + r.others.cs}` : "—"}
                      </td>
                      <td className="py-2 pr-3 font-semibold">₹{r.closing}</td>
                      <td className="py-2">
                        <button
                          onClick={() => {
                            if (confirm(`Delete entry for ${r.date}?`)) {
                              void runAction(async () => {
                                await deleteEntry(r.date);
                                await refresh();
                                setStatus("Entry removed.");
                              });
                            }
                          }}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Monthly History */}
      <section className="rounded-3xl bg-white border-4 border-[#c3e6ff] p-6 shadow-lg mt-6">
        <h2 className="text-lg font-bold text-[#3b82c4] mb-2">
          Monthly Sale 📆{" "}
          <span className="text-xs font-normal text-[#8a6b75]">
            (last 5 months — full data in Excel)
          </span>
        </h2>
        {monthly.length === 0 ? (
          <p className="text-center text-[#8a6b75] py-8">
            No monthly data yet — log a few days first 🍦
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#8a6b75] border-b-2 border-[#c3e6ff]">
                  <th className="py-2 pr-3">Month</th>
                  <th className="py-2 pr-3">PhonePe</th>
                  <th className="py-2 pr-3">Cash</th>
                  <th className="py-2 pr-3">Total Sale</th>
                  <th className="py-2 pr-3">Expenses</th>
                  <th className="py-2 pr-3">Net</th>
                </tr>
              </thead>
              <tbody>
                {[...monthly]
                  .slice(-5)
                  .reverse()
                  .map((m) => (
                    <tr key={m.month} className="border-b border-[#eaf5ff] hover:bg-[#f7fbff]">
                      <td className="py-2 pr-3 font-medium">{formatMonth(m.month)}</td>
                      <td className="py-2 pr-3">₹{m.phonepe.toLocaleString()}</td>
                      <td className="py-2 pr-3">₹{m.cash.toLocaleString()}</td>
                      <td className="py-2 pr-3 font-semibold text-[#e85a71]">
                        ₹{m.sale.toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-orange-600">
                        −₹{m.expense.toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 font-bold text-[#2f9e6a]">
                        ₹{m.net.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {status ? <p className="mt-4 text-center text-sm text-[#e85a71]">{status}</p> : null}
      <p className="text-center text-xs text-[#8a6b75] mt-6">
        Data is synced with the shared daybook server. Download Excel to back up 💾
      </p>
    </div>
  );
}

function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[#8a6b75] uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Stat({
  label,
  value,
  emoji,
  color,
  plain,
}: {
  label: string;
  value: number;
  emoji: string;
  color: string;
  plain?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4 shadow border-2"
      style={{ backgroundColor: color + "55", borderColor: color }}
    >
      <div className="text-2xl">{emoji}</div>
      <div className="text-xs font-semibold text-[#8a6b75] mt-1">{label}</div>
      <div className="text-xl font-bold text-[#3a1f2b] mt-0.5">
        {plain ? value : `₹ ${value.toLocaleString()}`}
      </div>
    </div>
  );
}

function ExpensesSection({
  date,
  expenses,
  onAdd,
}: {
  date: string;
  expenses: { category: ExpenseCategory; description?: string; phonepe: number; cash: number }[];
  onAdd: (category: ExpenseCategory, pp: number, cs: number, description?: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const catTotal = (c: ExpenseCategory) => {
    const list = expenses.filter((e) => e.category === c);
    return {
      pp: list.reduce((s, i) => s + (Number(i.phonepe) || 0), 0),
      cs: list.reduce((s, i) => s + (Number(i.cash) || 0), 0),
    };
  };

  return (
    <section className="rounded-3xl bg-white border-4 border-[#ffe0b3] p-4 shadow-lg mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-lg font-bold text-[#e6902b] flex items-center gap-2">
          💸 Expenses
          <span className="text-xs font-normal text-[#8a6b75]">
            (paid on {date})
          </span>
        </span>
        <span className="text-[#e6902b] text-xl">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <ExpenseDropdown
            title="📦 Stock Expenses"
            already={catTotal("stock")}
            onSubmit={(pp, cs) => onAdd("stock", pp, cs)}
          />
          <ExpenseDropdown
            title="👥 Salary"
            already={catTotal("salary")}
            onSubmit={(pp, cs) => onAdd("salary", pp, cs)}
          />
          <ExpenseDropdown
            title="🏠 Rent"
            already={catTotal("rent")}
            onSubmit={(pp, cs) => onAdd("rent", pp, cs)}
          />
          <ExpenseDropdown
            title="✨ Others"
            already={catTotal("others")}
            requireDescription
            onSubmit={(pp, cs, desc) => onAdd("others", pp, cs, desc)}
          />
        </div>
      )}
    </section>
  );
}

function ExpenseDropdown({
  title,
  already,
  requireDescription,
  onSubmit,
}: {
  title: string;
  already: { pp: number; cs: number };
  requireDescription?: boolean;
  onSubmit: (pp: number | undefined, cs: number | undefined, description?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [pp, setPp] = useState("");
  const [cs, setCs] = useState("");

  const p = pp.trim() === "" ? undefined : Number(pp);
  const c = cs.trim() === "" ? undefined : Number(cs);
  const pValid = p === undefined || (!Number.isNaN(p) && p >= 0);
  const cValid = c === undefined || (!Number.isNaN(c) && c >= 0);
  const total = (p ?? 0) + (c ?? 0);
  const canSubmit = total > 0 && pValid && cValid && (!requireDescription || desc.trim().length > 0);
  const errorMessage =
    !pValid || !cValid
      ? "Enter valid non-negative amounts."
      : total <= 0
      ? "Enter at least one expense amount."
      : requireDescription && !desc.trim()
      ? "Description is required for this expense."
      : "";

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(p, c, requireDescription ? desc.trim() : undefined);
    setPp("");
    setCs("");
    setDesc("");
  };

  return (
    <div className="rounded-2xl border-2 border-[#ffe0b3] bg-[#fffaf2]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold text-[#e6902b]">{title}</span>
        <span className="flex items-center gap-3 text-xs text-[#8a6b75]">
          {already.pp + already.cs > 0 && (
            <span>logged: −₹{already.pp + already.cs}</span>
          )}
          <span className="text-[#e6902b] text-lg">{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {requireDescription && (
            <Field label="Reason / Description">
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g. Electricity bill"
                className="w-full rounded-xl border-2 border-[#ffe0b3] bg-white px-3 py-2 outline-none focus:border-[#e6902b]"
              />
            </Field>
          )}
          <div className={`grid md:grid-cols-2 gap-3 ${requireDescription ? "mt-3" : ""}`}>
            <Field label="PhonePe amount paid">
              <input
                inputMode="decimal"
                value={pp}
                onChange={(e) => setPp(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border-2 border-[#ffe0b3] bg-white px-3 py-2 outline-none focus:border-[#e6902b]"
              />
            </Field>
            <Field label="Cash amount paid">
              <input
                inputMode="decimal"
                value={cs}
                onChange={(e) => setCs(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border-2 border-[#ffe0b3] bg-white px-3 py-2 outline-none focus:border-[#e6902b]"
              />
            </Field>
          </div>

          {total > 0 && (
            <div className="mt-3 rounded-xl bg-[#fff6e6] border-2 border-[#ffe0b3] p-3 text-sm text-[#3a1f2b]">
              Deducting <b>−₹{p}</b> from Total Online and <b>−₹{c}</b> from Total Cash.
              Closing (and tomorrow's opening) drops by <b>−₹{total}</b>.
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-full bg-[#e6902b] disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 font-semibold text-white shadow hover:bg-[#cc7d1c] transition"
            >
              Enter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
