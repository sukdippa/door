# Hero Section — Migration Handoff

This repo contains **one thing worth porting: the hero section** — a full-screen
WebGL scene of a door that opens as you scroll (with a camera dolly through it),
plus a 2D overlay (nav, wordmark, date, Register button, MLH badge, an animated
arc), all sequenced off a load handshake.

It's built with **React + Three.js + GSAP**. Next.js is just the shell — see
[§10 Porting outside Next.js](#10-porting-outside-nextjs) — so it drops into any
React app.

---

## 1. What to copy

**Components** (`src/app/components/`):

| File | Role |
|---|---|
| `R3FHeroScene.tsx` | The WebGL scene: loads the GLB, binds the door-open + camera dolly to scroll, clouds, falling leaves, lights, bloom. The real renderer. |
| `HeroLoadingOverlay.tsx` | Loading gate. Watches asset load progress and fires the `hero:loaded` handshake (see §3). |
| `ScrollAnimations.tsx` | The intro reveal only (fades the black cover out, staggers the overlay in). No scroll animation — that's in `R3FHeroScene`. |
| `SiteNav.tsx` | The glass nav pill (logo, links, socials). |
| `ArcStroke.tsx` | The self-drawing SVG arc behind the title. |

**Host / glue:**
- `src/app/page.tsx` — how the pieces are laid out together (the reference layout).
- `src/app/globals.css` — the custom CSS classes and color tokens the components need (see §7).
- `src/app/layout.tsx` — font wiring (see §8).

**Assets** (`public/`): `door.glb`, `logo.svg`, `nav-logo.svg`, `mlh.svg`.

---

## 2. Dependencies

```
three                        ^0.184.0
@react-three/fiber           ^9.6.1     (requires React 19)
@react-three/drei            ^10.7.7
@react-three/postprocessing  ^3.0.4
postprocessing               ^6.37.7
gsap                         ^3.15.0
```

Plus **React 19** and **Tailwind v4** (see §9). No `leva`, no `lottie` — those
were dev-only / unused and have been removed.

---

## 3. The load handshake (the one piece of hidden coupling)

Nothing in the overlay is visible until the 3D assets finish loading. This is
wired through a **custom event + a DOM flag**, not React state:

1. `HeroLoadingOverlay` reads load progress via drei's `useProgress()`.
2. When loading completes it (after a 350 ms beat):
   - sets `document.documentElement.dataset.heroLoaded = "true"` (i.e.
     `<html data-hero-loaded="true">`), and
   - dispatches `window.dispatchEvent(new Event("hero:loaded"))`.
3. Three consumers wait on that signal:
   - **CSS** — `[data-hero-loaded="true"] .hero-reveal { opacity: 1 }` reveals the
     nav, logo, date, and button.
   - **`ScrollAnimations`** — runs the intro timeline.
   - **`ArcStroke`** — starts drawing the arc.

**Both signals must survive migration.** The event is for listeners already
mounted when it fires; the attribute is for anything that mounts later and missed
the event. Drop either and part of the reveal silently never happens.

> **If you don't use the R3F loader / overlay:** replicate the handshake with two
> lines once your scene is ready:
> ```js
> document.documentElement.dataset.heroLoaded = "true";
> window.dispatchEvent(new Event("hero:loaded"));
> ```

---

## 4. The 3D model (`door.glb`) — hardcoded assumptions

The scene reaches into the GLB **by node name**. If you re-export the model,
preserve these or update `R3FHeroScene.tsx`:

- **`door_inner`** — the mesh that rotates open. Missing → console warns and the
  door won't animate.
- **`tree`** and **`tree.001`** — their combined bounding box defines the volume
  the falling leaves spawn in.
- a material whose name matches **`/bush/i`** — its texture is reused for the
  falling-leaf particles (keeps the art consistent).

The scene also uses the GLB's **embedded camera** (`cameras[0]`) as the start/end
camera pose. `door.glb` is Draco-compressed with webp textures (rebuilt via the
`optimize:glb` npm script + `scripts/fix-foliage-alpha.mjs`); the raw model isn't
in the repo.

---

## 5. How the scroll works

`R3FHeroScene` attaches a GSAP `ScrollTrigger` to the element whose id matches its
`triggerId` prop (`"door-hero"`), **pins** it, and scrubs the door rotation +
camera dolly over `HERO_SCROLL_DISTANCE = "+=460%"` (defined at the top of
`R3FHeroScene.tsx` — this constant is how far you scroll to fully open the door).

The host element must be tall/positioned right:
```jsx
<section id="door-hero" className="relative h-screen overflow-hidden"> … </section>
```

---

## 6. Layout & z-index stack

The overlay layers over the canvas in this order (all are Tailwind arbitrary
z-index utilities — translate to real `z-index` if you're not on Tailwind v4):

| Layer | z-index |
|---|---|
| WebGL canvas | `z-0` |
| Arc | `z-10` |
| Intro black cover | `z-20` |
| Centered title / date / button | `z-30` |
| Nav + MLH badge | `z-100` |
| Loading overlay | `z-120` |

---

## 7. Global CSS the host must provide

These live in `globals.css` and the components depend on them:

- `.glass-pill` (+ `.glass-button` variants + `.glass-button:hover`) — the frosted
  nav/button.
- `.hero-reveal` (+ `.hero-reveal--title`) and the `[data-hero-loaded="true"]
  .hero-reveal` trigger — the reveal mechanism (§3).
- `.text-glow-white` / `.text-glow-blue` — the title/text glows.
- `.loading-scroll` + its `@keyframes` — the loading indicator.

### Restyling colors

All the hero's **CSS** colors are tokens at the top of `globals.css` — change them
in one place:

```css
--hero-navy         /* frosted-glass pill tint */
--hero-blue         /* blue glow + lit-glass edge */
--hero-border       /* glass pill border */
--hero-bg           /* page background behind the hero */
--hero-load-from    /* loading overlay gradient (top) */
--hero-load-to      /* loading overlay gradient (bottom) */
--hero-glow-white   /* white text glow */
--hero-shadow       /* glass drop-shadow base */
```

The **WebGL scene** colors are a separate system (CSS can't reach into the
canvas). They're named constants at the top of `R3FHeroScene.tsx`: `SUN_COLOR`,
`CLOUD_COLOR`, `FOG_COLOR`.

---

## 8. Fonts

The hero copy uses **Red Hat Display**, exposed as the CSS variable
`--font-red-hat` and consumed via the `font-redhat` Tailwind utility. In this
repo that variable is created by `next/font/google` in `layout.tsx`. In your app,
provide `--font-red-hat` however you load fonts (a `@font-face`, `@fontsource/…`,
or a Google Fonts `<link>`). If the variable is missing, text just falls back to
the default font — no error.

---

## 9. Scene tuning (formerly Leva)

The scene used to have a Leva debug panel; those values are now **baked into
constants** at the top of `R3FHeroScene.tsx` so there's no dev UI to ship. Edit
these to retune the look:

| Constant | Controls |
|---|---|
| `LEAVES_CONFIG` | falling-leaf count / speed / sway / size / spin |
| `FOG_CONFIG` | fog color + near/far |
| `CLOUD_CONFIG` | cloud visibility / opacity / drift speed |
| `SUN_LIGHT_CONFIG` | key light intensity / color / position |
| `AMBIENT_LIGHT_CONFIG` | ambient fill intensity |
| `BLOOM_CONFIG` | bloom intensity / threshold |
| `ENVIRONMENT_CONFIG` | environment/background intensity + tone-mapping exposure |

---

## 10. Porting outside Next.js

The hero is React + Three.js + GSAP; Next contributes very little. Checklist:

- **Fonts** — the only hard Next dependency. Re-provide `--font-red-hat` in your
  own font setup (§8).
- **No `next/image` / `next/link` / `next/navigation`** are used — plain `<img>`
  and `<a>`, fully portable.
- **Static assets** — copy `public/*` into your static dir. Vite and CRA serve
  `public/` at the site root just like Next, so the `/door.glb`, `/logo.svg`, …
  paths keep working.
- **`"use client"`** directives are harmless no-ops in a plain-React bundler (keep
  or strip them).
- **GLB loading** needs no bundler config — drei's `useGLTF` fetches it at runtime
  (`next.config` here is empty).
- **React 19 is required** by `@react-three/fiber` v9 + drei v10. Upgrade if you're
  on React 18 (or pin older r3f/drei).
- **SSR** — a plain SPA (Vite/CRA) is *simpler*; there's no server render to guard.
  Under an SSR React framework (Remix, etc.), render the `<Canvas>` client-only,
  since it touches `window`/`document`.

> The `AGENTS.md` / `CLAUDE.md` files in this repo are stock `create-next-app`
> scaffolding (they point AI coding agents at Next's bundled docs). They don't
> affect runtime — keep or delete freely. This is plain Next.js 16, not a fork.

---

## 11. Run locally

```bash
npm install
npm run dev
```

Open the app, let the loading overlay fade, then scroll: the door opens and the
camera moves through it. The overlay (nav, title, date, button, arc) should
reveal once loading completes.
