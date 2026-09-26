# README images

## Technical diagrams

The README uses three hand-authored SVG diagrams. Each focuses on one idea, with
a white background, thin lines, system fonts, and a muted blue accent. Edit text
and coordinates directly in the SVG files.

| Image | Explains | Implementation sources |
| --- | --- | --- |
| [Runtime](pi-fabric-pair-architecture.svg) | Main's controller and one separate worker. | [Controller](../../src/controller.js), [RPC](../../src/rpc.js), [worker](../../src/worker.js). |
| [Review loop](pi-fabric-pair-review-loop.svg) | Implement, capture evidence, inspect, and approve or revise. | [Main tools](../../src/main.js), [decisions](../../src/controller.js), [evidence](../../src/evidence.js). |
| [Retained context](pi-fabric-pair-context.svg) | Two conversations; one worker session across revisions and tasks. | [Main lifecycle](../../src/main.js), [worker lifecycle](../../src/worker.js), [session runtime](../../src/actor-runtime.js). |

The diagrams summarize the active extension/controller runtime. The context
rows show each conversation's progression, rather than exact event timing.
Protocol details and approval rules are in [Architecture](../ARCHITECTURE.md)
and [Reference](../REFERENCE.md).

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
