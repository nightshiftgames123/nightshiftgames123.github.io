# الهروب — Robot Escape

A side-scrolling chase game: outrun the wall of fire, collect batteries before
your power drains, and unlock 50 robots with the stars you earn.

Play: <https://nightshiftgames123.github.io/robotescape/>

Everything lives in `index.html` — no build step, no dependencies. The rest of
this folder is the app shell (`manifest.webmanifest`, `sw.js`, `icons/`) and
the Android packaging setup in [`android/`](android/README.md).

## How it is put together

**Simulation is fixed at 60 Hz** and decoupled from the display. An accumulator
runs whole 1/60 s steps and the renderer draws once per `requestAnimationFrame`,
so the game feels identical on a 60, 90 or 120 Hz phone and slows down instead
of teleporting when frames are dropped. Long gaps (a backgrounded app) are
clamped rather than replayed.

**The world is device-independent.** It is always 520 world units tall; only the
width follows the screen aspect, clamped to 1.15–2.25. Level geometry, jump
heights and the wall's speed are therefore the same on every device. The canvas
is centred and letterboxed in portrait, where a hint suggests rotating.

**Nothing expensive happens per frame.** Glows are baked once into sprites, the
repeating scenery is baked into tiles that are blitted with parallax, and
gradients are created once per skin. The per-frame path never calls
`shadowBlur`, `createLinearGradient` or `fillText` — about 25 blurred fills per
frame in the first version, now zero, which is the single biggest win on mobile
GPUs. Off-screen platforms, batteries, spikes and pickups are skipped with a
binary search, particles come from a fixed pool, and the HUD only touches the
DOM when a value actually changes.

Measured with a canvas-op counter at 892×412:

| scene | canvas ops / frame before | after |
| --- | --- | --- |
| lab | 200 | 62 |
| city | 602 | 44 |
| ice | 222 | 67 |

**Quality adapts.** Device pixel ratio is capped (2× at best, 1× on low-end
hardware) and the game drops a tier by itself if frames run long, with one
chance to climb back. Add `?fps` to the URL to watch the counter.

**It behaves like an app.** Pointer-based touch buttons survive a finger
sliding off and never stick; the game pauses on background, blur and the
Android back button; a wake lock keeps the screen on; fullscreen and landscape
are requested on start; hits and pickups buzz. Progress is written to
`localStorage` off the hot path.
