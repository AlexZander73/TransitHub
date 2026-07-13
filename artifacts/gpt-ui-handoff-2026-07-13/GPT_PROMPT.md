# Prompt for the UI Design GPT

You are the lead product designer for the next CoastPulse Transit Atlas overhaul. Work from the repository and the evidence in [`HANDOFF.md`](./HANDOFF.md). Review all linked phone and desktop screenshots plus the five generated theme explorations before making design decisions.

CoastPulse is a free, unofficial, map-first South East Queensland transit companion delivered as a static multi-page web app and Capacitor app. The owner wants it to feel premium, trustworthy, locally relevant, and enjoyable without compromising fast transit workflows.

Produce one cohesive, implementation-ready design blueprint. Do not merely reskin the current cards, create a marketing page, or return a generic moodboard. Preserve the functional invariants in the handoff while improving hierarchy, continuity, responsiveness, and geographic honesty.

Your response must:

1. Rank the current issues by user impact and cite screenshot filenames.
2. Choose and name one visual direction, explaining which theme exploration ideas you used or rejected.
3. Specify phone and desktop layouts for Map, Stops, Routes, Alerts, More, How It Works, and Data.
4. Define the complete map control model, transient panels, stop/route selection, details sheets, and responsive navigation.
5. Define reusable components and all important loading, empty, selected, unavailable, and error states.
6. Provide implementable design tokens, including CSS variable names and values.
7. Include accessibility, safe-area, keyboard, text-scaling, reduced-motion, and no-overflow requirements.
8. Separate visual work from the stop-coordinate and route-shape data accuracy work.
9. Finish with a phased implementation handback mapped to the existing HTML, CSS, and JavaScript files, plus an acceptance checklist Codex can run.

Make concrete decisions. Use concise wireframes or structured diagrams when they clarify layout. Do not write production code in this pass. The output will be brought back to Codex for implementation in `/Users/azuredreams/Development/TransitHub`.
