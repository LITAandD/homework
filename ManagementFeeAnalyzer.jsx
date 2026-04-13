import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";

const ITEM_DEFS = [
  { key: "일반관리비", variable: false },
  { key: "청소비", variable: false },
  { key: "경비비", variable: false },
  { key: "소독비", variable: false },
  { key: "승강기유지비", variable: false },
  { key: "수선유지비", variable: true },
  { key: "공동전기료", variable: true },
  { key: "세대수도료", variable: true },
  { key: "난방비", variable: true },
  { key: "장기수선충당금", variable: false },
  { key: "생활폐기물수수료", variable: false },
  { key: "TV수신료", variable: false },
  { key: "주차비", variable: true },
  { key: "연체료", variable: true },
];

const VAR_COLORS = {
  "난방비": "#E24B4A",
  "공동전기료": "#EF9F27",
  "세대수도료": "#378ADD",
  "수선유지비": "#7F77DD",
  "주차비": "#1D9E75",
};

const TOP_ITEMS = ["일반관리비", "경비비", "난방비", "장기수선충당금", "수선유지비", "공동전기료"];
const TOP_COLORS = ["#0C447C", "#185FA5", "#E24B4A", "#1D9E75", "#7F77DD", "#EF9F27"];

const fmt = (n) => (n != null && !isNaN(n) ? n.toLocaleString("ko-KR") : "-");

function parseManagementFee(rawText) {
  let text = rawText
    .replace(/합\s+계/g, "합계")
    .replace(/TV\s*수신료/g, "TV수신료")
    .replace(/장기\s*수선\s*충당금/g, "장기수선충당금")
    .replace(/생활\s*폐기물\s*수수료/g, "생활폐기물수수료")
    .replace(/승강기\s*유지비/g, "승강기유지비")
    .replace(/수선\s*유지비/g, "수선유지비");
  const normalized = text.replace(/[ \t]+/g, " ");

  const monthMatch = normalized.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
  if (!monthMatch) return null;

  const year = parseInt(monthMatch[1]);
  const month = parseInt(monthMatch[2]);
  const monthKey = `${year}.${String(month).padStart(2, "0")}`;
  const label = `${month}월`;
  const data = { monthKey, label };

  const allKeys = [...ITEM_DEFS.map((d) => d.key), "합계"];
  for (const key of allKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = normalized.match(new RegExp(escaped + "\\s+([\\d,]+)"));
    data[key] = m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  }
  return data;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-secondary)",
      borderRadius: 8, padding: "10px 14px", fontSize: 13,
    }}>
      <p style={{ margin: "0 0 6px", fontWeight: 500, color: "var(--color-text-primary)" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ margin: "2px 0", color: p.color || "var(--color-text-primary)" }}>
          {p.name}: {fmt(p.value)}원
        </p>
      ))}
    </div>
  );
};

