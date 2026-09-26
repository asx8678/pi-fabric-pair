# README images

## Technical diagrams

Three illustrations explain the active Pair runtime. Generated with the built-in
imagegen tool; the [exact prompts](technical-diagram-prompts.md) are retained for
updates. The existing cache-engine hero remains illustrative artwork.

| Image | Explains | Implementation sources |
| --- | --- | --- |
| [Runtime architecture](pi-fabric-pair-architecture.png) | Main's controller, a persistent RPC worker, the report file channel, and local storage. | [Role selection](../../src/extension.js), [controller](../../src/controller.js), [runtime](../../src/actor-runtime.js), [RPC transport](../../src/rpc.js). |
| [Review and revision loop](pi-fabric-pair-review-loop.png) | Dispatch, report/yield, settled execution, frozen evidence, inspection, and hash-bound approval. | [Main tools](../../src/main.js), [worker report and gates](../../src/worker.js), [controller decisions](../../src/controller.js), [evidence capture](../../src/evidence.js). |
| [Persistent context](pi-fabric-pair-context.png) | Separate conversations, state restoration after compaction, and last-request cache observations. | [Main lifecycle](../../src/main.js), [worker lifecycle](../../src/worker.js), [cache measurements](../../src/metrics.js), [native warming integration](../../src/warming.js). |

### Reading the diagrams

The architecture has two model-bearing processes. `PairController`, `PiRuntime`,
and `PiRpc` run inside Main's process. RPC carries commands and native lifecycle
events. `pair_report` latches a report in `latch.json` before publishing it to
`workers/<id>/inbox/<reportId>.json`; a UI notification only wakes the controller.
The worker edits source directly in the implementation workspace.

The review diagram follows a code-review report. Questions and blockers can
return earlier through the same reporting channel. The worker yields its lease
before the controller checks settlement, runs configured verification, and
captures/rechecks source. Main must inspect the checkpoint before approving its
exact hash. Source changes make that approval stale; checks must pass when
`requirePassing` is enabled. A completed task leaves its worker session retained.

The context diagram distinguishes conversations from durable coordination and
provider cache observations. Relevant user constraints must be in the work order.
After native compaction, Pair queues a bounded task-state packet with
`deliverAs: 'nextTurn'` and `triggerTurn: false`. Cache-read share is
`cacheRead / (input + cacheRead + cacheWrite)`, measured separately for each role's
last request. Optional native warming is off by default, requires a compatible
SDK, can incur paid usage, and does not guarantee cache hits.

These images describe the active extension/controller runtime, not the separate
ActorHost implementation plans. For full details and scope boundaries, see
[Architecture](../ARCHITECTURE.md) and [Reference](../REFERENCE.md).

## Hot piston cache engines

Asset: `pi-fabric-pair-hot-cache.png`

Current README hero, edited with built-in image generation from the previous
pressure illustration. Two massive hot pistons squeeze steam into narrow glowing
chambers. Main's 99% and Worker's 100% are illustrative last-request cache-read
shares, not measured or guaranteed performance.
Resolution: 1672 x 941 pixels.

### Generation prompt

