# Archived technical diagram prompts

These prompts describe the earlier PNG illustrations. The README now uses
hand-authored SVGs listed in [the asset index](README.md#technical-diagrams).

Generated with the built-in imagegen tool. These diagrams document the active
`extension.js` -> `main.js` / `worker.js` runtime, with `PairController`, `PiRuntime`,
and `PiRpc`; they do not illustrate the separate ActorHost implementation plans.

The generation and final refinement prompts below are retained for future
updates. Text descriptions and source links are in
[the asset index](README.md#technical-diagrams).

## Runtime architecture

Asset: `pi-fabric-pair-architecture.png`

```text
Use case: infographic-diagram
Asset type: technical README illustration for pi-fabric-pair.
Primary request: Explain the actual runtime architecture of Pair in one precise, attractive engineering diagram. It is a local extension coordinating one Main model and one persistent Worker model.

Style: Finished raster technical illustration with a restrained industrial blueprint aesthetic: near-black charcoal canvas, fine low-contrast grid, warm copper for Main and control, mint for Worker and returned evidence, ivory typography. Flat orthographic diagram, crisp outlines, ample empty space, tiny restrained file/process pictograms. No photoreal machinery, no decorative gauges, no robots. All text must be large, clean, correctly spelled, and readable at GitHub README width. Wide landscape about 16:10.

Composition and exact content:
Top left small series label "PAIR / 01"
Large title "One Main. One persistent worker."
Subtitle "Local supervision through Pi's JSONL RPC"

Main diagram has three evenly spaced columns. A single subtle enclosing frame spans ONLY the left and middle columns, titled "MAIN PI PROCESS". A separate frame encloses the right column, titled "WORKER PI PROCESS".
Left column card: title "Main"; three lines "Plan and review", "Pi + Fabric + Fovea", "Own conversation".
Middle column card: title "Pair controller"; lines "Task authority + review state", "PiRuntime + PiRpc". This is a component inside the Main process, not an additional model.
Right column card: title "Persistent worker"; lines "Implement the assigned scope", "Pi + Fabric + Fovea", "Own conversation"; lower small attached card titled "Worker bridge", line "Tool gates + pair_report".

Between Main and controller use two separate clear arrows: left-to-right labeled "pair_dispatch / pair_decide"; right-to-left labeled "report + evidence refs".
Between controller and Worker use two separate clear arrows: controller-to-worker labeled "JSONL RPC commands"; worker-to-controller labeled "RPC lifecycle events".
Below those arrows, draw ONE separate mint report route originating from the Worker bridge and terminating at the controller, passing through a clearly labeled small file card "latch.json -> inbox/*.json". Above this route write "Durable report". The report file path is distinct from the RPC lifecycle-event path. Do not send report directly to Main.

Bottom of illustration: two spacious unconnected inset cards, clearly secondary facts rather than additional processes:
Card "GIT WORKSPACE": lines "Worker writes source", "Controller snapshots + runs checks".
Card "PRIVATE PAIR STATE": lines "Outside the implementation tree", "Sessions / authority / reports / evidence".
Footer: "One live worker / One unresolved assignment"

Accuracy constraints: Exactly two model-bearing processes. Controller and PiRuntime live inside Main process. Both model hosts use Fabric and Fovea. The worker writes the implementation workspace directly; do not show patches being merged into another branch. Reports are durable local files and notifications only wake the controller. Do not add server clouds, distributed services, automatic merges, recursive agents, or multiple workers. No extra text. Use plain short arrows with unmistakable direction and avoid crossings. This is an explanatory architecture image, not a UI mockup.
```

## Review and revision loop

Asset: `pi-fabric-pair-review-loop.png`

```text
Use case: infographic-diagram
Asset type: technical README illustration for pi-fabric-pair.
Primary request: Explain Pair's implementation and review checkpoint sequence with clear event order and one revision loop. Show the controller's evidence gate, not just a conversation.

Style: Finished raster engineering infographic, near-black charcoal background, subtle blueprint grid, warm copper for Main, mint for Worker, cool pale blue for controller/evidence, ivory text. Flat orthographic cards and clean lines, ample whitespace, small restrained document and fingerprint pictograms. Elegant technical documentation aesthetic. Large readable exact text, no small paragraphs. Wide landscape around 16:10.

Top small series label "PAIR / 02"
Large title "A report becomes a review checkpoint."
Subtitle "Each continuation returns to the same worker session"

Main content: six numbered rectangular cards laid out in a clean 3-column by 2-row serpentine flow: 1 top left, 2 top middle, 3 top right, 4 bottom right, 5 bottom middle, 6 bottom left. Main arrows run 1 -> 2 -> 3 -> 4 -> 5 -> 6. Put short role labels on cards. Use the following exact labels:
1 role "MAIN"; heading "Dispatch"; code label "pair_dispatch"; detail "Bounded plan + explicit constraints".
2 role "WORKER"; heading "Implement"; detail "Execute the authorized scope".
3 role "WORKER"; heading "Report and yield"; code label "pair_report"; detail "Latch report / Close current lease".
4 role "CONTROLLER"; heading "Freeze evidence"; detail split across two lines "Wait for settled + idle" and "Run configured checks / Snapshot + recheck".
5 role "MAIN"; heading "Inspect"; code label "pair_inspect"; detail "Immutable diff + check results".
6 role "MAIN"; heading "Decide"; code label "pair_decide"; detail "Approve / Revise / Cancel".

From card 6 draw an external copper loop routed outside the grid back to card 2, without crossing any card or text. Label this return path "Revise or continue: fresh attempt + lease".
From card 6 a separate short mint arrow leads down to a final small pill "Final approval: task complete / Session retained". This must not look like an automatic commit, merge, or deployment.

At the very bottom, a full-width contrasting but quiet technical rule strip:
Heading "APPROVAL GATE"
Line 1 "Evidence inspected + matching report IDs + live source hash equals checkpoint hash"
Line 2 "Configured checks must pass when requirePassing is enabled"
Small final note "Empty check list = no independent verification"

Accuracy: The worker reports and stops before the controller waits for settled execution, checks source, and captures/rechecks immutable evidence. Actual implementation edits are already in the workspace before review. A continuation grants a fresh lease in the same conversation. Final approval retains the process/session. Questions/blockers are alternative report kinds but omit them from this focused code-review sequence. Depict only the six cards, one revision/continuation loop, one final outcome, and the rule strip; no fabricated extra stages. No decorative shields or assurances of sandbox isolation.
```

## Persistent context and cache observations

Asset: `pi-fabric-pair-context.png`

```text
Use case: infographic-diagram
Asset type: technical README illustration for pi-fabric-pair.
Primary request: Explain how Pair retains separate Main and Worker conversations, what crosses between them, and how durable task state survives native compaction. Clearly distinguish retained context from observed provider cache usage.

Style: Finished raster technical illustration, elegant dark industrial blueprint matching a software README. Near-black charcoal, subtle fine grid, warm copper for Main, mint for Worker, cool pale blue for persisted coordination, ivory typography. Flat diagram with simple paper-stack pictograms, precise arrows, broad whitespace. No machinery or gauges, no giant percentages, no robots. Wide landscape around 16:10. All labels large, correct, easy to read at README width.

Top small series label "PAIR / 03"
Large title "Two conversations. Durable coordination."
Subtitle "The worker carries context across revisions and tasks"

Main content top half: two balanced large side-by-side conversation cards titled "MAIN CONVERSATION" and "WORKER CONVERSATION".
Main card contains a simple three-entry vertical thread with exact labels "User constraints", "Plans and decisions", "Selected review evidence".
Worker card contains a simple three-entry vertical thread with exact labels "Work orders", "Implementation history", "Revisions and next tasks".
Between the two cards, draw two horizontal arrows across a wide central gap, one above the other:
Main -> Worker label "Explicit work order + feedback"
Worker -> Main label "Compact report + evidence refs"
Below these two arrows centered write "Worker does not inherit Main's private chat".
Do not draw a copied transcript or shared memory pool.

Middle full-width blue-gray strip:
Title "DURABLE PAIR STATE"
Three short evenly spaced text groups: "Task IDs + leases", "Reports + decisions", "Snapshots + checks".
Below the strip, a clear simple left-to-right 3-step flow:
"Native Pi / Fabric compaction" -> "Pair restores a small task-state packet" -> "Next turn / No extra inference".
Visually associate this restoration with both conversations using two restrained upward connectors that do not cross the horizontal message arrows. This strip represents task authority stored outside the transcripts; it is not a combined model conversation.

Bottom panel, visually distinct from conversation persistence:
Heading "CACHE READ = AN OBSERVATION"
Show this exact formula in large legible monospaced type:
"cacheRead / (input + cacheRead + cacheWrite)"
Under it: "Measured separately for each role's last request"
Final short line: "Optional native warming: off by default / Compatible SDK required / Hits not guaranteed"

Accuracy constraints: Main and Worker have distinct Pi sessions and Fovea context. Only explicitly selected work-order, report and evidence content crosses; there is no full transcript copy. Pi/Fabric owns automatic compaction. Pair restores a bounded coordination packet with nextTurn and triggerTurn:false; do not depict a paid model call to restore state. The observed cache ratio is not context retention, a benchmark, or a promise about the next request. Do not add percentages, timing/TTL claims, GPU memory, model brands, shared cache guarantees, or other text.
```

## Final style refinements

The architecture image is the style reference for both refinements. Each first
generation above is the corresponding edit target. These passes align typography
and remove background texture that competes with technical labels.

### pi-fabric-pair-review-loop

```text
Use case: style-transfer
Asset type: polished technical README image.
Input image 1 is the edit target: Pair review sequence. Input image 2 is ONLY the style reference: Pair architecture.
Keep image 1's six-card serpentine layout, all six step numbers, every card's exact wording, every arrow direction, the single return loop from Decide to Implement, the final-approval pill, and the entire approval-gate rule. Keep the same title, subtitle, and "PAIR / 02".
Change ONLY presentation: match image 2's clean quiet fully opaque charcoal background and subtle grid, crisp ivory sans-serif typography, restrained copper/mint/blue strokes, flat panels, generous breathing room. Eliminate all grungy multicolored texture, bloom, white haze, speckling, transparency, and light behind the title. All background pixels must be fully opaque dark charcoal. Make small labels at least as readable as the style reference.
Remove only the unrequested tiny top-right branding/slogan block ("PI-FABRIC-PAIR", "HUMAN + AGENT", "CONTROLLED PROGRESS", "VERIFIABLE WORK"). Do not introduce any new wording or substitute data from image 2. Preserve the exact approval rules, especially "requirePassing", and do not change the sequence. Finished raster landscape diagram, same aspect ratio.
```

### pi-fabric-pair-context

```text
Use case: style-transfer
Asset type: polished technical README image.
Input image 1 is the edit target: Pair conversations and durable context. Input image 2 is ONLY the style reference: Pair architecture.
Keep image 1's complete diagram structure, two distinct conversation cards, all thread labels, both message-arrow directions and labels, the durable-state strip and its three data groups, both upward restoration connectors, all three compaction-flow boxes and their order, and the exact cache formula and cost/capability notes. Keep the title "Two conversations. Durable coordination.", the subtitle, and "PAIR / 03".
Change presentation to closely match image 2: clean fully opaque near-black charcoal background, a barely visible uniform grid, crisp ivory SANS-SERIF typography in both title and body, copper/mint/blue outlines, flat dark cards. No serif type anywhere. Eliminate all multicolored coarse texture, bright patches, haze, glow, speckling, checkerboard effects, and transparency. EVERY background pixel must be fully opaque dark charcoal. Remove the unrequested tiny top-right slogan "SEPARATE CONTEXTS / SHARED PROGRESS" and bottom-right slogan "OBSERVE / DON'T ASSUME / KEEP BUILDING". Use freed space to make all labels clearer. No small ornamental text.
Keep the line "Worker does not inherit Main's private chat" clearly readable on dark charcoal. Make the cache formula large and exact: "cacheRead / (input + cacheRead + cacheWrite)". Enlarge the final native warming note by allowing two lines: "Optional native warming: off by default" and "Compatible SDK required / Hits not guaranteed".
Do not borrow architecture contents from image 2. Do not add new text or arrows. No new concepts. Finished raster landscape diagram, same aspect ratio, high contrast at README width.
```
