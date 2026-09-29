# MidenDelta Bot

Hedge fund strategies as trading bots that customers host themselves on their own Hyperliquid account.
Bot 01 is a delta-neutral ETH cash and carry (spot ETH long, equal ETH-perp short, collects funding).

```
site/   Static marketing site: home (scroll story), pricing + waitlist, learn (course + AI helper), performance
        (simulated research), team, Impressum, Datenschutz. No build step, everything self-hosted.
bot/    (next) the bot: Hyperliquid client, cash and carry engine, licence check, safe wind-down
```

Principles that keep this a software product rather than a financial service:
- The customer installs and runs the bot, with their own Hyperliquid API wallet (trade-only, cannot withdraw).
- MidenDelta never holds funds, never sees keys and never sends trading decisions; the licence server only says
  whether a licence is valid.
- Flat subscription, no performance fee, no promised returns.

Preview the site locally:

```bash
python3 -m http.server 5176 --directory site
```