```text
Use case: style-transfer
Asset type: simplified README hero artwork for pi-fabric-pair.
Input image: edit the supplied Main/Worker piston artwork. Preserve the two roles and 99% / 100% cache-read examples. Redesign it to communicate HOT PISTONS AND EXTREME COMPRESSION much more directly, with less clutter.

Make an iconic, bold industrial poster: exactly two powerful steampunk compression engines, MAIN left and WORKER right, each with ONE enormous visible piston. Two pistons total. Crop close enough that the piston and compression chamber on each side are the main subjects. Reduce the machinery to broad geometric masses and a few thick connecting rods. Clean stylized illustration, graphic shapes, broad shading, minimal small texture. No intricate factory, rows of valves, tiny rivets, ornate frames or busy gears. Dark almost-empty background.

SHOW PRESSURE through an unmistakable physical cutaway: a colossal piston descends from above into each cylinder. Its broad piston face is near the bottom of its stroke, squeezing a dense pocket of blazing amber-white steam into a VERY THIN GAP between the piston face and the strong cylinder floor. The remaining compressed space occupies less than one tenth of the cylinder height. Make the piston body visibly solid and massive, and the trapped glowing steam visibly confined. Thick loaded rods and a few simple downward force marks on the piston body reinforce the pressing direction. Short, concentrated white steam jets vent outward from narrow side relief slots. This should immediately read as enormous pressure held under control, not a cylinder full of loose fog.

Make the pistons HOT: incandescent orange edges at the compression face, warm copper shells, white-hot compressed cores, heat shimmer, strong amber light on the dark metal. Confine that brilliance to the piston heads and tiny compression gaps. Healthy mint-green cache indicators provide a positive accent. The mood is formidable, slightly intimidating and triumphant: immense useful power on your side. Machines are intact and controlled. No flames, damage, alarms, explosions, faces or monsters.

Above each machine, one compact clear cache-read instrument, visually secondary to the huge piston:
LEFT exact text: "MAIN", "CACHE READ", "99%".
RIGHT exact text: "WORKER", "CACHE READ", "100%".
Use clean bold typography and a simple almost-full green arc. Keep these readable at README width. Do not confuse the cache percentage with a pressure measurement or invent pressure units.
Top title, simple and unornamented: "PI FABRIC PAIR".
Small bottom caption: "ILLUSTRATIVE CACHE READINGS - LAST REQUEST".
No other text.

Art direction: a premium graphic-novel cover meets a simplified industrial cutaway, dramatic low angle, strong silhouettes, spacious composition, crisp broad shapes, charcoal-black and warm copper with concentrated orange-white heat and small green accents. Both complete pistons and their compressed gaps must be visible. Wide landscape around 16:9. Stronger heat and clearer compression than the source image, substantially fewer visual details.
```

## High-pressure cache engines

Asset: `pi-fabric-pair-cache-pressure.png`

Earlier README hero, edited with built-in image generation from the earlier
piston illustration. Four oversized pistons, tightly compressed glowing steam,
dark silhouettes, and green gauges convey formidable but positive power with
less visual clutter. Main's 99% and Worker's 100% are illustrative last-request
cache-read shares, not measured or guaranteed performance.
Resolution: 1672 x 941 pixels.

### Generation prompt

```text
Use case: style-transfer
Asset type: GitHub README hero illustration for pi-fabric-pair.
Input image: edit the supplied Main/Worker steam-piston artwork.

User's requested changes: LESS DETAIL, MUCH HIGHER VISIBLE PRESSURE ON THE PISTONS, SCARY BUT POSITIVE. Preserve the Main/Worker subject and the exact 99% and 100% cache readings.

Radically simplify the image into bold, stylized industrial concept art with a strong poster silhouette. Exactly two massive steampunk engines, MAIN on the left and WORKER on the right. Two enormous pistons per engine, four total, with thick heavy rods and broad pressure-cylinder shapes. Make these few huge shapes dominate the frame. Remove the crowded factory, scaffolding, tiny valves, fine wiring, repetitive small rivets and decorative machinery. Use a nearly empty charcoal backdrop with a few sweeping shapes of steam and generous negative space. Broad painterly shading, crisp major edges, very little microtexture. Clearly an illustration, not intricate photorealism.

Make the force unmistakable: glass cutaways reveal the massive piston crowns pushed almost all the way toward the cylinder heads, squeezing the steam into extremely narrow, intensely glowing bands. The compressed steam is dense brilliant mint-white, visibly packed tight above each piston crown. Heavy rods and braces look solid and loaded. Concentrated powerful steam jets shoot from a few controlled relief vents. Strong converging forms, compressed shapes, and short stylized force lines convey tremendous pressure. Do not simply fill tall cylinders with loose vapor.

Mood: a formidable, slightly frightening powerhouse working FOR you. Looming low angle, deep almost-black shadows, heavy monolithic forms, dramatic rim light, exhilarating contained strength. Positive cues are steady mint-green gauge arcs, warm bronze edges, confident stable construction and a hopeful luminous core. No evil faces, eyes, monsters, red alarms, cracked glass, breakage, explosions or destruction.

Each engine has one simple oversized readable gauge:
LEFT exact text: "MAIN", "CACHE READ", "99%".
RIGHT exact text: "WORKER", "CACHE READ", "100%".
Needles sit at the maximum green end. Gauge design is clean and chunky with only a few major ticks. These example cache-read percentages are not pressure units or live telemetry.
At the top, a simple unornamented title: "PI FABRIC PAIR".
At the bottom, one small readable line: "ILLUSTRATIVE CACHE READINGS - LAST REQUEST".
No other words.

Restrained palette: charcoal black, aged bronze, warm amber edges, luminous mint-green compressed steam. Fewer colors, larger forms, stronger contrast than the input. Focus on compression, scale and the two gauges. Keep the two machines visually separate. Wide landscape approximately 16:9.
```

