# Brand and design language

This is the source of truth for how Bills in Congress looks, reads and behaves.
Every colour, typeface, radius and component on the site comes from here. The
code carries each rule out in three places, and all three follow this file:

| Layer | File | What it holds |
|---|---|---|
| Tokens | `app/globals.css` | Every colour as a CSS variable, for both themes |
| Utilities | `tailwind.config.ts` | Those variables as classes (`bg-paper`, `text-ink-2`), the type scale, radii |
| Components | `components/brand/` | The logo and the pieces every page shares: status, party, section header |

Change a rule here first, then the code, in the same commit.

The palette, type, logo and components are also published as a Claude Design
system, "Bills in Congress", which the redesign mockups were drawn with. This
file is the canonical copy. If the two disagree, this file wins.

---

## Who it is for

Two audiences read the same pages:

- **People who follow Congress for work**: government affairs staff, policy
  analysts, journalists, advocates and compliance teams. They scan. They need
  exact stages and dates, stable links, and a source for every claim.
- **Citizens, students and teachers.** They read. They need plain language,
  the answer before the detail, and "what happens next" spelled out.

Both need to trust the page before they read it, and trust in news outlets
splits sharply by party. So the site does not look like a news outlet or a
campaign. It looks like the public record, drawn clearly.

## Principles

1. **Color belongs to the data.** The chrome (header, buttons, links, cards,
   focus) is ink on paper and nothing else. A hue always means something: a
   topic, a party or a stage. That is what makes the charts stand out, and it is
   what keeps the brand neutral. The brand has no party colour because it has
   no colour at all.
2. **Show the receipts.** Every figure has a label, a denominator and a source
   line. Every answer cites its records.
3. **Say less than you know, never more.** Show a total only when the whole set
   was read (see `convex/catalog/completeness.ts`). When a list is one page of a
   set, say so. An empty state beats a wrong number.
4. **The finding is the headline.** "98.4% of bills haven't made it out of
   committee." Not "Bill status breakdown".
5. **Plain first, the record one tap away.** The summary and the stage lead.
   The full text, the actions and the PDF sit one link down.
6. **Calm, then one moment of awe.** Each page gets one bold thing (the
   chamber on the home page, the status panel on a bill) and everything around
   it stays quiet.

## Voice

- Plain American English at about a ninth-grade reading level. Short sentences.
- Name things the way a reader would: "became law", not "enacted"; "in
  committee", not "referred".
- Facts before adjectives. No "shocking", no spin. "Only 113 bills became law"
  is fine, because 113 of 19,007 is the fact being stated.
- List parties alphabetically: Democrats, Independents, Republicans.
- Write a member as name, then party and state in mono: "Gary Peters · D-MI".
- Say who wrote what. The government writes the summaries (the Congressional
  Research Service), the site draws the charts, and the assistant answers with
  citations.
- Sentence case everywhere except eyebrows. No exclamation marks. No emoji.

## Colour

All colours are HSL triplets in `app/globals.css`, so Tailwind can add an alpha
(`bg-ink/5`). **Day** is the light theme, **Night** the dark one.

### The chrome

| Token | Class | Day | Night | Use |
|---|---|---|---|---|
| `--paper` | `bg-paper` | `#f6f5f1` | `#0b0d10` | Page ground. Stone-white, not cream |
| `--raised` | `bg-raised` | `#ffffff` | `#14171b` | Cards, inputs, the ask composer, menus |
| `--sunken` | `bg-sunken` | `#edece6` | `#1b1f24` | Quiet bands, hover fills, unfilled progress |
| `--ink` | `text-ink` | `#101418` | `#edeeea` | Headlines, body, every primary action |
| `--ink-2` | `text-ink-2` | `#4a515a` | `#b4b9c0` | Secondary text: standfirsts, labels, legend names (≥7:1) |
| `--ink-3` | `text-ink-3` | `#666d77` | `#8d949d` | Captions, keys, timestamps, placeholders (≥4.5:1) |
| `--on-ink` | `text-on-ink` | `#f6f5f1` | `#0b0d10` | Text and icons on an ink fill |
| `--line` | `border-line` | `#e2e1db` | `#23272d` | Hairlines between rows and sections |
| `--line-strong` | `border-line-strong` | `#858a92` | `#5f6670` | The edge of a control (≥3:1). A control never relies on `line` alone |
| `--error` | `text-error` | `#b3261e` | `#f2766b` | An error message and the field it names. Always with words |

