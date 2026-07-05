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
} from "recharts";
import KpiCards from "./KpiCards.jsx";

const COLORS = {
  salary: "#34d399",
  alt_income: "#fbbf24",
  misc_income: "#fb923c",
  expense: "#f87171",
  accent: "#4fd1c5",
  blue: "#60a5fa",
  purple: "#a78bfa",
};

const CATEGORY_PALETTE = ["#4fd1c5", "#60a5fa", "#fbbf24", "#f87171", "#a78bfa", "#34d399", "#fb923c", "#f472b6"];

const TOOLTIP_STYLE = {
  background: "#eef2f6",
  border: "1px solid #c9d6e0",
  color: "#0f172a",
};

function ChartCard({ title, desc, children, empty }) {
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      {desc && <div className="chart-desc">{desc}</div>}
      {empty ? <div className="chart-empty">Not enough data to render this chart.</div> : children}
    </div>
  );
}

const money = (v) =>
  v === null || v === undefined ? "" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function mergeByDay(cycles) {
  // cycles: [{cycle, points: [{day, value}]}] -> [{day, cycle1: v, cycle2: v, ...}]
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

  return (
    <>
      <KpiCards summary={summary} />

      <div className="section-title">Spending &amp; Categories</div>
      <div className="chart-grid">
        <ChartCard title="Monthly Spending Trend" desc="Total withdrawals grouped by month" empty={!monthlySpend.length}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlySpend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="month" stroke="#5f7285" fontSize={11} />
              <YAxis stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Bar dataKey="spend" fill={COLORS.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Spending Categories (Overall)" desc="Aggregated category spend across the whole statement" empty={!topCategoriesOverall.length}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topCategoriesOverall} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis type="number" stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <YAxis type="category" dataKey="category" stroke="#5f7285" fontSize={11} width={90} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                {topCategoriesOverall.map((_, i) => (
                  <Cell key={i} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="section-title">Income, Salary &amp; Cashflow</div>
      <div className="chart-grid">
        <ChartCard
          title="Bank Balance Over Time"
          desc="Closing balance with salary / income / expense events overlaid"
          empty={!balanceOverTime.length}
        >
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={balanceOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="date" stroke="#5f7285" fontSize={10} minTickGap={30} />
              <YAxis stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="balance" stroke={COLORS.blue} dot={false} activeDot={{ fill: "#eef2f6", stroke: COLORS.blue, strokeWidth: 2, r: 5 }} strokeWidth={2} name="Balance" />
              <Scatter data={balanceByType.salary} dataKey="balance" fill={COLORS.salary} name="Salary" />
              <Scatter data={balanceByType.alt_income} dataKey="balance" fill={COLORS.alt_income} name="Alt income" />
              <Scatter data={balanceByType.misc_income} dataKey="balance" fill={COLORS.misc_income} name="Misc income" />
              <Scatter data={balanceByType.expense} dataKey="balance" fill={COLORS.expense} name="Expense" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Income vs Expense per Pay Cycle"
          desc="Stacked income sources vs total spend, cycle-aligned to salary dates"
          empty={!cycleSummary.length}
        >
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={cycleSummary}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="cycle" stroke="#5f7285" fontSize={11} />
              <YAxis stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="salaryIn" stackId="income" fill={COLORS.salary} name="Salary" />
              <Bar dataKey="altIncomeIn" stackId="income" fill={COLORS.alt_income} name="Alt income" />
              <Bar dataKey="miscIncomeIn" stackId="income" fill={COLORS.misc_income} name="Misc income" />
              <Line type="monotone" dataKey="totalSpend" stroke={COLORS.expense} strokeWidth={2} name="Spend" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Savings Trend Across Cycles" desc="Net saved (income − spend) per pay cycle" empty={!cycleSummary.length}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={cycleSummary}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="cycle" stroke="#5f7285" fontSize={11} />
              <YAxis stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Line
                type="monotone"
                dataKey="netSaved"
                stroke={COLORS.accent}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ fill: "#eef2f6", stroke: COLORS.accent, strokeWidth: 2, r: 5 }}
                name="Net saved"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cumulative Cashflow" desc="Running net position across every transaction" empty={!dailyCashflow.length}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dailyCashflow}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="date" stroke="#5f7285" fontSize={10} minTickGap={30} />
              <YAxis stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="cumulative" stroke={COLORS.blue} strokeWidth={2} dot={false} activeDot={{ fill: "#eef2f6", stroke: COLORS.blue, strokeWidth: 2, r: 5 }} name="Net position" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="section-title">Risk &amp; Anomalies</div>
      <div className="chart-grid">
        <ChartCard title="Expense Spike Detection" desc="Every expense, plotted by date and size" empty={!expenseSpikes.length}>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="date" type="category" stroke="#5f7285" fontSize={10} minTickGap={30} />
              <YAxis dataKey="amount" stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <ZAxis range={[40, 40]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Scatter data={expenseSpikes} fill={COLORS.expense} fillOpacity={0.6} activeDot={{ stroke: "#eef2f6", strokeWidth: 2, r: 6 }} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Anomalous Money In / Out"
          desc="Transactions well outside the normal range for their type (mean + 2σ)"
          empty={!anomalies.income.length && !anomalies.expense.length}
        >
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="date" type="category" stroke="#5f7285" fontSize={10} minTickGap={30} />
              <YAxis dataKey="amount" stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <ZAxis range={[70, 70]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Scatter name="Income anomaly" data={anomalies.income} fill={COLORS.salary} activeDot={{ stroke: "#eef2f6", strokeWidth: 2, r: 6 }} />
              <Scatter name="Expense anomaly" data={anomalies.expense} fill={COLORS.expense} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Income Dependency Breakdown" desc="Share of total income by source type" empty={!incomeDependency.length}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={incomeDependency}
                dataKey="amount"
                nameKey="type"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
              >
                {incomeDependency.map((entry, i) => (
                  <Cell key={i} fill={COLORS[entry.type] || CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Recurring Merchants" desc="Same merchant + similar amount, 3+ times" empty={!recurringMerchants.length}>
          <ul className="merchant-list">
            {recurringMerchants.map((m, i) => (
              <li key={i}>
                <div>
                  <div className="merchant-name">{m.merchant}</div>
                  <div className="merchant-meta">{m.occurrences}× occurrences</div>
                </div>
                <div className="merchant-amount">₹{money(m.totalSpend)}</div>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <div className="section-title">Salary Cycle Behaviour</div>
      <div className="chart-grid">
        <ChartCard
          title="Salary Cycle Burn Curve (Normalized Balance)"
          desc="Balance change since each salary date, one faint line per cycle"
          empty={!salaryCycleMerged.length}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={salaryCycleMerged}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="day" stroke="#5f7285" fontSize={11} label={{ value: "Days since salary", position: "insideBottom", offset: -3, fontSize: 11, fill: "#5f7285" }} />
              <YAxis stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={{ background: "#0d141c", border: "1px solid #22303f" }} formatter={(v) => money(v)} />
              {salaryCycleKeys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={COLORS.purple} strokeOpacity={0.35} dot={false} strokeWidth={1.5} isAnimationActive={false} legendType="none" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Burn Rate Curve (Cumulative Net Flow)"
          desc="Faint per-cycle curves plus the bold average — how fast salary gets consumed"
          empty={!burnMerged.length}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mergeByDay([...(burnCurve.cycles || []), { cycle: "avg", points: burnCurve.average || [] }])}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22303f" />
              <XAxis dataKey="day" stroke="#5f7285" fontSize={11} label={{ value: "Days since salary", position: "insideBottom", offset: -3, fontSize: 11, fill: "#5f7285" }} />
              <YAxis stroke="#5f7285" fontSize={11} tickFormatter={money} />
              <Tooltip contentStyle={{ background: "#0d141c", border: "1px solid #22303f" }} formatter={(v) => money(v)} />
              {burnCycleKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={k} stroke={COLORS.blue} strokeOpacity={0.25} dot={false} strokeWidth={1.5} isAnimationActive={false} legendType="none" />
              ))}
              <Line type="monotone" dataKey="cavg" stroke="#eef2f6" strokeWidth={3} dot={false} name="Average" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}
