import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
} from "recharts";
import KpiCards from "./KpiCards.jsx";

const COLORS = {
  salary: "#22c55e",
  alt_income: "#f59e0b",
  misc_income: "#fb923c",
  expense: "#f43f5e",
  accent: "#6d5efc",
  blue: "#3b82f6",
  purple: "#8b5cf6",
};

const CATEGORY_PALETTE = ["#6d5efc", "#3b82f6", "#f59e0b", "#f43f5e", "#8b5cf6", "#22c55e", "#fb923c", "#ec4899"];

const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #dfe7f2",
  color: "#111827",
  boxShadow: "0 14px 36px rgba(15, 23, 42, 0.14)",
};

function ChartCard({ title, desc, children, empty }) {
  return (
    <div className="chart-card">
      <div className="chart-card-top">
        <h3>{title}</h3>
        {desc && <div className="chart-desc">{desc}</div>}
      </div>
      {empty ? <div className="chart-empty">Not enough data to render this chart.</div> : children}
    </div>
  );
}

const money = (v) => (v === null || v === undefined ? "" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 }));
const formatCurrency = (v) =>
  v === null || v === undefined ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

function mergeByDay(cycles) {
  const dayMap = new Map();
  cycles.forEach(({ cycle, points }) => {
    points.forEach(({ day, value }) => {
      if (!dayMap.has(day)) dayMap.set(day, { day });
      dayMap.get(day)[`c${cycle}`] = value;
    });
  });
  return Array.from(dayMap.values()).sort((a, b) => a.day - b.day);
}

