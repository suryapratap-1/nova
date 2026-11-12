# Nova — brief

## One line
A slow, fluid dive through a dark studio void toward a living glass sculpture. It should feel premium, futuristic and effortless.

## World
- Setting: an infinite near-black studio void, lit only by the sculpture and particles.
- Hero object: a liquid glass sculpture (noise-displaced sphere) with an iridescent violet/cyan rim that follows the cursor light.
- Supporting elements: thin orbit rings, a halo glow, a particle field that morphs between chapters.
- Ambient life: morphing particle cloud (GPU) and slow floating dust.
- Mood: precise, alive, luminous.

## Palette
- Base: #050507 · Text: #f2f0ff · Dim: #8d8aa3
- Glow: violet #7c5cff, cyan #4de1ff
- Accent (sparingly): acid lime #c8ff4d
- Final CTA: inverts to white (#f4f3ff) with ink text #0b0a12

## Type
- Display: Syne 800 (wide, expressive)
- Text: Inter Variable
- Labels: JetBrains Mono

## Chapters
| # | id | Heading | Shot | Particles | Signature |
|---|---|---|---|---|---|
| 0 | hero | Intelligence, sculpted. | front, sculpture right of centre | sphere shell | loader → letter blur-in + intro dolly |
| 1 | studio | statement | high and wide | tilted ring | pinned, words light up with scroll |
| 2 | work | What we build. | low, dramatic | double helix | pinned horizontal glass tilt cards |
| 3 | numbers | Built to perform. | across the wave field | wave grid | counters + outline marquee |
| 4 | contact | Let's build what's next. | dives into the core | aura shell | white-out, magnetic button |

## Performance rules
- Animate transform and opacity only, with no backdrop-filter over the canvas.
- Particles morph on the GPU, one WebGL canvas, DPR ≤ 2 (1.5 mobile), adaptive resolution governor.
- Skip rendering while hidden or fully covered by the white-out.
- Lower quality tier on touch devices. Reduced motion: native scroll, frozen idle motion, all text visible.
- `?shot=N` jumps to chapter N for review.
