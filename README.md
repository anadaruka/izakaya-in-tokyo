# an izakaya in tokyo

A quiet, ambient scene: a small izakaya somewhere just outside Tokyo, painted
in soft watercolor light on a `<canvas>`. The lanterns lean into the wind,
steam rises off the kitchen, and silhouettes — men and women both — drift in
at random, sit at the counter for a while, and drift on.

The scene lives on **Tokyo time**. Through the day the sky moves through
dawn, pale noon, golden dusk and night. The shop opens at 5pm; at 5am the
noren comes in, the lanterns go dark, and the shutter rolls down until
evening. The caption under the painting tells you what time it is there.

There is nothing to click. You just look at it and be at peace.

Useful query params while playing with it:

- `?hour=21.5` — pin the clock to any hour (0–24)
- `?speed=10` — let ten simulated minutes pass per real second
  (`?hour=16.5&speed=10` shows the whole opening in about half a minute)

## How it works

Everything is drawn programmatically in [scene.js](scene.js) — no images.

- A static facade layer (signboard, interior, stools, street) and a static
  foreground layer (watercolor edge fade, vignette, paper grain) are painted
  once.
- Each frame: the sky is painted from a palette keyframed across 24 hours,
  the facade is drawn through a brightness/saturation filter for the hour,
  then the dynamic life goes on top — interior glow and flicker, the chef,
  steam, the noren and lanterns swaying on layered-sine wind, the pool of
  light on the street, and the people.
- The composed frame is then drawn once sharp and once blurred on top of
  itself, which gives everything its soft, watery edge.
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