export default function Dashboard({ data }) {
  const {
    summary,
    monthlySpend = [],
    topCategoriesOverall = [],
    recurringMerchants = [],
    cycleSummary = [],
    dailyCashflow = [],
    expenseSpikes = [],
    anomalies = { income: [], expense: [] },
    balanceOverTime = [],
    incomeDependency = [],
    burnCurve = { cycles: [], average: [] },
    salaryCycleCurve = { cycles: [] },
  } = data;

  const balanceByType = {
    salary: balanceOverTime.filter((d) => d.type === "salary"),
    alt_income: balanceOverTime.filter((d) => d.type === "alt_income"),
    misc_income: balanceOverTime.filter((d) => d.type === "misc_income"),
    expense: balanceOverTime.filter((d) => d.type === "expense"),
  };

  const burnMerged = mergeByDay(burnCurve.cycles || []);
  const salaryCycleMerged = mergeByDay(salaryCycleCurve.cycles || []);
  const burnCycleKeys = (burnCurve.cycles || []).map((c) => `c${c.cycle}`);
  const salaryCycleKeys = (salaryCycleCurve.cycles || []).map((c) => `c${c.cycle}`);

  const heroInsights = [
    {
      title: "Spending tempo",
      text: monthlySpend.length ? `${monthlySpend[monthlySpend.length - 1]?.month || "This month"} sits at ${formatCurrency(monthlySpend[monthlySpend.length - 1]?.spend || 0)}` : "More history will strengthen the trend view",
      tone: "violet",
      icon: "↗",
    },
    {
      title: "Salary rhythm",
      text: summary?.salaryDetected ? "A reliable salary pattern is already visible in your history." : "Add a bit more history to surface recurring salary timing.",
      tone: "sky",
      icon: "◌",
    },
    {
      title: "Anomaly watch",
      text: expenseSpikes.length ? `${expenseSpikes.length} spending spikes are worth a closer look.` : "No unusual spikes detected in the current view.",
      tone: "rose",
      icon: "⚠",
    },
  ];

  const heroStats = [
    { label: "Net balance", value: formatCurrency(summary?.netSavings ?? 0), detail: (summary?.netSavings ?? 0) >= 0 ? "Healthy reserve" : "Needs attention" },
    { label: "Income", value: formatCurrency(summary?.totalIncome ?? 0), detail: "Current window" },
    { label: "Expenses", value: formatCurrency(summary?.totalExpense ?? 0), detail: `${summary?.transactionCount ?? 0} transactions` },
  ];

  return (
    <div className="dashboard-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">Financial command center</div>
          <h2>Here’s your money, beautifully organized.</h2>
          <p>
            A premium view of your statement with clearer spending patterns, stronger salary signals, and AI-ready insights.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary">
              Ask AI
            </button>
            <button type="button" className="btn btn-secondary">
              Export summary
            </button>
          </div>
          <div className="hero-pills">
            <span className="hero-pill">Live cashflow</span>
            <span className="hero-pill">Recurring patterns</span>
            <span className="hero-pill">Anomaly watch</span>
          </div>
        </div>

        <div className="hero-side-card">
          {heroStats.map((item) => (
            <div key={item.label} className="hero-stat">
              <div className="hero-stat-label">{item.label}</div>
              <div className="hero-stat-value">{item.value}</div>
              <div className="hero-stat-detail">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <KpiCards summary={summary} />

      <section className="insight-grid">
        {heroInsights.map((item) => (
          <div key={item.title} className={`insight-card ${item.tone}`}>
            <div className="insight-icon">{item.icon}</div>
            <div>
              <div className="insight-title">{item.title}</div>
              <div className="insight-text">{item.text}</div>
            </div>
          </div>
        ))}
      </section>

      <div className="section-title">Performance overview</div>
      <div className="chart-grid">
        <ChartCard title="Monthly spending trend" desc="Total withdrawals grouped by month" empty={!monthlySpend.length}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlySpend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Bar dataKey="spend" fill={COLORS.accent} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top spending categories" desc="Aggregated category spend across the whole statement" empty={!topCategoriesOverall.length}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topCategoriesOverall} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis type="number" stroke="#64748b" fontSize={11} tickFormatter={money} />
              <YAxis type="category" dataKey="category" stroke="#64748b" fontSize={11} width={100} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                {topCategoriesOverall.map((_, i) => (
                  <Cell key={i} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="section-title">Cashflow and balance</div>
      <div className="chart-grid">
        <ChartCard title="Balance over time" desc="Closing balance with salary, income, and expense events overlaid" empty={!balanceOverTime.length}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={balanceOverTime}>
              <defs>
                <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLORS.blue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={10} minTickGap={30} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="balance" stroke={COLORS.blue} fill="url(#balanceGradient)" strokeWidth={2.2} name="Balance" />
              <Scatter data={balanceByType.salary} dataKey="balance" fill={COLORS.salary} name="Salary" />
              <Scatter data={balanceByType.alt_income} dataKey="balance" fill={COLORS.alt_income} name="Alt income" />
              <Scatter data={balanceByType.misc_income} dataKey="balance" fill={COLORS.misc_income} name="Misc income" />
              <Scatter data={balanceByType.expense} dataKey="balance" fill={COLORS.expense} name="Expense" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Income vs expense per pay cycle" desc="Stacked income sources vs total spend, aligned to salary dates" empty={!cycleSummary.length}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={cycleSummary}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="cycle" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="salaryIn" stackId="income" fill={COLORS.salary} name="Salary" radius={[4, 4, 0, 0]} />
              <Bar dataKey="altIncomeIn" stackId="income" fill={COLORS.alt_income} name="Alt income" radius={[4, 4, 0, 0]} />
              <Bar dataKey="miscIncomeIn" stackId="income" fill={COLORS.misc_income} name="Misc income" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="totalSpend" stroke={COLORS.expense} strokeWidth={2.2} name="Spend" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="section-title">Behavior and risk</div>
      <div className="chart-grid">
        <ChartCard title="Savings trend" desc="Net saved (income − spend) per pay cycle" empty={!cycleSummary.length}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={cycleSummary}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="cycle" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Line
                type="monotone"
                dataKey="netSaved"
                stroke={COLORS.accent}
                strokeWidth={2.2}
                dot={{ r: 4, strokeWidth: 2, fill: "#ffffff", stroke: COLORS.accent }}
                activeDot={{ fill: "#ffffff", stroke: COLORS.accent, strokeWidth: 2, r: 5 }}
                name="Net saved"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cumulative cashflow" desc="Running net position across every transaction" empty={!dailyCashflow.length}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dailyCashflow}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={10} minTickGap={30} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="cumulative" stroke={COLORS.blue} strokeWidth={2.2} dot={false} activeDot={{ fill: "#ffffff", stroke: COLORS.blue, strokeWidth: 2, r: 5 }} name="Net position" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="section-title">Signals and opportunities</div>
      <div className="chart-grid">
        <ChartCard title="Expense spike detection" desc="Every expense, plotted by date and size" empty={!expenseSpikes.length}>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="date" type="category" stroke="#64748b" fontSize={10} minTickGap={30} />
              <YAxis dataKey="amount" stroke="#64748b" fontSize={11} tickFormatter={money} />
              <ZAxis range={[48, 48]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Scatter data={expenseSpikes} fill={COLORS.expense} fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Anomalous money in / out" desc="Transactions well outside the normal range for their type" empty={!anomalies.income.length && !anomalies.expense.length}>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="date" type="category" stroke="#64748b" fontSize={10} minTickGap={30} />
              <YAxis dataKey="amount" stroke="#64748b" fontSize={11} tickFormatter={money} />
              <ZAxis range={[72, 72]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Scatter name="Income anomaly" data={anomalies.income} fill={COLORS.salary} />
              <Scatter name="Expense anomaly" data={anomalies.expense} fill={COLORS.expense} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Income dependency breakdown" desc="Share of total income by source type" empty={!incomeDependency.length}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={incomeDependency} dataKey="amount" nameKey="type" innerRadius={54} outerRadius={92} paddingAngle={2}>
                {incomeDependency.map((entry, i) => (
                  <Cell key={i} fill={COLORS[entry.type] || CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Recurring merchants" desc="Same source or merchant with similar amounts, repeated over time" empty={!recurringMerchants.length}>
          <ul className="merchant-list">
            {recurringMerchants.map((m, i) => (
              <li key={i}>
                <div className="merchant-name-row">
                  <span className={`merchant-type-dot ${m.type === "income" ? "income" : "expense"}`} />
                  <div>
                    <div className="merchant-name">{m.merchant}</div>
                    <div className="merchant-meta">
                      {m.occurrences}× occurrences · {m.type === "income" ? "income" : "expense"}
                    </div>
                  </div>
                </div>
                <div className={`merchant-amount ${m.type === "income" ? "income" : "expense"}`}>₹{money(m.totalSpend)}</div>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <div className="section-title">Salary cycle behaviour</div>
      <div className="chart-grid">
        <ChartCard title="Salary cycle burn curve" desc="Balance change since each salary date, one faint line per cycle" empty={!salaryCycleMerged.length}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={salaryCycleMerged}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} label={{ value: "Days since salary", position: "insideBottom", offset: -3, fontSize: 11, fill: "#64748b" }} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              {salaryCycleKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={k} stroke={COLORS.purple} strokeOpacity={0.35} dot={false} strokeWidth={1.5} isAnimationActive={false} legendType="none" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Burn rate curve" desc="Faint per-cycle curves plus a bold average — how fast salary gets consumed" empty={!burnMerged.length}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mergeByDay([...(burnCurve.cycles || []), { cycle: "avg", points: burnCurve.average || [] }])}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f2" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} label={{ value: "Days since salary", position: "insideBottom", offset: -3, fontSize: 11, fill: "#64748b" }} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              {burnCycleKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={k} stroke={COLORS.blue} strokeOpacity={0.25} dot={false} strokeWidth={1.5} isAnimationActive={false} legendType="none" />
              ))}
              <Line type="monotone" dataKey="cavg" stroke={COLORS.accent} strokeWidth={3} dot={false} name="Average" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
