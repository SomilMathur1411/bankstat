import React, { useMemo, useState } from "react";

const DEFAULT_VISIBLE = 6;

const fmt = (n) =>
  n === null || n === undefined
    ? "—"
    : Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// Compact, collapsible list of the most recent transactions. Reuses the
// same .merchant-list styling as the "Recurring merchants" card so it
// blends in rather than introducing a new visual language. Collapsed by
// default (last 6), expands in place to the full list with a scrollable
// container instead of pushing the rest of the page down.
export default function RecentTransactions({ transactions = [] }) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions]
  );

  if (!sorted.length) {
    return <div className="merchant-meta">No transactions to show yet.</div>;
  }

  const visible = expanded ? sorted : sorted.slice(0, DEFAULT_VISIBLE);

  return (
    <div className="recent-txn-wrap">
      <ul className={`merchant-list recent-txn-list ${expanded ? "scrollable" : ""}`}>
        {visible.map((t, i) => {
          const isIncome = (t.amount ?? 0) >= 0;
          return (
            <li key={i}>
              <div className="merchant-name-row">
                <span className={`merchant-type-dot ${isIncome ? "income" : "expense"}`} />
                <div>
                  <div className="merchant-name">{t.merchant || "Unknown"}</div>
                  <div className="merchant-meta">
                    {t.date}
                    {t.category ? ` · ${t.category}` : ""}
                    {t.mode ? ` · ${t.mode}` : ""}
                  </div>
                </div>
              </div>
              <div className={`merchant-amount ${isIncome ? "income" : "expense"}`}>
                {isIncome ? "+" : "−"}₹{fmt(t.amount)}
              </div>
            </li>
          );
        })}
      </ul>

      {sorted.length > DEFAULT_VISIBLE && (
        <button
          type="button"
          className="btn btn-secondary small recent-txn-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : `View all ${sorted.length} transactions`}
        </button>
      )}
    </div>
  );
}