There is no accent colour. Primary actions are ink with `on-ink` labels. Links
are ink with an underline (the `.link` class).

### The data

| Family | Tokens | Rule |
|---|---|---|
| Topics | `--topic-1` … `--topic-6` (`bg-topic-1`) | The six largest policy areas in rank order. Everything past six folds into one `ink-3` "Other" slice that says what it holds. Fills only, never text, and always with a legend: four slots are under 3:1 on paper |
| Parties | `--party-d`, `--party-r`, `--party-i`, `--party-u` | Muted, and only where the data is about party: seats, sponsor dots, party splits. Never for emphasis, alerts or errors. Independents are ochre so they never read as a blend of the other two |
| Stages | `--status-introduced` … `--status-law`, `--status-vetoed` | A cool-to-warm ramp from introduced to signed, ending in the site's only green, "became law". Vetoed is a desaturated slate, because it is a dead end rather than a step forward |
| State map | `--heat` | One amber, stepped by opacity in five bins, so it is never mistaken for a party or for "became law" |

### The stage

The home page's hero sits on the Night palette even in the Day theme. Give the
section `className="stage dark"`. The `dark` class switches every token inside
it, party and topic colours included, so the chamber looks the same in both
themes. It is the one dark band on a light page. Use it once per site.

### Contrast

- Body text is at least 4.5:1 on the grounds its token lists, in both themes.
- Control edges, the focus ring and icons that carry meaning are at least 3:1.
- Keyboard focus is the `.focus-ring` class: a paper gap, then a solid 2px ink
  ring. Every control gets it.

## Type

| Face | Variable | Class | Use |
|---|---|---|---|
| **Newsreader** | `--font-serif` | `font-serif` | Headlines, bill titles, summaries, the big figures. It picks its optical size from the font size |
| **Geist** | `--font-sans` | `font-sans` (default) | Everything a reader operates or scans |
| **Geist Mono** | `--font-mono` | `font-mono` | Bill numbers, counts, dates: anything that lines up |

All three load through `next/font/google` in `app/layout.tsx`.

| Class | Size / line | Use |
|---|---|---|
| `text-display-2xl` | 72 / 74 | The home hero only |
| `text-display-xl` | 56 / 59 | Page titles: a bill's name, "All bills", a hub |
| `text-display-lg` | 44 / 48 | A section headline that states a finding |
| `text-display-md` | 34 / 39 | A section headline that names a topic |
| `text-display-sm` | 26 / 31 | Panel titles, the sponsor's name, phone section headlines |
| `text-title` | 20 / 27 | Bill titles in lists. Clamp to three lines |
| `text-reading` | 19 / 31 | Bill summaries, Learn articles, at `max-w-measure` (680px) |
| `text-reading-sm` | 17 / 27 | Answers in the ask panel, reading on phones |
| `.label-eyebrow` | 11 / 16, caps, 0.14em | Section eyebrows. The only all-caps text on the site |
| `font-mono text-sm` / `text-xs` | 14 / 12 | Data and chart keys |

- Headings are Newsreader 500 (`font-medium`), set in `app/globals.css`, with
  `text-wrap: balance`. Use 600 only for the sponsor's name and the wordmark.
- Every number that sits in a row, a legend or a figure takes the `.tabular`
  class (lining, tabular figures).
- No italics for emphasis in the interface.

## Layout and shape

- **Width**: `.container-editorial` gives 1200px of content with 16/24/32px
  gutters. `.container-prose` gives 680px for reading.
- **Rhythm**: `py-16 sm:py-24` between sections on content pages. Sections are
  divided by a `border-line` hairline, not boxed.
- **Numbers** sit in a row of four with hairline dividers, not in cards.
- **Lists** are rows (the bill list is a register), not grids of cards.
- **Radius**: `rounded-xs` 2px for waffle squares and progress segments,
  `rounded-sm` 4px for status pills and filter chips, `rounded-md` 8px for
  buttons, cards and inputs, `rounded-lg` 14px for the ask composer, the status
  panel and sheets. `rounded-full` is only for seats, dots, avatars, starter
  questions and the send button.
- **Elevation**: borders carry structure. `shadow-float` is only for things
  that float over the page: the ask panel, menus, popovers.
- **Touch**: controls are 44px tall on touch screens (the `touchable:` variant).

