# V5 backplate preprint check

Audited: 2026-09-14

Status: backplate-only Bambu 3MF created, reopened, and independently resliced.
It has not been sent to the printer.

## Physical correction

The V4 frame, active-pixel opening, board locators, cable opening, front feet,
rear leg, and 60-degree posture are physically proven and unchanged. V5 replaces
only the magnetic rear cover.

V4 uses two nominally 0.06 mm-proud magnets at each corner pair. Their faces can
make the cover float about 0.12 mm behind the intended rear-stop plane. The
folded Post-it test proved that closing this gap holds the display flush, but the
paper's spring force pushes the cover away from the magnets.

V5 adds one 0.16 mm printed layer to the cover's inner face. This closes the
0.12 mm nominal gap and supplies about 0.04 mm of firm preload. Three folds of
paper do not translate to three 0.16 mm printed layers; a 0.48 mm rigid addition
would overstuff the enclosure.

The V5 backplate magnet wells are 1.10 mm deep instead of V4's 0.94 mm. With a
nominal 1.00 mm disc, each cover magnet sits 0.10 mm below the new inner face.
The installed V4 frame magnets remain 0.06 mm proud, leaving only 0.04 mm nominal
face separation when the rigid rear stop touches the measured device envelope.
The wells retain the same 0.66 mm printed floor as V4.

The leg tongue bed is recessed by the added 0.16 mm. This preserves the existing
leg's bearing plane, 0.30 mm insertion clearance, socket depth, and exact
60-degree desktop posture. The cable opening is unchanged; permanent cable
management remains external to the enclosure.

## Geometry audit

- Backplate footprint: 69.80 x 41.50 mm.
- Flat cover thickness at the device stop: 1.76 mm.
- Complete print height including the unchanged leg socket: 4.25 mm.
- Four 3.35 mm-diameter pockets for the existing 3 x 1 mm TRYMAG discs.
- Magnet pocket floor: 0.66 mm.
- Rear guide clearance: 0.25 mm per edge.
- Device envelope: delivered 31.46 mm height and measured 11.51 mm depth.
- Posture: 30.00 degrees back from vertical, or 60.00 degrees from the desk.
- Front-foot contact: 271.770 mm2.
- Existing rear-leg contact: 110.949 mm2 across 24.80 mm total width.

OpenSCAD certifies every export as one manifold solid. Bambu Studio reports one
watertight part with zero open edges. Exact Boolean tests report 0.0 mm3
unintended intersection for the assembled frame, cover, leg, device proxy, rear
cover approach, and rear device-loading approach. The generated V5 frame and leg
STLs are byte-identical to V4, proving that the replacement cover is the only
mechanical change.

## Bambu project

`Codex-Usage-Display-V5-Backplate-Only-P2S-0.16mm-Purple-Sparkle.3mf` contains
one inner-face-down rear cover centered on the P2S plate. It selects the P2S 0.4
mm nozzle, Smooth PEI Plate, Bambu PLA Sparkle, Royal Purple preview, 0.16 mm
layers, 0.20 mm first layer, three walls, 15% infill, auto brim, 0.15 mm
elephant-foot compensation, and supports off.

The slice has 26 layers and estimates 18 minutes 57 seconds, 2.04 m, and 6.18 g.
The only bridge features are the four magnet-well floors at 1.32 and 1.48 mm;
there is no support feature or slicer warning. Bambu reopens the finished 3MF as
one 69.80 x 41.50 x 4.25 mm manifold and reproduces the same object bounds,
layers, bridge structure, material estimate within 0.01 g, and time within one
second. Bambu's arc optimizer does not emit byte-identical G-code on repeated
slices of this mesh, so validation uses the physical toolpath structure rather
than a brittle whole-file checksum.

Reuse the V4 frame and leg. Install four new 3 x 1 mm magnets in the V5 cover
with polarity matched to the four magnets already glued into the frame. Dry-fit
the cover and verify the screen remains flush before gluing the new magnets.
