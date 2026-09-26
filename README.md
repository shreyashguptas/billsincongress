# Bills in Congress

**An independent, open record of every bill in the United States Congress — built from the government's own data and presented so an ordinary person can actually read it.**

Live at **[billsincongress.com](https://billsincongress.com)**

![The Bills in Congress home page: a chamber of dots showing the 119th Congress's bills by sponsor's party, with the 113 that became law in the inner rows, on a dark band above the question box](public/readme/preview.png)

---

## Why this exists

Congress.gov already publishes everything you need to follow legislation. But it is built for legislative staff, not for citizens. Titles are jargon, status codes are cryptic, and you have to know what you are looking for before you can find it.

Bills in Congress takes exactly the same primary data and reorganises it the way a newspaper of record would: clearly indexed, plainly labelled, fast to read, and honest about what it does and does not know.

It is free to read, has no ads, and you do not need an account to read anything on it. An optional paid plan, **Pro**, emails you when bills you follow move and raises the daily question allowance; nothing that was free before it existed went behind it.

---

## What's actually on the site

### The front page — one Congress at a glance

The home page is a dashboard for a single Congress at a time (the 119th by default; a picker switches between them).

It opens with **who's writing America's laws**, drawn like a chamber of Congress. The outer seats are every bill introduced, split by the sponsor's party; the inner seats are the bills that became law, one seat each. Hover a party to see its own numbers. A small "party not recorded" group counts bill numbers Congress.gov lists with no sponsor at all — in the 117th Congress, eleven House bill numbers held back for the Speaker and the Minority Leader — and the assistant can list them if you ask.

Right under the chamber is a box for asking a question. As you type, bills whose title or number matches appear under it straight away. Pick one to go straight to its page, or press Enter to ask your question instead. The one exception: if you typed a bill number that matches exactly one bill, Enter opens that bill. Under the box are three quick links built from the live numbers, such as the bills that became law this Congress. Each one opens the full list rather than asking the AI, which cannot read hundreds of bills at once.

Below that, it shows:

- **Four headline counts** — bills introduced, House bills, Senate bills, and how many became law.
- **Where bills stand** — the bills stuck in committee as one small block, and every bill that got further zoomed in, one square per bill, stage by stage. It is a blunt picture: in the 119th Congress, over 98% of everything introduced has not made it out of committee.
- **What Congress is working on** — a wheel of the biggest policy areas, one dot per group of bills, with full names and counts beside it.
- **Leading sponsors** — the ten members who introduced the most bills, as a bar chart coloured by party.
- **Where bills come from** — a map of the states shaded by how many bills their members sponsored, with a per-member view so big states don't win just by being big.
- **Introductions month by month** — bills introduced growing upward, laws signed growing downward, each on its own scale, ending in a written sentence naming the busiest and quietest months.
- **Volume across recent Congresses** — how this Congress compares with the two before it.

Nearly every number on the page is clickable. Click a stage, a sponsor or a state and you land in the bill list already filtered to it. A policy area on the current Congress takes you somewhere better: that topic's own browse page, which explains what the grouping means before it lists the bills.

### Every bill, browsable

`/bills` is the full browser. You can search by title or bill number, start typing a sponsor's name to pick them from a list, and filter by status, Congress, policy area (33 of them), state, date introduced, date last acted on, and bill type.

Each filter's own control displays what it is currently set to, with a running "N filters applied · Clear all" line under the row, and every filter is written into the address bar — so a filtered view can be bookmarked, shared, or walked back through with the browser's Back button. Filters are deliberately *not* remembered between visits, because silently re-applying last week's filters is how people end up staring at an unexplained empty page.

### Forty ways in

Between the front page and roughly 55,600 individual bill pages sit 40 browse pages: two by chamber (House, Senate), five by stage (introduced, in committee, passed one chamber, enacted, vetoed) and 33 by policy topic.

Each one is written as a document, not just a filtered list with a new heading. Every one carries a plain-language explanation of what that grouping actually means — what "in committee" really implies, why most bills stop there, what a concurrent resolution is for.

### A page for every bill

Each bill page shows the bill number and Congress, its policy area, the official title, when it was introduced, who sponsored it (with party and state), and a link to the official PDF where one exists.

Below that:

- **A status panel** naming the bill's current stage and showing, on a seven-step track, how far it has travelled from introduced to law. A vetoed bill's track stops at the President and says so.
- **"At a glance"** — a short plain-language paragraph assembled from the record itself. It contains no invented detail; every clause in it is a field the database actually holds.
- **The official plain-English summary**, when Congress has published one. Summaries are written some time after a bill is introduced, so coverage depends heavily on age: in a live sample of 120 bill pages, every bill checked from the 117th Congress had one, about 4 in 10 from the 118th did not, and about 7 in 10 from the current 119th did not. Where there is none, the page says so in words rather than leaving a blank.
- **Historical context for bills stuck in committee** — how long this one has been there, and what share of past bills that sat that long ever advanced. It is labelled as a description of that group of past bills, not a prediction about this one.

### Sharing a bill

Every bill page has a **Share** button. On a phone it opens your phone's own share sheet — Messages, WhatsApp, Mail, AirDrop, whatever you have — and on a computer one click copies the link. The link is always the bill's plain address, `billsincongress.com/bills/<bill>`, with nothing added to track who shared it or who opened it.

Paste that link into iMessage, WhatsApp, Slack, an email or a post, and it unfurls into a picture of where the bill stands: its current stage in large type and the same seven-step track as the page. The bill's number and title appear as the preview's own text underneath, so the picture does not repeat them. It is drawn from the record at the moment the preview is made, so it states the stage the bill is at then. A preview already sitting in a conversation is a picture and does not change when the bill moves later.

The home page and the status, chamber and topic pages unfurl the same way, into their headline figure for the current Congress — how many bills and resolutions were introduced and where they all stand, how many became law, how many a chamber introduced, how a topic ranks against the others. Every number on those pictures is a complete count; one the site could not count in full is left off rather than estimated.

### Ask the record

A question panel is available from every page — including the topic and status pages and the `/learn` guide — and it follows you as you move around the site, so a conversation survives navigation.

It adapts to the room it has. On a wide screen it docks to the right and you can drag it wider or narrower; the page and the navigation bar reflow beside it rather than being covered, and your chosen width is remembered. On a narrower window it sits alongside the page as a rail. On a phone it is a sheet that rises from the bottom, below the navigation, so you can still move around the site while it is open.

It also knows what you are looking at. Ask "what does this do?" on a bill page and it knows which bill; ask on a filtered list and it answers about those bills rather than all of them. If you tap a bill inside an answer, the panel steps aside so you can read it, and a bar offers to bring the conversation back exactly as you left it — including anything you had half typed.

It is not a general-purpose chatbot. It answers from this site's own database of Congressional records, and every source it cites is checked against the specific records it was actually shown. See [About the AI](#about-the-ai) below, which is the most important disclosure on this page.

### Follow a bill (Pro)

Every bill page has an **Email me updates** button. On Pro ($9 a month or $90 a year), it follows the bill: on any morning one of your followed bills has a new action or a new status, you get one email early in the morning (11:00 UTC, which is 6 or 7 AM Eastern depending on daylight saving), listing exactly what happened — each action quoted as Congress.gov records it, with a link back to the bill. No news, no email. Up to 100 bills per reader.

What "new" means is exact rather than approximate: each followed bill remembers the latest action date it has reported and a fingerprint of every action on that day, so a second action posted late for yesterday is still reported, and an action listed twice by two congressional offices appears once. Every email has a one-click unsubscribe that works without signing in.

Pro also raises the question limit from 100 a day to 500. Payment is handled by Stripe; card details never reach this site. Cancel from your account page at any time.

The [Pro page](https://billsincongress.com/pro) shows all of this in pictures. Your account page shows your plan, how many questions you have left today, and each bill you follow or saved with the stage it has reached.

### How Congress works

`/learn` explains how Congress works in pictures, simply enough for a child of about eight: one short caption per picture and no paragraphs.

- **Who is Congress?** People vote, they pick people to speak for them, and those people meet in two rooms. Both rooms are drawn seat by seat — all 435 House seats and 100 Senate seats — and picking your state fills in the seats it sends.
- **How an idea becomes a law**, in six pictures, each in the colour that stage has everywhere else on the site: the idea is written down as a bill, a small group checks it, one room votes yes, the other room votes yes, the President signs, and it is a law.
- **Most bills never make it:** 100 dots, 2 of them green. About 2 in 100 bills became law in the last two full Congresses (639 of 31,807, 2021–2024).
- Buttons onward to the bills that became law and to every bill.

The page is drawn on the server and ships almost no JavaScript of its own; the state picker is its only interactive part.

### On your Home Screen

The site installs like an app: on an iPhone or iPad, use **Share → Add to Home Screen** in the browser (the footer's **Install the app** button walks you through it); on Android, Chrome and Edge the footer button raises the browser's own install prompt. It then opens full screen from its own icon. On Android and on a computer, a long press or right-click on that icon offers shortcuts to all bills, bills that became law, and your saved bills.

It is the same site, not a copy: there is no offline reading and no push notification. If you open it with no connection you get a short "You're offline" page instead of the browser's error screen. The small background script that makes this work (a service worker) keeps that one page on your device and nothing else — no bills, no pages you have read.

### Reading comfort

The design is neutral on purpose. The site itself has no colour of its own: everything you click is black on off-white. Colour appears only where it carries information — a topic, a stage, a party — and party red and blue appear only where the data is about party. The rules are written down in [`Documentation/brand.md`](Documentation/brand.md).

Light, dark, and follow-your-system themes. A layout that works on a phone. Every animation on the site respects your operating system's "reduce motion" setting. Keyboard navigation, skip links, and screen-reader labels on the charts and seat diagrams. The bill lists and browse pages are server-rendered as ordinary links, so they still work with JavaScript switched off.

---

## Where the data comes from

Every bill record on this site comes from one place: the **[official Congress.gov API](https://api.congress.gov/)**, a public service of the Library of Congress. There is no scraping, no second provider, and no intermediary. (The one exception on the site is the assistant's clearly labelled web search — see [About the AI](#about-the-ai).)

| | |
| --- | --- |
| **Source** | Congress.gov API v3 (Library of Congress) |
| **Coverage** | The current Congress and the two before it — the 117th, 118th and 119th (2021–2026) |
| **Size** | 55,615 bills and resolutions as of 29 August 2026 |
| **Kinds of legislation** | All eight — House and Senate bills, joint resolutions, concurrent resolutions and simple resolutions |
| **Refresh** | Nightly, with weekly and monthly safety nets |
| **Data rights** | U.S. government work, public domain |
| **Affiliation** | Independent. Not affiliated with, endorsed by, or operated by the U.S. government |

A snapshot of what that holds, taken 29 August 2026:

| Congress | Years | Total | House | Senate | Became law |
| --- | --- | ---: | ---: | ---: | ---: |
| 119th | 2025–26 | 18,472 | 12,005 | 6,467 | 104 |
| 118th | 2023–24 | 19,315 | 12,556 | 6,759 | 274 |
| 117th | 2021–22 | 17,828 | 11,472 | 6,356 | 365 |

### How it stays current

Nine scheduled jobs keep the database in step with Congress, and a tenth sends bill-alert emails:

| When | What it does |
| --- | --- |
| Daily, 01:00 UTC | Pull every bill **in the current Congress** that Congress.gov reports as changed in the last 26 hours |
| Daily, 04:00 UTC | Rebuild the precomputed statistics behind the dashboard |
| Sunday, 02:00 UTC | Re-pull everything in the current Congress changed in the last seven days, as a safety net |
| Monday, 06:00 UTC | Compare the full live list for all three Congresses against ours and fetch anything missing entirely |
| Wednesday, 03:00 UTC | Repair bills that were only half-fetched |
| Friday, 04:30 UTC | Recompute the historical committee statistics shown on bill pages |
| 1st of the month, 05:00 UTC | Re-fetch the current Congress from scratch |
| Twice daily, 01:30 and 13:30 UTC | Tell search engines which bill pages changed |
| Daily, 11:00 UTC | Email Pro readers whose followed bills moved since their last alert |

The sync throttles itself deliberately — three quarters of a second between calls, backing off on rate limits and pausing when Congress.gov's remaining quota runs low. It also skips the bill-record update when nothing a reader would see has changed, so a routine re-pull does not stamp a fake "updated" date on 18,000 bills or announce fake updates to search engines.

The `/bills` page carries a live "Updated *n* hours ago" indicator drawn from the last completed sync.

### What is stored, and what is not

**Held:** a bill's identity and title, its sponsor, the date it was introduced, its action history (up to the 250 actions Congress.gov returns in one page), its official Congressional Research Service summary where one exists, its policy area and legislative subjects, and links to the official PDF and text versions.

**Not held — and the assistant is instructed never to claim otherwise:**

- Co-sponsors. Only the primary sponsor is stored.
- Vote tallies and roll-call results.
- Committee hearing schedules.
- Member biographies, committee assignments or contact details.
- Floor speeches and debate transcripts.
- The full legal text of bills. There is a link to the official PDF, not a copy of it.

### The one number computed here

A bill's position in Congress is **not** a field the government hands out. It is derived here, by reading the bill's action history into an eight-rung ladder:

| Stage | Label |
| ---: | --- |
| 20 | Introduced |
| 40 | In Committee |
| 60 | Passed One Chamber |
| 80 | Passed Both Chambers |
| 85 | Vetoed |
| 90 | To President |
| 95 | Signed by President |
| 100 | Became Law |

That derivation is a judgement, and it is the one place where this site could be wrong in a way Congress.gov is not. It is written down in the open, in [`convex/billStage.ts`](convex/billStage.ts), and it has tests. One example of what it has to handle: the Library of Congress attaches the same action code to both "Signed by President" and "Vetoed by President", which at one point caused real vetoes here to be displayed as bills signed into law.

### The summaries are Congress's own

The plain-English summary on a bill page is written by the **Congressional Research Service**, a nonpartisan government body. It is served here as plain text — the HTML markup is removed and the opening repetition of the bill's own title is trimmed. Nothing else is altered: no rewriting, no condensing, no AI.

---

## About the AI

The question panel is the only place in the interface where a machine writes prose you read. Here is exactly what it does.

**It reads this site's data, not the open internet** — with one labelled exception described below. The model cannot query the database freely. It picks from six curated datasets — bills, actions, official summaries, topics, sponsors and precomputed statistics — and passes filters to lookups written by hand on the server. It never writes a query of its own.

**Invented citations cannot reach you.** Every record handed to the model carries a reference handle. When the answer comes back, every handle it cited is checked against the exact records it was actually given that turn. Anything it made up is deleted from the text before the answer is displayed, and a bill card for a bill that does not exist simply does not render. The number of fabricated citations caught this way is tracked as a health metric. This filters the *citations*, not the sentences around them — the prose can still get something wrong.

**It is told to admit what is missing.** When a lookup returns nothing, the model is instructed to say the site does not hold it, or to run the labelled web search, rather than fall back on general knowledge. It is specifically told never to state co-sponsor counts, vote tallies or hearing schedules. These are prompt instructions, not hard blocks — unlike the citation check, nothing inspects the finished answer for them.

**Web search is a labelled exception.** When the answer genuinely is not in this site's data, the model may search the open web. When it does, it must state in one sentence what is missing here, and that sentence is shown to you word for word. Sources are then printed in two separate blocks: *From our database* and *Not from our database*.

**Your question is never handed to the search engine verbatim.** A search phrase is rejected before it leaves the server if it contains first-person words or simply repeats your question, so the model has to rephrase into a neutral query. Your question text does still go to the AI provider that writes the answer — that is unavoidable — but not to the search engine as you typed it.

**You can see its work.** When an answer involved lookups, it shows a log of them.

**The model itself:** DeepSeek V4 Flash, reached through OpenRouter. Requests carry zero-retention and no-training flags, a maximum price per million tokens so a repriced provider is skipped rather than silently billed, and an automatic failover chain if the primary is unavailable. Routing is pinned to a short allowlist of providers chosen for US data processing — OpenRouter's true region-locking is an enterprise feature, so this is an allowlist, not a hard geographic guarantee.

**Limits:** five questions a day without an account, 100 with a free one, 500 on Pro. Questions are capped at 2,000 characters.

**And the honest part:** AI answers can still be incomplete, outdated, or plainly wrong. The grounding machinery makes fabricated *sources* very hard, but it does not make the prose correct. Treat any answer as a starting point and click through to the record. For anything official, use Congress.gov.

---

## What is collected about you

The full detail is in the [Privacy Policy](https://billsincongress.com/privacy). The short version:

- **Product analytics run on every page** (PostHog, US cloud) — pages visited, clicks, performance, errors, and session replay. There is currently no cookie banner and no opt-out control on the site.
- **The text of questions you ask the assistant is included in that analytics data.**
- **Pressing Share is recorded** — which bill, and whether the link was shared, copied or cancelled. Not where it went or to whom: your phone's share sheet does not tell the site which app you picked, and the shared link carries no tracking code. Analytics also note whether you are using the site in a browser or as the installed app, and when the browser reports an install.
- **If you are not signed in, your conversation in the Ask panel is never stored.** It lives in the page and disappears when you leave. To be precise: each question is sent to the server along with the conversation so far, so the assistant can follow the thread — that part is unavoidable — but none of it is written to the database. The table that holds saved conversations requires an account, so an anonymous one cannot be recorded even by mistake. You are also issued a 60-day cookie holding a random ID, which is how the five-a-day limit is counted.
- **If you sign in, conversations are saved to your account**, visible only to you, and you can delete them one at a time or all at once. Signing in also links your analytics activity to your account, including your email address.
- **Account emails are sent through PostHog**: today that means the sign-up verification code, and the password-reset code once the reset page is built (see below). PostHog is the same company that runs the analytics. To deliver one, PostHog receives your email address and the message, keeps a record of the send (including the code, which expires after 15 minutes), and records whether it was delivered or bounced. These emails carry no tracking pixels and no rewritten links.
- **If you subscribe to Pro, Stripe handles the payment.** Your card details go to Stripe and never reach this site. What this site stores is your Stripe customer and subscription IDs, the plan's status and price, and when it renews or ends.
- **If you follow bills on Pro, the list of bills you follow is stored with your account**, along with when each was last emailed. Alert emails are sent through PostHog like the account emails, and PostHog keeps a record of each send. Alert emails carry no tracking pixels and no rewritten links.
- **No IP addresses are stored in this site's own database.**
- **Nothing is sold, and there are no ads or advertising trackers.**

An account is free and gets you three things: bookmarking bills, saved conversation history, and a higher daily question allowance. Pro, the one paid plan, adds bill alerts and a higher allowance still. Signed out, the header offers "Sign up" or "Sign in" depending on whether an account has been signed in on that browser before; it remembers that with a single local-storage flag (`bic_known_account`) holding no email or account id, kept after sign-out and never sent to the server. Account deletion is handled by emailing **hi@billsincongress.com** — there is no self-serve delete button yet. If you are on Pro, cancel first from your account page (Manage billing) so you are not charged again.

---

## Open by default

- **The code** is all here, MIT licensed. Every data transformation, every prompt, every guardrail.
- **The data** is public domain, published by the U.S. government. If you want it in bulk, take it from [Congress.gov](https://api.congress.gov/) directly rather than scraping this site.
- **The sitemap** lists every bill page — 55,000-plus URLs, split one file per Congress — so search engines can reach every bill rather than the handful a crawler could find by clicking.
- **[`/llms.txt`](https://billsincongress.com/llms.txt)** tells AI systems what this site is, how its URLs are built, and asks them to cite it with a link.
- **Crawler policy:** bots that answer someone's question and link back — ChatGPT search, Perplexity, Google, Bing, Apple — are welcome. Eighteen named crawlers that harvest content to train models are blocked in `robots.txt`. That is a request, not enforcement; it depends on the crawler honouring it.

---

## Known limits

Stated plainly, because they affect what you can trust:

- **Coverage stops at the 117th Congress.** Anything older is not here. A bill missing from a search is not evidence it does not exist.
- **A filtered list can still stop short of its own count.** The browse query gives up after scanning 1,200 records, so a filter whose matches are thinly spread can run out early. Filters by state, topic and status now use an index and return everything; other combinations may not — and when that happens the page says "partial list" rather than pretending it is the whole set. Search and the sitemap are the reliable ways to reach a specific bill.
- **Browsing is depth-capped** even without a filter — roughly 510 results on `/bills`, 500 on a browse page.
- **Search matches titles and bill numbers only**, never the text of a bill. A bill about a subject whose title does not mention it will not turn up that way.
- **Older Congresses are not actively refreshed.** The nightly, weekly and monthly jobs track the current Congress only; the Monday reconciliation adds bills that were never synced but does not re-check ones already stored. An upstream correction to a 2022 bill may not be picked up.
- **There is no documented or supported public API and no bulk download.** The backend does answer read-only bill queries without a key — that is what makes a local clone show real data — but it is not a supported interface and may change without notice. For bulk data, use Congress.gov.
- **Bill alerts trail Congress.gov.** They go out once a day, after the overnight sync, and Congress.gov itself can post an action a day or more after it happens. An alert says what the record shows, not what happened on the floor an hour ago.
- **Alerts cover actions and status only** — not new cosponsors, amendments, text versions or hearings, which this site does not store.
- **Password reset is not self-serve yet.** The back end can already email a reset code, but no page on the site starts that flow, so no reset email is ever sent today. Email hi@billsincongress.com and it gets done by hand.
- **Bill alerts are paid; saving a bill is not.** Saving bookmarks a bill for free; it does not email you.

If you spot something wrong, that is the most useful thing you can send. See below.

---

## How it's built

Not because you need to run it — nobody is expected to host their own copy — but because "you can read the code" only means something if the map is included.

| Layer | What it is |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Design | [shadcn/ui](https://ui.shadcn.com) components (Radix underneath) and Tailwind CSS, themed by the tokens in [`Documentation/brand.md`](Documentation/brand.md) — the design language: colour, type, logo, components |
| Backend | Convex — database, queries, scheduled jobs, and the answer stream |
| Accounts | Convex Auth: Google sign-in, or email and password with a one-time code emailed through PostHog Workflows |
| Payments | Stripe Checkout and the Stripe customer portal; a signature-checked webhook is the only thing that sets a reader's plan (`convex/billing.ts`) |
| Email | PostHog Workflows — sign-in codes sent inline (`convex/emailCodes.ts`); bill alerts and Pro plan-change notices scheduled from Convex (`convex/alerts.ts`, `convex/billing.ts` → `convex/email.ts`). Receipts and refunds come from Stripe |
| AI | OpenRouter, with the grounding and citation-checking layer in `convex/catalog/` and `convex/answer.ts` |
| Hosting | Cloudflare Workers via OpenNext, with Convex Cloud for the backend |
| Link previews | Share cards for the home page, bills and the status, chamber and topic pages, drawn on request with `next/og` from `lib/og/`, in the brand fonts, which are embedded |
| Installed app | A web app manifest (`app/manifest.ts`) and a service worker (`public/sw.js`) whose only job is the offline page |
| Analytics | PostHog |

```
Congress.gov API
      ↓   ten scheduled jobs (convex/crons.ts): nine sync, one alert email
Sync and repair (convex/congressApi.ts, convex/sync.ts)
      ↓
Convex database (convex/schema.ts) + precomputed statistics
      ↓
Queries (convex/bills.ts)          Grounded answers (convex/answer.ts, convex/catalog/)
      ↓                                        ↓
        Next.js App Router (app/) → Cloudflare Workers
```

Heavy analytics are never computed on page load. They are rebuilt overnight into dedicated tables so the dashboard reads a handful of rows instead of scanning 18,000 bills. That decision, and the reasoning behind it, is written up in [`Documentation/interactive-dashboard.md`](Documentation/interactive-dashboard.md).

The repository uses **pnpm**. `pnpm test` runs the test suite plus two repository-wide safety checks — one that stops any public backend function from accepting a user ID as an argument, and one that stops any publicly reachable path to the AI model from shipping without a rate limit. Both exist because of a real mistake. `pnpm cf:build` is the production build. Every pull request runs both, plus an automated code review, before it can merge.

To run it locally:

```bash
git clone https://github.com/shreyashguptas/billsincongress.git
cd billsincongress
pnpm install
cp .env.example .env.local
pnpm dev
```

The Convex URL in `.env.example` points at the **live production backend**, so a fresh clone shows real data straight away — and the AI panel and sign-in work too, because their credentials live on that deployment. That also means a local clone spends real AI budget and creates real accounts. Point `NEXT_PUBLIC_CONVEX_URL` at your own Convex deployment if you would rather develop against your own.

More detail lives in [`Documentation/`](Documentation) — an architecture overview, the dashboard deep-dive, and the analytics event registry.

---

## Corrections and contributions

If something on the site is wrong — a bill's status, a summary, a label, a broken page — **please [open an issue](https://github.com/shreyashguptas/billsincongress/issues)**. You do not need to know how to code. What you saw and what you expected is enough, and a correction is worth more here than a feature.

Code contributions are welcome too. Branch from `main`, run `pnpm test` and `pnpm cf:build`, and open a pull request describing what changed and why.

Anything else: **hi@billsincongress.com**.

---

## Independence and licensing

Bills in Congress is a public-interest project operated by OffGrid LLC, a Maryland limited liability company, which also sells the optional Pro plan. It is **not affiliated with, endorsed by, or operated by the United States government**. It is an educational and informational resource — nothing on it is legal or professional advice, and for official purposes you should rely on Congress.gov.

The legislative data is a work of the U.S. government and is in the public domain. The source code is released under the [MIT License](LICENSE) — free to use, copy, modify and distribute, including commercially.
