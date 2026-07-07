# an izakaya in tokyo

A quiet, ambient scene: a small izakaya somewhere just outside Tokyo, painted
in soft watercolor light on a `<canvas>`. The lanterns lean into the wind,
steam rises off the kitchen, and silhouettes drift in at random, sit at the
counter for a while, and drift on.

There is nothing to click. You just look at it and be at peace.

## How it works

Everything is drawn programmatically in [scene.js](scene.js) — no images.

- A static background layer (facade, signboard, interior, stools, street) and
  a static foreground layer (watercolor edge fade, vignette, paper grain) are
  painted once.
- Each frame, the dynamic life is drawn between them: the interior glow and
  its flicker, the chef, steam, the noren and lanterns swaying on layered-sine
  wind, the pool of light on the street, and the people.
- People are a tiny state machine: walk in → sit down → stay (20–60s) →
  stand up → walk away. Passers-by cross without stopping. Arrival times are
  random, so the shop is never the same twice.
- Respects `prefers-reduced-motion` by rendering a single still painting.

## Run locally

Any static server works:

```
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Deploy

Static site, no build step — import the repo into Vercel and it just works.
