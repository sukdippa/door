# Migration Handoff

This repo is a **prototype**, not the final site: its only job is to work out 3D
scroll behavior for a couple of full-screen WebGL scenes before a dev team
rebuilds them in the real site's stack. Next.js is just a convenient shell for
iterating — see [§7 Porting outside Next.js](#7-porting-outside-nextjs) — the
scenes are plain React + Three.js + GSAP and drop into any React app.

There are currently **two scenes**, each self-contained in its own folder
under `src/app/`:

| Folder | Route | Model | What it does |
|---|---|---|---|
| `src/app/hero/` | `/` (`page.tsx` lives one level up, at `src/app/page.tsx` — a Next.js routing requirement) | `door2.glb` | A door that opens as you scroll, camera dollies through it. 2D overlay: nav, wordmark, date, Register button, MLH badge, an animated arc. |
| `src/app/faq/` | `/faq` | `path.glb` | Camera flies along a baked path as you scroll, through an outdoor/sky scene. |

Each scene folder contains everything specific to that scene: its R3F
component and its tunable-constants file. `src/app/page.tsx` and
`src/app/faq/page.tsx` are the reference layouts for how the pieces compose —
`faq/page.tsx` lives alongside its scene's other files since Next.js
already requires it at that exact path; the home page's equivalent
(`src/app/page.tsx`) can't live inside `src/app/hero/` for the same reason
(routing needs it at the app root), so it imports from `./hero/` instead.

Shared pieces both scenes use live in `src/app/components/`:
`SiteNav.tsx`, `ArcStroke.tsx`, `ScrollAnimations.tsx`. `HeroLoadingOverlay.tsx`
also has two consumers but lives under `src/app/hero/` — it's the hero
scene's loading gate, reused as-is by the other scene for now (see the
comment at the top of the file; it's a placeholder pending a real loading
animation).

---

## 1. What to copy, per scene

**`src/app/hero/` / `src/app/faq/`:**

| File | Role |
|---|---|
| `R3FHeroScene.tsx` / `R3FPathScene.tsx` | The WebGL scene: loads the GLB, binds the baked scroll animation, clouds, lights, fog, bloom. The real renderer. |
| `doorSceneConfig.ts` / `pathSceneConfig.ts` | Tunable constants (lighting, fog, bloom, scroll distance, etc.) — these seed a Leva debug panel (dev-only) inside the scene component; see §5. |

**Shared (`src/app/components/`):**

| File | Role |
|---|---|
| `ScrollAnimations.tsx` | The intro reveal only (fades the black cover out, staggers the overlay in). No scroll-linked animation — that lives in each scene's `R3F*Scene.tsx`. |
| `SiteNav.tsx` | The glass nav pill (logo, links, socials). |
| `ArcStroke.tsx` | The self-drawing SVG arc behind the hero title (hero page only). |

