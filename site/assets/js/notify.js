// Launch notification with the 20% offer. Opens by itself once when a visitor enters the site
// (arrival from another site, a link or an app like Instagram), not on every page change, and without
// storing anything on the device: "entry" is read from the referrer. Any [data-notify] button opens it too.
import { CONFIG } from "./config.js";

const AUTO_PAGES = ["home", "pricing", "learn", "team"];
const DELAY_MS = 2600; // after the intro coin has landed

function html() {
  return `
  <div class="notify" id="notify" role="dialog" aria-modal="true" aria-labelledby="notify-title" hidden>
    <div class="notify-box">
      <button type="button" class="notify-close" aria-label="Close">×</button>
      <div class="ask">
        <span class="deal">−20%</span>
        <h2 id="notify-title">Get notified at launch.</h2>
        <p>Bot 01 is in development. Leave your email and we'll send your 20% discount code when it launches.</p>
        <form novalidate>
          <input type="email" name="email" autocomplete="email" inputmode="email" placeholder="you@email.com" aria-label="Email address" required />
          <button class="btn btn-primary" type="submit">Notify me</button>
          <p class="err" role="alert"></p>
          <p class="fine">Launch emails only, unsubscribe anytime. See the <a href="datenschutz.html">privacy policy</a>.</p>
        </form>
      </div>
      <div class="done" hidden tabindex="-1">
        <span class="deal">−20%</span>
        <h2 style="margin-top:16px">You're on the list.</h2>
        <p>We'll email your code when Bot 01 launches. Until then, scroll through how it works.</p>
      </div>
    </div>
  </div>`;
}

async function send(email) {
  if (!CONFIG.formEndpoint) throw new Error("no form endpoint");
  const res = await fetch(CONFIG.formEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ form: "launch-notify", _subject: `Launch notify (20%): ${email}`, email, offer: "20% off at launch" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function initNotify(page) {
  document.body.insertAdjacentHTML("beforeend", html());
  const el = document.getElementById("notify");
  const form = el.querySelector("form");
  const input = form.querySelector("input");
  const err = form.querySelector(".err");
  let prevFocus = null;

  const open = () => {
    if (!el.hidden) return;
    prevFocus = document.activeElement;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("open"));
    // no auto-focus on touch screens: the keyboard would cover the offer
    if (!matchMedia("(pointer: coarse)").matches) input.focus({ preventScroll: true });
  };
  const close = () => {
    el.classList.remove("open");
    setTimeout(() => (el.hidden = true), 300);
    prevFocus?.focus?.({ preventScroll: true });
  };

  el.querySelector(".notify-close").addEventListener("click", close);
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-notify]")) { e.preventDefault(); open(); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.checkValidity()) { err.textContent = "Enter a valid email address."; input.focus(); return; }
    const btn = form.querySelector("button");
    btn.disabled = true; btn.textContent = "Sending…"; err.textContent = "";
    try {
      await send(input.value.trim());
      el.querySelector(".ask").hidden = true;
      const done = el.querySelector(".done");
      done.hidden = false; done.focus({ preventScroll: true });
    } catch (x) {
      console.error(x);
      btn.disabled = false; btn.textContent = "Notify me";
      err.textContent = "That didn't go through. Please try again in a moment.";
    }
  });

  let entry = true;
  try { entry = !document.referrer || new URL(document.referrer).origin !== location.origin; } catch { /* keep true */ }
  if (entry && AUTO_PAGES.includes(page)) setTimeout(open, DELAY_MS);
}
