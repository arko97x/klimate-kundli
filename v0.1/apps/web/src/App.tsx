import { useState } from "react";
import { CityCombobox, type GeoResult } from "./CityCombobox.js";
import type { GenerateOutput, Stay } from "./types.js";

const todayIso = () => new Date().toISOString().slice(0, 10);

// Month-precision helpers. Stays are entered as YYYY-MM in the UI and
// expanded to full ISO dates before submission: start → first day of month,
// end → last day of month.
function isoToYearMonth(iso: string): string {
  return iso.length >= 7 ? iso.slice(0, 7) : "";
}
function startOfMonth(ym: string): string {
  return ym ? `${ym}-01` : "";
}
function endOfMonth(ym: string): string {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return "";
  // day 0 of next month = last day of current month
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}
const todayYearMonth = () => new Date().toISOString().slice(0, 7);

export function App() {
  const [birthDate, setBirthDate] = useState("");
  const [birthCity, setBirthCity] = useState("");
  const [birthCountry, setBirthCountry] = useState("");
  const [stays, setStays] = useState<Stay[]>([]);
  // Index of the most recently added stay row; used to autofocus its city
  // input once. Reset to null after the input mounts.
  const [focusStayIdx, setFocusStayIdx] = useState<number | null>(null);

  function onBirthSelect(r: GeoResult) {
    setBirthCountry(r.country ?? "");
  }
  function onStaySelect(i: number, r: GeoResult) {
    updateStay(i, { country: r.country ?? "" });
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateOutput | null>(null);

  function addStay() {
    setStays((s) => {
      const next = [...s, { city: "", country: "", start: "", end: endOfMonth(todayYearMonth()) }];
      setFocusStayIdx(next.length - 1);
      return next;
    });
  }

  function updateStay(i: number, patch: Partial<Stay>) {
    setStays((s) => s.map((x, j) => (i === j ? { ...x, ...patch } : x)));
  }

  function removeStay(i: number) {
    setStays((s) => s.filter((_, j) => j !== i));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate,
          birthCity,
          birthCountry,
          citiesLivedIn: stays.filter((s) => s.city.trim() && s.start && s.end),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setResult(json as GenerateOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <h1>Klimate Kundli</h1>
      <p className="subtitle">PoC — enter visitor details, generate the 12-cell climate kundli.</p>

      <div className="form">
        <div className="row">
          <div>
            <label htmlFor="birthDate">Birth date</label>
            <input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={todayIso()}
            />
          </div>
          <div>
            <label htmlFor="birthCity">City of birth</label>
            <CityCombobox
              id="birthCity"
              value={birthCity}
              onChange={setBirthCity}
              onSelect={onBirthSelect}
              placeholder="Start typing… (e.g. Kolkata)"
            />
          </div>
        </div>

        <div className="row">
          <div>
            <label htmlFor="birthCountry">Country (auto-filled when you pick a city)</label>
            <input
              id="birthCountry"
              type="text"
              value={birthCountry}
              onChange={(e) => setBirthCountry(e.target.value)}
              placeholder="India"
            />
          </div>
          <div />
        </div>

        <div>
          <label>Cities lived in (optional · month / year for each stay)</label>
          <div className="stays">
            {stays.map((s, i) => (
              <div className="stay" key={i}>
                <div>
                  <CityCombobox
                    value={s.city}
                    onChange={(v) => updateStay(i, { city: v })}
                    onSelect={(r) => onStaySelect(i, r)}
                    placeholder="City"
                    autoFocus={focusStayIdx === i}
                  />
                </div>
                <div>
                  <input
                    type="month"
                    value={isoToYearMonth(s.start)}
                    max={todayYearMonth()}
                    onChange={(e) => updateStay(i, { start: startOfMonth(e.target.value) })}
                    placeholder="Start (month)"
                    aria-label="Start month"
                  />
                </div>
                <div>
                  <input
                    type="month"
                    value={isoToYearMonth(s.end)}
                    max={todayYearMonth()}
                    onChange={(e) => updateStay(i, { end: endOfMonth(e.target.value) })}
                    placeholder="End (month)"
                    aria-label="End month"
                  />
                </div>
                <button className="icon" onClick={() => removeStay(i)} aria-label="remove">
                  ×
                </button>
              </div>
            ))}
            <button className="ghost" onClick={addStay} type="button">
              + Add a city you lived in
            </button>
          </div>
        </div>

        <button
          className="primary"
          onClick={generate}
          disabled={loading || !birthDate || !birthCity.trim()}
        >
          {loading ? "Generating…" : "Generate my Kundli"}
        </button>
        {error && <div className="error">Error: {error}</div>}
      </div>

      {result && <Kundli data={result} />}
    </div>
  );
}

function Kundli({ data }: { data: GenerateOutput }) {
  return (
    <div>
      <div className="kundli">
        {data.cells.map((cell) => (
          <div key={cell.id} className={`cell${cell.value === null ? " empty" : ""}`}>
            <div>
              <div className="label">
                <span className="id-tag">#{cell.id}</span> · {cell.label}
              </div>
              <div className="value">{cell.value ?? "—"}</div>
            </div>
            {cell.detail && <div className="detail">{cell.detail}</div>}
          </div>
        ))}
      </div>
      <div className="meta">
        <span>Place: {data.visitor.birthPlaceResolved ?? data.visitor.birthCity}</span>
        {data.visitor.coords && (
          <span>
            ({data.visitor.coords.lat.toFixed(3)}, {data.visitor.coords.lon.toFixed(3)})
          </span>
        )}
        {typeof data.elapsedMs === "number" && <span>Generated in {data.elapsedMs} ms</span>}
      </div>
    </div>
  );
}
