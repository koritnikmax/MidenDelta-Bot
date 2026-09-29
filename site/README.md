# MidenDelta Bot website

Static site with no build step. Everything is self-hosted (no CDN, no Google Fonts): three.js, Lenis and Chart.js in
`assets/vendor/`, Geist fonts in `assets/fonts/` (SIL OFL). No cookies and nothing in browser storage.

```
index.html       scroll story: piggy bank (your account) -> spot -> short -> delta 0 -> funding -> specs chart; setup, roadmap
pricing.html     plans (indicative early-access prices) and the waitlist form (Formspree)
learn.html       video course outline and the AI helper (both coming with early access)
performance.html public strategy research: simulated ETH carry backtest at 3x
team.html        founders (edit assets/js/team.js, photos in assets/team/)
impressum.html, datenschutz.html   legal notice and privacy policy (German)
assets/js/scene.js   the 3D scene, driven by story time t (0 -> 11)
assets/js/chart.js   trading-terminal chart in the specs (ETH candles, simulated position, funding), plays with the scroll
assets/js/notify.js  launch popup (20% off): opens once on arrival (referrer check, nothing stored), [data-notify] opens it
assets/data/eth-carry.json  3-day ETH candles (Hyperliquid API) joined with the simulated funding series
assets/js/config.js  form endpoint, contact email
```

Preview locally:

```bash
python3 -m http.server 5176 --directory site
```

Deploy: `.github/workflows/pages.yml` publishes this folder to GitHub Pages on every push to `main`.
