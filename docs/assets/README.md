# README artwork

## Steampunk cache graphic

Asset: `pi-fabric-pair-cache-steampunk.png`

Generated with the built-in image generation tool as the current README hero.
The twin instruments distinguish session history, active context, and provider
cache. Main's 80% and Worker's 60% are illustrative last-request cache-read shares,
not live telemetry, cache fullness, or guaranteed residency.

### Generation prompt

```text
Use case: stylized-concept
Asset type: a completely new, spectacular steampunk educational hero graphic for the pi-fabric-pair README. No reference image; invent a fresh composition.
Primary request: explain cache levels and the distinct memory/context/cache concepts in BOTH Main and Worker, with cache-read gauges as the unmistakable visual focus.

Art direction: an exquisite Victorian scientific instrument cabinet, a museum-quality steampunk cutaway painted with cinematic realism and the precision of an engraved engineering plate. Two imposing brass-and-glass inference engines stand side by side on carved dark wood, with weathered copper, oxidized verdigris, finely machined gears, riveted collars, capillary tubes, warm gaslight, softly glowing glass, discreet vapor, and dramatic shadow. Rich tactile material detail, jewel-like instrument faces, extraordinary craftsmanship. The mood is ingenious, mechanical, warm, and wondrous. Clean editorial hierarchy, generous space between important elements. Avoid the flat modern dashboard aesthetic.

Composition: wide landscape around 16:10, high resolution, readable at GitHub width. An elegant small engraved project nameplate at top reads "PI FABRIC PAIR". MAIN is the left engine, WORKER is the right engine. On each engine, an enormous beautiful round instrument gauge dominates the upper part. Its exact heading reads "CACHE READ" and its subheading "LAST REQUEST". The Main gauge prominently reads "80%" and the Worker gauge reads "60%". These are historical example cache-read shares, not tank fullness, TTL, live metrics, or model residency. Show needles approximately aligned to their respective percentages, with clear different angles. A single brass plaque near the gauges states "ILLUSTRATIVE READINGS".

Below each giant gauge, make three distinct vertically stacked cutaway compartments with highly legible engraved labels. From top to bottom:
"PROVIDER CACHE" - a remote-provider cache metaphor represented by a glass bank of fading glowing token tiles; its lifetime is provider-controlled. This section is distinct from the local mechanisms below.
"ACTIVE CONTEXT" - a bounded, visibly finite chamber holding a selected set of illuminated pages.
"SESSION HISTORY" - a durable archive of coiled paper tape and indexed brass memory cylinders.
Both engines must have the same three labels and their own independent contents. The repeated labels must not be exchanged, scrambled, or omitted.

Two thin central coordination routes carry an abstract task card from Main to Worker and a small reviewed code diff back. Their only labels are "TASK" and "REVIEW". These routes connect the work mechanisms, never the provider-cache compartments: do not depict shared cache storage or cache transfer between Main and Worker.

A crisp readable footer plate contains exactly these two lines:
"HISTORY PERSISTS. CONTEXT IS FINITE. CACHE CAN EXPIRE."
"CACHE READ SHARE IS NOT CACHE FULLNESS."

Prioritize the giant cache-read instruments and distinguishable layers over decorative machinery. Keep all listed words correctly spelled, in ASCII, with engraved yet highly readable typography. Only use the quoted text labels; abstract line marks for code and paper content. No additional prose, invented technical cache tiers (no L1/L2/L3), provider logos, CPUs/GPUs, robots, people, shields, padlocks, extra workers, tiny illegible annotations, watermarks, or claims of guaranteed warm caches. This is a conceptual illustration, not a screenshot.
```

## Original workflow illustration

Asset: `pi-fabric-pair-hero.png`

Generated with the built-in image generation tool for this repository. The image
is a conceptual illustration of the Main/Worker review loop, not a screenshot.
Resolution: 1672 x 941 pixels.

## Generation prompt

```text
Use case: stylized-concept
Asset type: wide GitHub README hero illustration for the open-source project pi-fabric-pair.
Primary request: create a striking, polished editorial illustration that makes a persistent, reviewed AI coding partnership understandable at a glance.
Subject: exactly two terminal-like computing modules, MAIN and WORKER, linked in a continuous loop. Main holds a conversation and a small plan; Worker holds a code document and a visible stack of retained conversation sheets. A compact inspection lens over a code diff on the return route represents review. The same Worker is reused on the next step. This is one Main and one Worker, not a swarm.
Composition: wide landscape, approximately 16:9; enough breathing room to read cleanly at GitHub content width. Main on the left and Worker on the right follows the workflow's reading order. One clear upper path runs Main to Worker for a bounded task; one lower return path carries a diff back to Main through the review point. Use restrained arrowheads for direction. No extra computers.
Style/medium: premium isometric industrial-design illustration, sculpted physical terminal modules and glass conversation panes, fine circuit-like connections, subtle surface grain, clean precise geometry, dramatic but restrained light, deep ink background with luminous contrasting paths. The scene should feel like a carefully designed tool for developers, not stock robot art.
Text (verbatim): only "MAIN", "WORKER", "REVIEW" in large crisp ASCII uppercase labels beside their respective parts. No other text, no tiny simulated words, no title or slogan.
Constraints: communicate conversation persistence and review before the next work step. Do not suggest parallel workers, autonomous deployment, guaranteed correctness, a security sandbox, or a provider brand. Use abstract line marks for code. Keep every element legible, with no decorative clutter, human figures, robot faces, padlocks, shields, logos or watermarks. Produce a finished raster image.
```