## Components

**[shadcn/ui](https://ui.shadcn.com) is the component library.** Everything in
`components/ui/` is a shadcn/ui component (Radix underneath), themed to the
brand through CSS variables rather than restyled. Reach for one before writing a
control by hand: a button is `Button`, a modal is `Dialog`, a segmented switch
is `ToggleGroup`, a dropdown is `Select` or `DropdownMenu`, a loading
placeholder is `Skeleton`, an error box is `Alert`.

### How the theme reaches shadcn

shadcn/ui components read shadcn's semantic variables. `app/globals.css` points
each one at a brand token, so a component arrives on-brand with no edits —
including one added later:

| shadcn variable | Brand token | Note |
|---|---|---|
| `--background` / `--foreground` | `paper` / `ink` | |
| `--card`, `--popover` (+ `-foreground`) | `raised` / `ink` | Cards, inputs, menus, dialogs |
| `--primary` / `--primary-foreground` | `ink` / `on-ink` | The primary button is ink |
| `--secondary`, `--muted`, `--accent` | `sunken` | `accent` is shadcn's hover fill: neutral, never a hue |
| `--muted-foreground` | `ink-3` | |
| `--destructive` | `error` | Irreversible deletes and errors only |
| `--border` / `--input` / `--ring` | `line` / `line-strong` / `ink` | |

Two vocabularies, one rule: **files in `components/ui/` use shadcn's names**
(`bg-primary`, `text-muted-foreground`) so they stay as shadcn ships them;
**app code uses the brand names** (`bg-ink`, `text-ink-3`) so it reads the way
this document does. Both resolve to the same values.

### Adding a component

```bash
npx shadcn@2.3.0 add <component>
```

Version 2.3.0 is the last CLI for Tailwind 3, which this site uses. The CLI
writes to `components/ui/` and installs its Radix package; the enter/exit
utilities it relies on come from `tailwindcss-animate`, already installed. After
adding one, change only what the brand needs and say so in a comment. The
existing brand edits:

| Component | Brand edit |
|---|---|
| `Button` | Radius `rounded-md`; `outline` sits on `card` (raised) rather than the page; 44px on touch; `link` takes no box (no height or padding) |
| `Badge` | A `<span>` (badges sit inside text and links); 24px tall, sentence case, `rounded-sm`; `secondary` text is `ink-2` for contrast |
| `Dialog`, `Sheet` | Titles are Newsreader `display-sm`, not shadcn's bold sans; `hideClose` drops the corner close when the content has its own; the scrim is paper at 70% with a slight blur, not black (a dark scrim lightens nothing in Night); `shadow-float` |
| `Sheet`, `Popover` | Their own enter/exit keyframes, tuned before `tailwindcss-animate` was installed |
| `Input`, `Select` | On `card`, 15px text; the field and each option are 44px on touch |

### Brand pieces built on top

These live in `components/brand/` and compose the primitives above.

| Component | File | Rule |
|---|---|---|
| `Logo`, `ChamberMark` | `components/brand/logo.tsx` | See Logo, below |
| `StatusPill` | `components/brand/status.tsx` | A stage as a dot and a word, from `stageLabel()` in `lib/utils/bill-stages.ts`. Never fill the whole pill with the stage colour |
| `StageTrack` | `components/brand/status.tsx` | Seven equal segments. Reached segments take the current stage's colour. `labels` adds the step names (bill pages only) |
| `PartyTag`, `PartyDot` | `components/brand/party.tsx` | The dot is the only place party colour appears outside a chart |
| `SectionHeader` | `components/brand/section.tsx` | Eyebrow, a headline that states the finding (`finding` for the 44px size), one action on the right |
| `SourceLine` | `components/brand/section.tsx` | "Source: Congress.gov · Updated …" under every chart and every count |

Patterns that appear on more than one page:

- **Ask composer**: 60px tall, `rounded-lg`, raised, `line-strong` edge; the
  send button is a 40px ink circle. Starter questions are `rounded-full`
  outline pills in `ink-2`, each written from a live figure.
- **Chart legend**: rows 48px tall with a dot, the full name, the share and
  the count in mono. Names never go on a chart's rim.
- **Status panel** (bill page): `rounded-lg`, raised, the stage in
  `display-md` beside a `StageTrack` with labels.
- **Quiet band**: a `bg-sunken` full-width section for a closing call to action
  ("Ask the record").

What stays hand-built, on purpose:

- **The charts.** A seat, a slice or a waffle square is data, not a control, so
  the hemicycle, topic wheel, state map and the rest draw their own marks.
- **Rows and handles that are not buttons**: listbox options, suggestion rows,
  pagination links, the ask panel's resize handle and grab bars, whole-row
  history entries.
- **Caption-size text actions** ("Ask about this →", the work-log toggles),
  where `Button`'s height and padding would change the line they sit in.

## Charts

- Draw the whole set, one mark per bill or per a fixed number of bills, and
  put the unit on the chart: "each dot ≈ 17 bills", "outer seat ≈ 44 bills".
- Label directly or in an adjacent legend. Colour is never the only key.
- Hovering a legend row links it to its marks. Everything else drops to 35%.
- Motion explains, it does not decorate: seats fade in once, bars grow once.
  Nothing loops except the law glow on the odds chart. Everything stops under
  `prefers-reduced-motion`.

## Iconography

- [Lucide](https://lucide.dev) (`lucide-react`) at a 1.75 stroke: 16px in
  buttons, 20px in the header, always beside a word. The only icon-only
  buttons are menu, close, search and send, and each has an `aria-label`.
- Stages have fixed glyphs: Introduced `FilePlus`, Committee `Users`, Passed a
  chamber `Landmark`, President `PenLine`, Became law `ScrollText`, Vetoed
  `Ban`.
- No emoji. No eagles, flags or Capitol photographs. Civic clichés read as
  campaign material.

## Logo

- **The mark** is the chamber: six seats on the outer row, four on the inner,
  the well and the floor. It is the home page's hemicycle reduced to eleven
  dots.
- **The wordmark** is "Bills in Congress" in Newsreader 600 at -0.012em, 10px
  from the mark. Always those three words.
- **Colour**: ink on paper, or paper on ink. The spectrum version colours the
  six outer seats with `topic-1` … `topic-6` and the inner row `ink-3`. Use it
  once per surface, at 48px or larger. Never recolour the mark with party
  colours.
- **Small sizes**: below 32px use the favicon cut, which keeps five seats, the
  well and the floor.
- **Files**: `public/brand/`. `scripts/generate-icons.ts` builds every favicon
  and app icon from them, and `scripts/generate-og-image.ts` builds the social
  card.
- **Don't**: put it on a photograph, in a shield or badge, or beside a flag or
  eagle.

## Email

Every email is written by the site (`convex/emailStyle.ts` and one renderer per
email). PostHog only delivers it, wrapped in a plain shell on `paper`. Email
clients ignore CSS variables, web fonts and remote images, so the palette is
literal in `emailStyle.ts` and the faces fall back to system fonts (Georgia for
the wordmark and titles).

- **The card**: white (`raised`), a `line` hairline and 14px corners (`CARD`),
  on `paper`. Outlook squares the corners; nothing else changes.
- **The spectrum signs it**: `masthead()` opens every card with a six-band
  strip in the topic colours, and `footer()` closes it with six spectrum dots.
  The code emails put a band under each digit of the code.
- **Colour still means something**: a stage move gets its stage colour, as a
  `pill()` and the seven-step `stageTrack()`. "Became law" is the only green.
  A plan state gets one pill: Pro indigo, a heads-up amber, a problem the
  error red, the free plan grey. A bill with only a new action stays neutral.
- **Actions**: one ink button per email for the thing it is for. Repeated
  links (one per bill) are outlined pills.
- **Figures**: a digest opens with up to three numbers in a light sans with
  lining figures, divided by hairlines, like the site's figures.
- **Never**: images, tracking pixels, web fonts, or anything that breaks when
  remote content is blocked. A code stays one plain string, so it copies in
  one go.

## Accessibility

- Focus is visible on every control (`.focus-ring`).
- Touch targets are 44px.
- Party and stage are always a word as well as a dot.
- Every chart has a text alternative that states its totals.
- Both themes are designed. Neither is an inversion of the other.

## Adding something new

1. Build it from the components above and the tokens in `app/globals.css`.
   A colour literal in a component is a bug. The only exceptions are the chart
   components, which read the `--topic-*` and `--party-*` variables directly.
2. If it needs a colour that is not here, it is data (add a token and a row
   to "The data") or it is chrome (it is ink).
3. Check it in Day, Night, at 390px and at 1440px before calling it done.
