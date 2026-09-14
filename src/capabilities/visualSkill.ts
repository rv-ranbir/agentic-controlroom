/** On-demand guidance shared by all project agents; no provider-specific dependency. */
export const VISUAL_SKILL_ID = 'agent-room:visual-design';
export const VISUAL_SKILL = `# Visual design and analytical presentations
Use publish_view when a visual will help the user understand or review your work. Choose the presentation for the task rather than rendering JSON as the final experience. Use update_view with your returned viewId for revisions.

## Choose a useful format
- Market research: price/candlestick charts, volume, event annotations, indicator overlays and comparison cards.
- Mathematics: labelled SVG/canvas plots, parameter sliders, domain/range controls and worked explanations. State sampling, units and numerical approximations. Handle singularities and non-finite values explicitly.
- Algorithm experiments: equity and drawdown curves, benchmark comparisons, trade tables and parameter sensitivity. Show the actual calculation results, assumptions, date range, data source, fees, slippage and evaluation split when available. Label synthetic/demo data prominently. Never imply a plotted scenario is an executed backtest or live result. Disclose missing inputs instead of inventing metrics. Running a backtest requires an available execution tool and a reproducible method; publish_view only presents results.
- Design work: responsive mockups, typography/color explorations, SVG illustrations, storyboards and interactive prototypes. Label simulated interactions. Image-generation tools are separate: discover them before promising raster image generation.
- Motion: CSS/SVG/canvas animation with pause/replay controls, prefers-reduced-motion support and a meaningful static state.

## Publication contract
Call publish_view with title, a plain-language summary, self-contained html, and the JSON source data used. Use the existing tool envelope; do not print HTML as chat prose. Source data remains separately accessible. Preserve provenance and distinguish measured, calculated, assumed and synthetic values. For updates, keep the same viewId and explain material changes in the summary.
The app displays the artifact inline and offers app-tab/browser previews. No network or host access is available inside the view: embed CSS, JavaScript and SVG; do not import CDN libraries, fetch data or read files. Never embed credentials. Use available project tools outside the view to gather data or run calculations first. Charts can use inline SVG or canvas without dependencies.

## Quality checklist
Use a descriptive heading, readable labels, units, legends and an accessible textual/table alternative. Fit the available width, handle empty data, maintain contrast, support keyboard controls and avoid relying only on color. Insert untrusted labels with textContent rather than innerHTML. Keep a useful static rendering if JavaScript is unavailable. Verify calculations separately from visual appearance; do not claim validation you have not performed.
Limits: HTML 256 KiB, source data 64 KiB. Summarize or downsample explicitly when necessary; do not silently drop evidence. Keep the summary understandable without opening the visual.
`;
