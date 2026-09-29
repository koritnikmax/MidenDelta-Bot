// Specifications chart, drawn like a trading terminal: ETH candles on top, the simulated value of the
// delta-neutral position below, funding per candle at the bottom. It plays forward with the scroll:
// draw(p) shows the history up to p (0 → 1) in a sliding window, like a live chart.

const WINDOW = 64; // candles on screen
const START_VALUE = 10_000;
const FONT = '"Geist Mono", ui-monospace, monospace';
const C = {
  grid: "rgba(255,255,255,.055)", axis: "rgba(255,255,255,.42)", text: "rgba(255,255,255,.62)", bright: "#f2f2f2",
  up: "#e9e9e9", down: "#4a4a4a", downEdge: "#8c8c8c", line: "#ffffff", fill: "rgba(255,255,255,.08)",
  fundUp: "rgba(255,255,255,.55)", fundDown: "rgba(255,255,255,.2)", tag: "#ffffff", tagText: "#000",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const usd = (v, dp = 0) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export async function createChart(canvas, url) {
  const rows = (await (await fetch(url)).json()).rows.map(([d, o, h, l, c, f, cum]) => ({ d, o, h, l, c, f, v: START_VALUE * (1 + cum / 100) }));
  const g = canvas.getContext("2d");
  let w = 0, h = 0, dpr = 1, last = -1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    last = -1;
  }

  function niceTicks(min, max, n) {
    const step0 = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0);
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
    return out;
  }

  function draw(p) {
    if (!w) resize();
    if (!w || !h) return; // not laid out yet
    p = Number.isFinite(p) ? p : 0;
    const n = Math.max(8, Math.min(rows.length, Math.round(8 + p * (rows.length - 8))));
    if (n === last) return;
    last = n;
    const from = Math.max(0, n - WINDOW), vis = rows.slice(from, n);
    const small = w < 520;
    const axisW = small ? 50 : 64, legendH = small ? 40 : 46, timeH = 20;
    const plotW = w - axisW, cw = plotW / WINDOW;
    const top = legendH, bottom = h - timeH;
    const hMain = (bottom - top) * 0.56, hVal = (bottom - top) * 0.28;
    const yMain0 = top, yVal0 = top + hMain + 8, yFund0 = yVal0 + hVal + 8, yFundEnd = bottom;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.font = `${small ? 10 : 11}px ${FONT}`;
    g.textBaseline = "middle";

    // panes: candles, position value, funding
    const lo = Math.min(...vis.map((r) => r.l)), hi = Math.max(...vis.map((r) => r.h));
    const pad = (hi - lo) * 0.08;
    const yP = (v) => yMain0 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * hMain;
    const vLo = Math.min(...vis.map((r) => r.v)), vHi = Math.max(...vis.map((r) => r.v));
    const vPad = Math.max(40, (vHi - vLo) * 0.25);
    const yV = (v) => yVal0 + (1 - (v - (vLo - vPad)) / (vHi - vLo + 2 * vPad)) * hVal;
    const fMax = Math.max(0.05, ...vis.map((r) => Math.abs(r.f)));
    const yF0 = yFund0 + (yFundEnd - yFund0) * 0.72;
    const yF = (f) => yF0 - (f / fMax) * (yFundEnd - yFund0) * 0.7;
    const x = (i) => (i + (WINDOW - vis.length)) * cw + cw / 2;

    const lastR = vis[vis.length - 1];
    const near = (y, y0) => Math.abs(y - y0) < 13;
    // grid + price axis
    g.strokeStyle = C.grid; g.lineWidth = 1; g.fillStyle = C.text; g.textAlign = "left";
    for (const v of niceTicks(lo - pad, hi + pad, small ? 4 : 5)) {
      const y = Math.round(yP(v)) + 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(plotW, y); g.stroke();
      if (!near(y, yP(lastR.c))) g.fillText(v.toLocaleString("en-US"), plotW + 8, y);
    }
    for (const v of niceTicks(vLo - vPad, vHi + vPad, 3)) {
      const y = Math.round(yV(v)) + 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(plotW, y); g.stroke();
      if (!near(y, yV(lastR.v))) g.fillText((v / 1000).toFixed(v % 1000 ? 1 : 0) + "k", plotW + 8, y);
    }
    // pane separators and the right axis line
    g.strokeStyle = "rgba(255,255,255,.12)";
    for (const y of [yVal0 - 4, yFund0 - 4]) { g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); g.stroke(); }
    g.beginPath(); g.moveTo(Math.round(plotW) + 0.5, top); g.lineTo(Math.round(plotW) + 0.5, bottom); g.stroke();

    // time axis: first candle of each quarter
    g.fillStyle = C.axis; g.textAlign = "center";
    vis.forEach((r, i) => {
      const prev = rows[from + i - 1];
      if (!prev || prev.d.slice(0, 7) === r.d.slice(0, 7)) return;
      const m = +r.d.slice(5, 7) - 1;
      if (m % 3) return;
      const xx = Math.round(x(i)) + 0.5;
      g.strokeStyle = C.grid; g.beginPath(); g.moveTo(xx, top); g.lineTo(xx, bottom); g.stroke();
      g.fillText(m === 0 ? r.d.slice(0, 4) : MONTHS[m], xx, bottom + timeH / 2);
    });

    // candles
    const bw = Math.max(1.5, cw * 0.62);
    vis.forEach((r, i) => {
      const xx = x(i), up = r.c >= r.o;
      g.strokeStyle = up ? C.up : C.downEdge; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(xx) + 0.5, yP(r.h)); g.lineTo(Math.round(xx) + 0.5, yP(r.l)); g.stroke();
      const y1 = yP(Math.max(r.o, r.c)), y2 = yP(Math.min(r.o, r.c));
      g.fillStyle = up ? C.up : C.down;
      g.fillRect(xx - bw / 2, y1, bw, Math.max(1, y2 - y1));
      if (!up) g.strokeRect(xx - bw / 2 + 0.5, y1 + 0.5, bw - 1, Math.max(1, y2 - y1) - 1);
    });

    // position value: area + line
    g.beginPath();
    vis.forEach((r, i) => (i ? g.lineTo(x(i), yV(r.v)) : g.moveTo(x(i), yV(r.v))));
    g.strokeStyle = C.line; g.lineWidth = 1.6; g.stroke();
    g.lineTo(x(vis.length - 1), yVal0 + hVal); g.lineTo(x(0), yVal0 + hVal); g.closePath();
    g.fillStyle = C.fill; g.fill();

    // funding histogram
    vis.forEach((r, i) => {
      const y = yF(r.f);
      g.fillStyle = r.f >= 0 ? C.fundUp : C.fundDown;
      g.fillRect(x(i) - bw / 2, Math.min(y, yF0), bw, Math.max(1, Math.abs(y - yF0)));
    });
    g.strokeStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(0, Math.round(yF0) + 0.5); g.lineTo(plotW, Math.round(yF0) + 0.5); g.stroke();

    // last-value tags on the axis
    const tag = (y, label, inverted) => {
      g.fillStyle = inverted ? C.tag : "rgba(255,255,255,.14)";
      g.fillRect(plotW + 1, y - 9, axisW - 1, 18);
      g.fillStyle = inverted ? C.tagText : C.bright; g.textAlign = "left";
      g.fillText(label, plotW + 6, y);
    };
    g.setLineDash([2, 3]); g.strokeStyle = "rgba(255,255,255,.35)";
    g.beginPath(); g.moveTo(0, Math.round(yP(lastR.c)) + 0.5); g.lineTo(plotW, Math.round(yP(lastR.c)) + 0.5); g.stroke();
    g.setLineDash([]);
    tag(yP(lastR.c), lastR.c.toLocaleString("en-US", { maximumFractionDigits: 0 }), true);
    tag(yV(lastR.v), (lastR.v / 1000).toFixed(2) + "k", false);

    // legends
    const first = rows[0];
    const ethChg = ((lastR.c / first.o - 1) * 100).toFixed(1);
    const valChg = ((lastR.v / START_VALUE - 1) * 100).toFixed(1);
    g.textAlign = "left"; g.fillStyle = C.bright;
    g.font = `500 ${small ? 11 : 12}px ${FONT}`;
    g.fillText(`ETH/USD · 3D · Hyperliquid`, 0, 10);
    g.font = `${small ? 10 : 11}px ${FONT}`; g.fillStyle = C.text;
    const d = new Date(lastR.d + "T00:00:00Z");
    const ohlc = small
      ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}  C ${lastR.c.toFixed(0)}  ETH ${ethChg >= 0 ? "+" : ""}${ethChg}%`
      : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}   O ${lastR.o.toFixed(1)}  H ${lastR.h.toFixed(1)}  L ${lastR.l.toFixed(1)}  C ${lastR.c.toFixed(1)}   ETH ${ethChg >= 0 ? "+" : ""}${ethChg}%`;
    g.fillText(ohlc, 0, 28);
    g.fillStyle = C.bright;
    g.fillText(`Position, delta-neutral  ${usd(lastR.v)}  ${valChg >= 0 ? "+" : ""}${valChg}%`, 4, yVal0 + 10);
    g.fillStyle = C.text;
    g.fillText(`Funding per candle, % of capital`, 4, yFund0 + 8);
  }

  addEventListener("resize", () => { resize(); });
  resize();
  return { draw, resize };
}