export default function App() {
  const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
  const [months, setMonths] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const monthsRef = useRef(months);
  monthsRef.current = months;

  useEffect(() => {
    if (window.pdfjsLib) { setPdfjsLoaded(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setPdfjsLoaded(true);
    };
    s.onerror = () => setError("PDF.js 로드에 실패했습니다.");
    document.head.appendChild(s);
  }, []);

  const processFiles = useCallback(async (files) => {
    if (!pdfjsLoaded) { setError("PDF 라이브러리 로딩 중입니다. 잠시 후 시도해주세요."); return; }
    setLoading(true);
    setError("");
    const found = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf")) continue;
      try {
        const ab = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const text = content.items.map((it) => it.str).join(" ");
          const parsed = parseManagementFee(text);
          if (parsed) found.push(parsed);
        }
      } catch {
        setError(`오류: ${file.name} 처리에 실패했습니다.`);
      }
    }
    if (!found.length && files.length)
      setError("관리비 고지서 형식을 인식하지 못했습니다. 올바른 PDF를 업로드해주세요.");
    const merged = [...monthsRef.current, ...found];
    const unique = Array.from(new Map(merged.map((m) => [m.monthKey, m])).values());
    unique.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    setMonths(unique);
    setLoading(false);
  }, [pdfjsLoaded]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const totalData = months.map((m) => ({ name: m.label, 합계: m["합계"] || 0 }));
  const varData = months.map((m) => {
    const d = { name: m.label };
    Object.keys(VAR_COLORS).forEach((k) => { d[k] = m[k] || 0; });
    return d;
  });
  const topData = months.map((m) => {
    const d = { name: m.label };
    TOP_ITEMS.forEach((k) => { d[k] = m[k] || 0; });
    return d;
  });

  const chartCard = {
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)",
    padding: "16px 16px 10px",
  };

  return (
    <div style={{ fontFamily: "'Apple SD Gothic Neo','Malgun Gothic',-apple-system,sans-serif", color: "var(--color-text-primary)", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>관리비 분석기</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
          아파트 관리비 고지서 PDF를 업로드하면 항목별 금액 변화를 자동으로 분석합니다
        </p>
      </div>

      <div style={{ padding: "0 24px" }}>
        {/* Upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1.5px dashed ${isDragging ? "#378ADD" : "var(--color-border-secondary)"}`,
            borderRadius: "var(--border-radius-lg)",
            padding: months.length ? "14px 20px" : "44px 24px",
            background: isDragging ? "var(--color-background-info)" : "var(--color-background-secondary)",
            textAlign: "center", cursor: "pointer",
            transition: "border-color 0.15s, background 0.15s",
            marginBottom: 20,
          }}
        >
          <input ref={fileInputRef} type="file" multiple accept=".pdf" style={{ display: "none" }}
            onChange={(e) => processFiles(Array.from(e.target.files))} />
          {loading ? (
            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>PDF 분석 중...</p>
          ) : months.length ? (
            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 13 }}>
              추가 PDF를 드래그하거나 클릭하여 업로드
            </p>
          ) : (
            <>
              <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 500 }}>관리비 고지서 PDF를 업로드하세요</p>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--color-text-secondary)" }}>
                여러 달 PDF를 한꺼번에 드래그하거나 파일 선택으로 업로드할 수 있습니다
              </p>
              <button style={{ fontSize: 13, padding: "8px 20px" }}>파일 선택</button>
            </>
          )}
        </div>

        {error && (
          <div style={{ background: "var(--color-background-danger)", border: "0.5px solid var(--color-border-danger)", borderRadius: "var(--border-radius-md)", padding: "10px 14px", marginBottom: 16, color: "var(--color-text-danger)", fontSize: 13 }}>
            {error}
          </div>
        )}

        {months.length > 0 && (
          <>
            {/* Top bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>{months.length}개월 데이터 로드됨</p>
              <button onClick={() => { setMonths([]); setError(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                style={{ fontSize: 12, padding: "4px 12px" }}>초기화</button>
            </div>

            {/* Summary metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 28 }}>
              {months.map((m) => (
                <div key={m.monthKey} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>{m.monthKey}</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{fmt(m["합계"])}원</p>
                  {m["연체료"] > 0 && (
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--color-text-danger)" }}>연체료 {fmt(m["연체료"])}원</p>
                  )}
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", marginBottom: 24 }}>
              <div style={{ padding: "13px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>월별 항목 비교표</h2>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--color-background-secondary)" }}>
                      <th style={{ padding: "9px 16px", textAlign: "left", fontWeight: 500, color: "var(--color-text-secondary)", whiteSpace: "nowrap", borderBottom: "0.5px solid var(--color-border-tertiary)", minWidth: 150 }}>항목</th>
                      {months.map((m) => (
                        <th key={m.monthKey} style={{ padding: "9px 16px", textAlign: "right", fontWeight: 500, whiteSpace: "nowrap", borderBottom: "0.5px solid var(--color-border-tertiary)", minWidth: 88 }}>{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ITEM_DEFS.map((item, idx) => {
                      const maxVal = item.variable ? Math.max(...months.map((x) => x[item.key] || 0)) : 0;
                      return (
                        <tr key={item.key} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", background: idx % 2 === 1 ? "var(--color-background-secondary)" : "transparent" }}>
                          <td style={{ padding: "8px 16px" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              {item.variable
                                ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#E24B4A", flexShrink: 0 }} />
                                : <span style={{ width: 6, flexShrink: 0 }} />}
                              <span style={{ color: item.variable ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: item.variable ? 500 : 400 }}>
                                {item.key}
                              </span>
                            </span>
                          </td>
                          {months.map((m) => {
                            const val = m[item.key] || 0;
                            const isMax = item.variable && months.length > 1 && val === maxVal && val > 0;
                            return (
                              <td key={m.monthKey} style={{ padding: "8px 16px", textAlign: "right", color: isMax ? "#E24B4A" : "var(--color-text-primary)", fontWeight: isMax ? 500 : 400 }}>
                                {fmt(val)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: "0.5px solid var(--color-border-primary)" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 500 }}>
                        <span style={{ paddingLeft: 13 }}>합계</span>
                      </td>
                      {months.map((m) => (
                        <td key={m.monthKey} style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500 }}>{fmt(m["합계"])}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "8px 16px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#E24B4A", marginRight: 5, verticalAlign: "middle" }} />
                  빨간 점: 월별 변동 항목 &nbsp;·&nbsp; 빨간 숫자: 해당 기간 최고값
                </p>
              </div>
            </div>

            {/* Charts grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>

              {/* Chart 1 — Monthly total */}
              <div style={chartCard}>
                <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>월별 합계 추이</h3>
                <p style={{ margin: "0 0 14px", fontSize: 11, color: "var(--color-text-tertiary)" }}>단위: 원</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={totalData} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-background-secondary)" }} />
                    <Bar dataKey="합계" name="합계" fill="#0C447C" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 2 — Variable items line */}
              <div style={chartCard}>
                <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 500 }}>변동 항목 비교</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginBottom: 12 }}>
                  {Object.entries(VAR_COLORS).map(([k, color]) => (
                    <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-secondary)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />{k}
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={varData} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                    <Tooltip content={<CustomTooltip />} />
                    {Object.entries(VAR_COLORS).map(([k, color]) => (
                      <Line key={k} type="monotone" dataKey={k} stroke={color} strokeWidth={1.5}
                        dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} legendType="none" />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 3 — Top items grouped bar (full width) */}
              <div style={{ ...chartCard, gridColumn: "span 2" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 500 }}>주요 항목별 금액 비교</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginBottom: 14 }}>
                  {TOP_ITEMS.map((k, i) => (
                    <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-secondary)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: TOP_COLORS[i], flexShrink: 0 }} />{k}
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topData} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-background-secondary)" }} />
                    {TOP_ITEMS.map((k, i) => (
                      <Bar key={k} dataKey={k} fill={TOP_COLORS[i]} radius={[2, 2, 0, 0]} legendType="none" />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
