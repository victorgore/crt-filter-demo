# CRT Filter Emulator

A web-based CRT display emulator that applies vintage visual effects to modern videos.

## Why CRT Filters?

Old media (like 80s/90s anime and retro games) was designed with CRT display characteristics in mind:
- **Natural anti-aliasing** from phosphor glow
- **Scanlines** that add perceived detail
- **Color bleeding** that blends adjacent pixels
- **Curved screens** that focus the image

Modern LCDs render this content with harsh pixels that were never meant to be seen clearly.

## Features

- Real-time WebGL shader processing
- 5 authentic CRT presets:
  - Consumer TV (standard composite input)
  - Professional PVM (broadcast monitor)
  - Arcade Monitor (high brightness/contrast)
  - Sony Trinitron (aperture grille)
  - VGA Monitor (sharp, minimal effects)
- Adjustable parameters for fine-tuning
- Drag & drop video upload
- Sample videos included
- No server required - runs entirely in browser

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/victorgore/crt-filter-demo.git
cd crt-filter-demo
