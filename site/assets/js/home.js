import { initChrome, reducedMotion, scrollToY } from "./common.js";
import { createChart } from "./chart.js";

initChrome("home");

const T_MAX = 12;
const story = document.getElementById("story");
const canvas = document.getElementById("scene");
const stage = story.querySelector(".story-stage");
const cue = document.getElementById("scroll-cue");
const bar = document.getElementById("progress-line");
const rail = document.getElementById("rail");
// Spec items stack up on desktop; on phones each one replaces the previous (data-out-m) so they fit under the chart.
const phone = matchMedia("(max-width: 820px)");
const fades = [...story.querySelectorAll("[data-in]")].map((el) => ({ el, a: +el.dataset.in, out: +el.dataset.out, outM: el.dataset.outM ? +el.dataset.outM : null, blur: el.hasAttribute("data-blur") }));
const specItems = [...story.querySelectorAll(".spec-list li")];
const outOf = (f) => (phone.matches && f.outM !== null ? f.outM : f.out);

const CHAPTERS = [
  ["Intro", 0], ["Account", 1.05], ["Spot", 2.45], ["Short", 3.45], ["Delta 0", 4.55], ["Funding", 5.6], ["Automated", 6.6], ["Specs", 8.3],
];
rail.innerHTML = CHAPTERS.map(([name]) => `<button type="button"><span>${name}</span></button>`).join("");
const railBtns = [...rail.children];
railBtns.forEach((b, i) => {
  b.setAttribute("aria-label", `Go to chapter: ${CHAPTERS[i][0]}`);
  b.addEventListener("click", () => scrollToY(yForT(CHAPTERS[i][1])));
});

const storyTop = () => story.getBoundingClientRect().top + scrollY;
const storyLen = () => story.offsetHeight - innerHeight;
const yForT = (t) => storyTop() + (t / T_MAX) * storyLen();
const tForScroll = () => Math.min(T_MAX, Math.max(0, ((scrollY - storyTop()) / storyLen()) * T_MAX));

// Copy eases in; items marked data-blur also resolve from soft focus, like a lens pulling focus.
const ease = (x) => 1 - Math.pow(1 - x, 3);
const fade = (t, a, b, span) => {
  const inK = ease(Math.min(1, Math.max(0, (t - (a - span)) / span)));
  const outK = Math.min(1, Math.max(0, (t - b) / 0.22));
  return { o: inK * (1 - outK), dy: (1 - inK) * 26 - outK * 22, blur: (1 - inK) * 10 + outK * 6 };
};

let scene = null;
let lastT = -1;
let chart = null;
createChart(document.getElementById("chart"), "assets/data/eth-carry.json")
  .then((c) => { chart = c; lastT = -1; renderOverlay(scene ? scene.t : tForScroll()); })
  .catch((err) => console.error(err));

function renderOverlay(t) {
  for (const f of fades) {
    const { el, a, blur } = f;
    const { o, dy, blur: bl } = fade(t, a, outOf(f), blur ? 0.34 : 0.24);
    el.style.setProperty("--blur", `${(blur ? bl : bl * 0.4).toFixed(2)}px`);
    el.style.opacity = o.toFixed(3);
    el.style.visibility = o > 0.001 ? "visible" : "hidden";
    el.style.setProperty("--dy", `${dy.toFixed(1)}px`);
    el.classList.toggle("is-live", o > 0.5);
  }
  let cur = null;
  for (const li of specItems) if (li.classList.contains("is-live")) cur = li;
  specItems.forEach((li) => li.classList.toggle("current", li === cur));
  cue.style.opacity = t < 0.15 ? 1 : 0;
  bar.style.setProperty("--p", (t / T_MAX).toFixed(4));
  const hero = 1 - Math.min(1, t / 0.6);
  const spec = Math.min(1, Math.max(0, (t - 7.2) / 0.4));
  stage.style.setProperty("--vl", (1 - 0.3 * hero - spec).toFixed(3));
  stage.style.setProperty("--vr", "0");
  // the chart plays forward from 7.6 to 11.8
  chart?.draw(Math.min(1, Math.max(0, (t - 7.6) / 4.2)));
  let active = 0;
  CHAPTERS.forEach(([, ct], i) => { if (t >= ct - 0.6) active = i; });
  railBtns.forEach((b, i) => b.classList.toggle("active", i === active));
  rail.style.opacity = t < 0.3 || t > 7.3 ? 0 : 1;
  rail.style.pointerEvents = t < 0.3 || t > 7.3 ? "none" : "";
}

function onScroll() {
  const t = tForScroll();
  scene?.setProgress(t);
  // Text follows the scene's smoothed clock so copy and 3D stay in lock-step.
  if (!scene) renderOverlay(t);
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", () => { lastT = -1; onScroll(); });

// Price ticker (step 06)
const fmt = (n) => (n < 0 ? "−" : "+") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const tkPrice = document.getElementById("tk-price");
const tkSpot = document.getElementById("tk-spot");
const tkPerp = document.getElementById("tk-perp");

function tick({ t, price, spotPnl }) {
  if (Math.abs(t - lastT) > 1e-4) { renderOverlay(t); lastT = t; }
  if (t > 4.1 && t < 5.3) {
    tkPrice.textContent = "$" + Math.round(price).toLocaleString("en-US");
    tkSpot.textContent = fmt(spotPnl);
    tkPerp.textContent = fmt(-spotPnl);
  }
}

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

renderOverlay(tForScroll());

if (hasWebGL()) {
  import("./scene.js")
    .then(({ createScene }) => createScene(canvas, { reducedMotion }))
    .then((s) => {
      scene = s;
      scene.onTick(tick);
      scene.jump(tForScroll());
      new IntersectionObserver(([e]) => scene.setVisible(e.isIntersecting)).observe(story);
    })
    .catch((err) => { console.error(err); document.documentElement.classList.add("no-webgl"); });
} else {
  document.documentElement.classList.add("no-webgl");
}
