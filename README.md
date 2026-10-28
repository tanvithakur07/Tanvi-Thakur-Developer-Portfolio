# Tanvi Thakur: Portfolio

Static site (HTML, CSS, vanilla JS). No build step, no dependencies.

## Run locally
    cd Tanvi_Thakur_Portfolio
    python3 -m http.server 8000        # then open http://localhost:8000
(Opening `index.html` directly also works; a local server is just closer to real hosting.)
Deploy by uploading the folder to any static host (GitHub Pages, Netlify, Vercel).

## Files
- `index.html`: markup; the hero, plus `#hero-config` (frame graph: gaze coordinates, edges, sprite file names).
- `css/style.css`: warm cream palette (variables at the top), floating nav, hero, sections, experience/education cards.
- `js/hero.js`: hero tracking engine (see below). `js/main.js`: nav, dialogs, resume check, scroll effects.
- `assets/poster.webp`: neutral-pose still (transparent), shown instantly and used if JS or the frames fail.
- `assets/hero-hi-*.webp` / `hero-lo-*.webp`: 146 transparent pose frames in two resolutions (380x442 and 280x326).

## Character frames: background removal
The frames are real transparency (WebP with alpha), so the page background (`--bg`, #F8F4F0) shows through and no rectangle appears.
A fixed background plate of the video wall is subtracted, hair edges use the exact known-background formula, low-contrast areas
(headphones, sleeve) use closed-form matting, and foreground colours are decontaminated (no pink or cream halo). All frames share one crop.

## How the hero tracking works
The source clip is one continuous performance. Its frames form a ring of gaze directions (left, up-left, up, up-right, right,
down-right, down, down-left) plus "spokes" from the neutral pose. In `#hero-config`:
- every frame is a node with a gaze coordinate (x = right, y = up), labelled from the actual images;
- edges join only frames that are neighbours in the video, or flow-interpolated in-betweens across blinks, each with a cost equal
  to how much the picture changes between them. No other frames are ever blended.
At run time:
1. The cursor, measured from the head and scaled by the hero size, becomes a desired gaze vector: a small neutral zone, then a gradual
   response (about 85% of the full look at 62% of the interaction radius, the full look at the edge).
2. The nearest node in gaze space is the target (with hysteresis against jitter).
3. The head walks the cheapest path of edges to it: directly round the ring between neighbouring directions, via the neutral pose only
   when two directions are not neighbours. Speed is eased (frame-rate independent, no overshoot); direction reversals pass through zero speed.
4. The canvas draws the two nodes of the current edge with premultiplied-alpha interpolation. The loop sleeps when she arrives.
Outside the hero, on pointer-leave, or on touch release she returns to the neutral frame. Touch: horizontal drags turn her, vertical drags scroll.
Devices without hover get an occasional slow glance. `prefers-reduced-motion`: static poster, no listeners or loop.

## Limits of the source animation
- All eight directions exist, but only at one strength each (plus the turn-in frames on the cardinal spokes). There are no medium-strength diagonal poses.
- Up-right and down-right are mostly eye-led looks with limited head rotation; they were not performed as full head turns in the clip.
- The head cannot follow a fast circle exactly: it takes real frames at a visually uniform speed, so it lags a fast cursor.
- About 40 of the 146 frames are optical-flow in-betweens across blinks and between neighbouring directions: 2D estimates, not true 3D head turns.
- The cut-outs are tuned for the cream page; on a strongly different background a few faint cream flecks beside the hair may show.
For closer-to-3D tracking a new capture is recommended (see the project notes in the delivery message).

## To confirm / add
Resume PDF. Project documentation PDFs are in assets/documents/.
