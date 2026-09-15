# Picture-frame enclosure

This folder contains the V5 three-part enclosure for the Elecrow 2.13-inch
ESP32 e-paper CrowPanel used by this project.

## What to print

For a complete enclosure, print:

- `codex-picture-frame-v5-frame.stl`
- `codex-picture-frame-v5-backplate.stl`
- `codex-picture-frame-v5-leg.stl`

The frame prints with its visible front face directly on the build plate. The
backplate prints with its inner face down, and the leg is already exported in
its flat print orientation. Use 0.16 mm layers, three walls, 15% infill, and no
supports as the starting profile. Verify all orientations in your slicer.

`Codex-Usage-Display-V5-Backplate-Only-P2S-0.16mm-Purple-Sparkle.3mf` is a
replacement-cover project for a Bambu Lab P2S with a 0.4 mm nozzle and Smooth
PEI Plate. It contains printer-specific sliced data. Open it in Bambu Studio,
verify the printer, plate, filament, object orientation, and preview, then
reslice before printing.

## Hardware and assembly

The enclosure uses eight 3 x 1 mm disc magnets: one magnet in each of four
frame pockets and one matching magnet in each of four backplate pockets. The
pockets are 3.35 mm in diameter. Dry-fit all eight magnets and mark their
polarity before using CA glue or epoxy.

1. Put the display into the frame from the rear, with the USB-C connector at
   the bottom opening.
2. Route the right-angle USB-C cable through the bottom opening.
3. Fit the leg tongue into the socket on the outside of the backplate.
4. Place the backplate directly into the rear recess. The right-side pull tab
   remains accessible through the frame notch.
5. Confirm the active pixels sit flush against the bezel and the cable moves
   freely before gluing magnets.

The frame opening is 48.55 x 23.71 mm and is intended to expose only the active
e-paper area. The enclosure holds the screen 60 degrees from the desk, or 30
degrees back from vertical.

## Fit gauges and source

- `codex-picture-frame-v5-fit-gauge.stl` checks the active-screen opening.
- `codex-picture-frame-v5-magnet-gauge.stl` checks magnet and glue clearance.
- `codex-picture-frame-v5.scad` is the parametric source. Set `part` near the
  top of the file to export an individual component or the assembled preview.
- `validate_v5_geometry.py` regenerates every STL with OpenSCAD and checks mesh
  integrity, assembly intersections, loading paths, stand contact, stability,
  cable clearance, and magnet geometry. It expects OpenSCAD and Bambu Studio in
  their standard macOS application paths. Its committed successful result is
  `v5-geometry-report.json`.

Read [`DESIGN-AUDIT.md`](DESIGN-AUDIT.md) for the measured dimensions and the
full V5 preprint audit. The V4 frame and leg were physically tested; V5 changes
only the backplate preload and still needs its final physical print test.
