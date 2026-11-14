# Game Night — Rebuild Spec

Version 1.0 · 14 Nov 2026 · Owner: Toba

## 1. What it is

A party-game app for two settings: **a couple at home** and **friends gathered round**. You open it, say who's playing, pick a game, and play. It's free to share as a link, installs on a phone home screen, and works offline.

It replaces the Claude-artifact version. All existing games and content carry over, with bug fixes and a much clearer flow.

## 2. Decisions from the interview

| Topic | Decision |
|---|---|
| Multiplayer | **Both.** Pass-the-phone is the default. **Room mode** (everyone joins on their own phone with a 4-letter code) ships in this rebuild for quiz-style games. |
| Hosting | **Cloudflare**, auto-deployed from a GitHub repo, so every change pushed from chat goes live in about a minute. |
| First screen | **Pick who's playing first:** "Just the two of us" or "Friends are here". The library then shows only the games that suit that group. |
| Look | **Retro-futurist arcade**, a late-70s TV game-show set. |
| Name | **Game Night** |
| Fonts to avoid | Big Shoulders Display, Manrope, JetBrains Mono (Reel); Bowlby One, Figtree (old Game Night); Inter, Roboto, Arial, system UI. |

## 3. Users and the five-second test

- **The host** (usually Toba) holds the phone, sets players, picks games.
- **Guests** either watch the passed phone or, in room mode, join on their own phone by typing a code.

A first-time user must know what to do in five seconds. Every screen has **one obvious primary action**, in the tangerine accent and the bottom-third of the screen, reachable one-handed.

## 4. Flow

```
First run ─► Welcome (one screen, "Let's play")
            │
            ▼
      Who's playing?  ── "Just the two of us"  |  "Friends are here"
            │
            ▼
      Names (2 prefilled for couples; add up to 12 for friends, or teams)
            │
            ▼
      Game library (filtered to the group)  ◄── Surprise me
            │                         └──► Play on everyone's phones (room mode, friends only)
            ▼
      Game setup (level, rounds, categories: sensible defaults, one "Start" button)
            │
            ▼
      Play screen (card, timer, scoreboard)  ─► Round summary ─► Play again / Back to games
```

Return visits skip the welcome and land on the library for the last group used, with names remembered. "Change who's playing" is always one tap away in the header.

## 5. Games

Tags: C = couples, F = friends, R = room mode.

| Game | For | Mechanic |
|---|---|---|
| Famous Faces | C F R | Clear photo. Shout it out (with optional initials hint, -1) or Pick from four. 641 faces, levelled by real popularity. |
| Real or AI? | C F R | Two pictures or two texts. Asks either "Which is AI?" or "Which is real?". Green = correct answer, red only on a wrong tap. |
| World Decoder | C F R | Flags, shapes, capitals, famous facts, local slang, or mix. 99 countries, 4 levels. |
| Emoji Decode | C F | 9 categories, 4 levels, ~270 puzzles. |
| Bible Trivia | C F R | 4 levels; Extremely hard is genuinely hard. |
| General Knowledge | C F R | 4 levels. |
| Finish the Proverb | C F | Reveal and pick who got it. |
| How Well Do You Know Me? | C F | Hot seat types a secret answer, others guess. 105 questions. |
| Couple Questions | C | Conversation cards, no score. |
| Would You Rather | C F | 137 cards. |
| Who's Most Likely To | F | 133 cards, needs 3+ players. |
| Hot Seat | F | Question cards. |
| Two Truths and a Lie | C F | Topic cards. |
| Charades Sprint | F | 60s timer. |
| Don't Say It | F | 60s timer, banned words. |
| Name 5 in 10 | C F | 4 levels, 7 themes, 10/15/20s. |
| Name, Place, Animal, Thing | C F | Letter + 60s. |
| Your own games | C F | Made on the "Make your own" screen: cards, quiz, guess-the-answer, act-it-out. |

**Shared rules for all card games:** no card repeats within 5 draws, a random reshuffle when the pool runs out, and position remembered between sessions.

**Scoring:** points are always visible in a split-flap scoreboard. Harder levels score more. Scores can be adjusted (+/-) and reset, with undo.

## 6. Room mode

- **Host:** "Play on everyone's phones" → picks a quiz-style game → gets a 4-letter code and a big QR code → sees who has joined → Start.
- **Player:** opens the link (or scans) → types the code and a name → waits on a lobby screen → answers on their own phone.
- **Each question:** host's screen shows the question. Phones show the options, a countdown and a "Locked in" state. Then reveal: correct answer, who got it, points (faster = small bonus). Leaderboard between rounds.
- **Server:** one Cloudflare Worker with a Durable Object per room, using WebSockets. The host sends questions; the server never sends the answer to players before the reveal. Rooms expire after 2 hours idle.
- **Resilience:** players who drop reconnect automatically to the same seat. If the host drops, the room pauses with "Waiting for the host…". The codes avoid confusable letters (no I, O, 0, 1).