## Piston-driven cache engines

Asset: `pi-fabric-pair-cache-pistons.png`

Earlier README hero, created with built-in image generation by redesigning the
earlier steampunk illustration. Exposed pistons compress steam in two independent
Main and Worker engines. Main's 99% and Worker's 100% are illustrative last-request
cache-read shares, not measured or guaranteed performance.
Resolution: 1672 x 941 pixels.

### Generation prompt

```text
Use case: stylized-concept
Asset type: redesigned GitHub README hero for pi-fabric-pair.
Input image: the attached current hero is the edit target. Radically redesign its machinery and composition following this new direction; keep the subject of one MAIN engine and one WORKER engine and the steampunk materials, but do not preserve the static cabinet layout.

User's requested change: much more impressive and dynamic, with MANY LARGE PISTONS PRESSING AND COMPRESSING STEAM, and CACHE READINGS AT 99-100%. This is the dominant brief.

Create a breathtaking cinematic steampunk engine room with two immense working cache engines, MAIN on the left and WORKER on the right. Low three-quarter camera angle, powerful diagonal composition, imposing industrial scale, meticulously believable mechanical construction. Four large exposed reciprocating pistons per engine, massive polished steel piston rods, brass crossheads, visible crankshafts and connecting rods, spinning flywheels, heavy riveted copper pressure cylinders. Several cylinders have thick glass cutaway sections showing piston crowns actively pressing swirling luminous steam into small intense compressed volumes. Make the pistons and their motion the visual stars, occupying much of the composition. Freeze a dramatic mid-stroke moment. Forceful white steam jets discharge from relief valves, curl around the machine bases and catch warm furnace light. Add restrained motion blur only to fast linkages and flying steam; the instruments and main structures remain pin sharp.

Each engine has ONE large, beautifully readable luminous analog cache-read dial integrated into its machinery:
Left: exact labels "MAIN", "CACHE READ", and large "99%".
Right: exact labels "WORKER", "CACHE READ", and large "100%".
Both needles are visibly at the extreme high end of a 0-100 scale. High-end arcs are luminous teal or green, conveying excellent reuse, not a red danger zone. Both readouts must be immediately legible when the image is reduced to README width. The exact numbers 99% and 100% are mandatory. No 80% or 60% anywhere.

Build small dense arrays of glowing token-like brass cartridges into each engine separately as a cache metaphor. Retained paper-tape reels and a compact illuminated context slot can appear as subtle supporting details, but the dominant subjects are pistons compressing steam and the two near-maximum CACHE READ instruments. Do not stack three large labelled cabinet drawers. The two engines remain distinct: do not suggest that they transfer a shared cache.

Palette and finish: aged brass, burnished copper, blackened steel, oil-dark joints, warm amber furnace light against selective cool teal luminous steam, volumetric beams in a vast shadowy foundry. Rich patina, tiny machining marks, condensation on glass, convincing reflections, physically detailed construction, lavish cinematic concept-art finish. Strong silhouette and depth, disciplined composition, no visual junk.

A single restrained upper nameplate reads exactly "PI FABRIC PAIR".
A small clean lower caption reads exactly "ILLUSTRATIVE CACHE READINGS - LAST REQUEST".
Only those labels and gauge scale numbers; no extra slogans, giant disclaimer plaque, prose, section labels, invented cache tiers, benchmarks, logos, watermarks, people or robots.
The readouts are conceptual example last-request cache-read percentages, not live measurements or guaranteed performance. This is a dramatic illustration, not a screenshot.
Wide landscape around 16:9. Generate a completely finished, high-detail raster artwork.
```

## Steampunk cache graphic

Asset: `pi-fabric-pair-cache-steampunk.png`

Generated with the built-in image generation tool as an earlier README concept.
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