**Host / glue:**
- `src/app/page.tsx` / `src/app/faq/page.tsx` — how the pieces are laid out together (the reference layouts).
- `src/app/globals.css` — the custom CSS classes and color tokens the components need (see §6).
- `src/app/layout.tsx` — font wiring (see §7's fonts note, §7.1).

**Assets** (`public/`): `door2.glb`, `path.glb`, `path-sky.hdr`, `logo.svg`, `nav-logo.svg`, `mlh.svg`.

---

## 2. Dependencies

```
three                        ^0.184.0
@react-three/fiber           ^9.6.1     (requires React 19)
@react-three/drei            ^10.7.7
@react-three/postprocessing  ^3.0.4
postprocessing               ^6.37.7
gsap                         ^3.15.0
leva                         ^0.10.1    (dev-only tuning panel — see §5)
```

Plus **React 19** and **Tailwind v4**.

---

## 3. The load handshake (the one piece of hidden coupling)

Nothing in a scene's 2D overlay is visible until its 3D assets finish loading.
This is wired through a **custom event + a DOM flag**, not React state:

1. `HeroLoadingOverlay` reads load progress via drei's `useProgress()`.
2. When loading completes it (after a 350 ms beat):
   - sets `document.documentElement.dataset.heroLoaded = "true"` (i.e.
     `<html data-hero-loaded="true">`), and
   - dispatches `window.dispatchEvent(new Event("hero:loaded"))`.
3. Consumers wait on that signal:
   - **CSS** — `[data-hero-loaded="true"] .hero-reveal { opacity: 1 }` reveals the
     nav, and (on the hero page) the logo, date, and button.
   - **`ScrollAnimations`** — runs the intro timeline.
   - **`ArcStroke`** — starts drawing the arc (hero page only).

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

## 4. The 3D models — hardcoded assumptions

Both scenes reach into their GLB **by node name**. If you re-export a model,
preserve these or update the matching `R3F*Scene.tsx`:

**`door2.glb`** (hero):
- **`Camera`** and **`door_inner`** — baked animation clips scrubbed together off
  scroll progress (see the long comment above `applyCameraKeyframe` in
  `R3FHeroScene.tsx` for why they share one absolute timeline instead of each
  being stretched to its own duration).
- **`propeller_actually`** — spun at a constant rate in real time (not its own
  baked, variable-speed clip).
- **`tree-leaves`** / **`tree-branch`** — bounding box defines the falling-leaves spawn volume.
- a material matching **`/bush/i`** — its texture is reused for the falling-leaf particles.

**`path.glb`** (faq):
- **`Camera`** — a baked keyframe animation IS the scroll path (position + rotation), scrubbed the same way.

Both models are Draco-compressed with webp textures via `npm run
optimize:glb:door2` / `optimize:glb:path` (`scripts/fix-foliage-alpha.mjs`
runs as a post-step — re-run after every Blender re-export, since Blender's
export clobbers the compression back to full size).

---

## 5. Scene tuning (Leva panel, dev-only)

Each scene mounts its own Leva debug panel (hidden outside `NODE_ENV=production`,
each with its **own store** — see the comment above `useCreateStore()` in either
`R3F*Scene.tsx` for why sharing Leva's default global store between the two
scenes was a bug). `doorSceneConfig.ts` / `pathSceneConfig.ts` values are only
the panel's *initial* values — drag the panel to iterate, then hit the
"Export" folder's "Log current values" button to print a config-file-shaped
object to the console, and copy the tuned numbers back into the `.ts` file.

None of this ships to production rendering logic — for a real migration, bake
your final tuned numbers into constants and you can drop the `leva` dependency
and the panel code entirely.

---

## 6. Global CSS the host must provide

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
canvas) — they're the `*_SUN_LIGHT_CONFIG` / `*_FOG_CONFIG` / etc. constants in
each scene's config file (§5).

---

## 7. Porting outside Next.js

Each scene is React + Three.js + GSAP; Next contributes very little. Checklist:

### 7.1 Fonts
The only hard Next dependency. The hero copy uses **Red Hat Display**, exposed
as the CSS variable `--font-red-hat` and consumed via the `font-redhat`
Tailwind utility; in this repo that variable comes from `next/font/google` in
`layout.tsx`. In your app, provide `--font-red-hat` however you load fonts (a
`@font-face`, `@fontsource/…`, or a Google Fonts `<link>`). If the variable is
missing, text just falls back to the default font — no error.

- **No `next/image` / `next/link` / `next/navigation`** are used in the scene
  code itself — plain `<img>` and `<a>`, fully portable. (`SiteNav.tsx` uses
  `next/link` for in-app navigation between the two scenes — swap for your
  router's link component, or a plain `<a>`.)
- **Static assets** — copy `public/*` into your static dir. Vite and CRA serve
  `public/` at the site root just like Next, so the `/door2.glb`, `/logo.svg`, …
  paths keep working.
- **`"use client"`** directives are harmless no-ops in a plain-React bundler (keep
  or strip them).
- **GLB loading** needs no bundler config — drei's `useGLTF` fetches it at runtime.
- **React 19 is required** by `@react-three/fiber` v9 + drei v10. Upgrade if you're
  on React 18 (or pin older r3f/drei).
- **SSR** — a plain SPA (Vite/CRA) is *simpler*; there's no server render to guard.
  Under an SSR React framework (Remix, etc.), render the `<Canvas>` client-only,
  since it touches `window`/`document`.

> The `AGENTS.md` / `CLAUDE.md` files in this repo are stock `create-next-app`
> scaffolding (they point AI coding agents at Next's bundled docs). They don't
> affect runtime — keep or delete freely. This is plain Next.js 16, not a fork.

---

## 8. Run locally

```bash
npm install
npm run dev
```

Open the app, let the loading overlay fade, then scroll: the door opens and the
camera moves through it. Click "FAQ" in the nav for the second scene. The
overlay (nav, title, date, button, arc) should reveal once loading completes.