## 7. States (every screen)

| State | Treatment |
|---|---|
| Empty | Friendly copy plus one action, e.g. "No games of your own yet. Make one in a minute." |
| Loading | Skeleton shapes in the final layout (no layout shift); photos fade in over a fixed-ratio frame. |
| Error | Says what happened and how to fix it, e.g. "Can't reach the room. Check you're online, then tap Try again." |
| Success | Brief confirmation, e.g. "Saved", "You're in!" |
| Offline | A small banner. Pass-the-phone games keep working; room mode explains it needs internet. |
| Destructive | Removing players, games or scores always gives **Undo** for 6 seconds instead of a confirm dialog. |

## 8. Design system

**Concept:** a 1970s TV game-show set seen through a CRT: lacquered burgundy stage, chrome type, a marquee of warm bulbs, and one hot tangerine buzzer colour.

**Fonts** (Google Fonts):
- Display: **Bungee** (and **Bungee Shade** for the logo only). Marquee signage, scoreboard numerals.
- Body: **Chakra Petch**. Squared, techy, readable at small sizes.

**Palette** (CSS variables, single committed dark look):

| Token | Value | Use |
|---|---|---|
| `--stage` | `#1c0610` | page background |
| `--stage-2` | `#2b0a18` | raised panels |
| `--velvet` | `#4a0f26` | cards, borders |
| `--chrome` | `#efe6d8` | primary text |
| `--chrome-dim` | `#b9a99a` | secondary text (AA on stage) |
| `--buzzer` | `#ff6b1a` | the one signature accent: primary actions, focus |
| `--bulb` | `#ffd166` | marquee lights, highlights |
| `--right` | `#38e08c` | correct |
| `--wrong` | `#ff4d6d` | wrong |

**Type scale:** 12 / 14 / 16 / 20 / 25 / 31 / 39 / 61 px (1.25 ratio, with a 61px hero).
**Spacing:** 4, 8, 12, 16, 24, 32, 48, 64.
**Radius:** 4 for chips, 10 for cards, 999 for pills. No rounded white boxes.
**Shadows:** a hard offset "stage lip" shadow (0 6px 0 velvet) plus a soft bulb glow on focus.

**Signature details:**
1. **Split-flap scoreboard.** Digits flip on every score change, like a 70s station board.
2. **Chasing marquee bulbs** around the logo and around the active card while a timer runs.
3. **Card flip reveal** for answers.

All motion is disabled under `prefers-reduced-motion`.

**Texture:** faint CRT scan-lines and vignette over the stage (pure CSS, no images).

## 9. Accessibility and usability

- WCAG AA contrast for all text. Visible tangerine focus ring everywhere.
- Full keyboard: Tab order follows the visual order. Enter/Space activate. In quizzes, **1–4** pick options. **Space** = next. **Esc** = back.
- Semantic HTML (header, main, nav, buttons, lists), ARIA live region for scores and timers, alt text on every photo ("Mystery face" until revealed, then the person's name).
- Tap targets at least 44px, primary actions in thumb reach, works one-handed at 375px.
- No layout shift: fixed-ratio media frames, fonts preloaded with fallback metrics.

## 10. Tech

- **Vite + React 18 + TypeScript (strict)**, ESLint and Prettier.
- **Cloudflare Worker with static assets**, plus a **Durable Object** for rooms (SQLite-backed, works on the free plan). One `wrangler.jsonc`.
- **PWA:** web manifest, home-screen icon, and a service worker that caches the app shell. Photos cache as they're seen, plus a "Save everything for offline" button in Settings.
- **Content:** TypeScript modules for questions. Faces and Real-or-AI images ship as static JPEGs with a JSON manifest. No IndexedDB unpacking anymore.
- **Your own data** (players, scores, decks, custom games, your own photos) stays on the device in localStorage/IndexedDB.
- **Credits page** linking every Wikimedia Commons photo to its source and licence, as their licences require when the app is public.
- **Deploy:** GitHub repo → Cloudflare Workers Builds → live in about a minute on each push.

## 11. Out of scope for this build

- Accounts and cloud sync of scores.
- AI-generated rounds inside the app (that only worked inside Claude).
- More Real-or-AI pairs. These can be added later in batches without code changes, by dropping files into the pack.

## 12. Done means

- `npm run build`, `npm run typecheck` and `npm run lint` all pass.
- Screenshots at 375, 768 and 1440 px of: welcome, group picker, names, library, setup, each game type mid-play, reveal, summary, make-your-own, settings/offline, room host lobby, room player join, room question, room results, plus empty, loading and error states.
- A fresh reviewer agent has critiqued it against this spec, and the real issues are fixed.
- It's live on Cloudflare, and a push from chat redeploys automatically.
