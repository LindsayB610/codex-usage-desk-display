// CrowPanel Codex usage display - V5 preload backplate
// Units: millimeters. Designed for a 0.4 mm nozzle and 0.16 mm layers.

$fn = 56;

// Export: "frame", "backplate", "leg", "fit_gauge", "magnet_gauge",
// "assembly_backplate", "assembly_leg", "device", or "assembly".
part = "assembly";

// Elecrow STEP-derived face geometry plus the delivered-unit fit evidence.
active_width = 48.55;
active_height = 23.71;
pcb_width = 63.20;
pcb_height = 31.20;
pcb_center_from_screen_x = 2.625;
delivered_device_height = 31.46;
device_insertion_width = pcb_width + 0.20;
device_insertion_height = delivered_device_height + 0.14;

// V3 physical testing proved the 13.20 mm cavity was 1.69 mm deeper than the
// delivered device needs, allowing the screen to fall away from the bezel.
// The tallest rear connector measures 11.51 mm from the screen face. V4 makes
// the cavity exactly that deep. The cover therefore becomes the rear stop;
// its four slightly proud magnet pairs can let it float by about 0.12 mm rather
// than rigidly clamping the connector if the physical stack runs tall.
measured_device_depth = 11.51;
device_depth = measured_device_depth;
device_xy_clearance = 0.60;
rear_stop_clearance = 0.00;
screen_edge_clearance = 0.0;
aperture_rear_relief = 0.80;

shell_wall = 1.20;
locator_wall = 0.80;
locator_depth = 2.40;
face_thickness = 1.60;
backplate_thickness = 1.60;
// V4's two nominally 0.06 mm-proud magnet faces make the cover float about
// 0.12 mm behind its intended rear-stop plane. A folded Post-it proved that
// closing this gap holds the display flush, but its spring force overpowered
// the small magnets. V5 adds exactly one 0.16 mm printed layer to the inner
// face. The backplate magnet wells deepen by the same amount, preserving their
// original 0.66 mm floors and leaving only 0.04 mm nominal magnetic separation
// when the rigid new stop touches the measured 11.51 mm device envelope.
// The frame, cable opening, leg, and all exterior XY geometry remain V4.
backplate_preload = 0.16;
backplate_total_thickness = backplate_thickness + backplate_preload;
corner_radius = 1.40;

opening_width = active_width + 2 * screen_edge_clearance;
opening_height = active_height + 2 * screen_edge_clearance;

// The front is symmetric around the active pixels. Both side borders use the
// width required by the hardware-heavy side. The device offset is absorbed by
// hidden locator ribs instead of a visible wide stile.
side_border = 11.45;
// The added top/bottom room moves all four corner magnet posts completely
// outside the measured device envelope, preserving straight rear insertion.
top_bottom_border = 10.345;
outer_width = opening_width + 2 * side_border;
outer_height = opening_height + 2 * top_bottom_border;
outer_left_x = -outer_width / 2;
outer_right_x = outer_width / 2;

pocket_width = pcb_width + device_xy_clearance;
pocket_height = pcb_height + device_xy_clearance;
pocket_left_x = pcb_center_from_screen_x - pocket_width / 2;
pocket_right_x = pcb_center_from_screen_x + pocket_width / 2;
pocket_bottom_y = -pocket_height / 2;
pocket_top_y = pocket_height / 2;

cavity_depth = measured_device_depth + rear_stop_clearance;
shell_body_depth = face_thickness + cavity_depth;

// Rear cover. It drops straight into the shallow rear recess and settles onto
// four aligned corner magnet pairs. A small right-side notch exposes its pull
// tab for removal. The walls locate only the cover; they do not try to capture
// the component-packed PCB edges. The close planar cover is the device's rear
// stop. There are no printed flexures and no lateral magnet-sweep path.
backplate_side_margin = 1.45;
backplate_vertical_margin = 1.45;
backplate_width = outer_width - 2 * backplate_side_margin;
backplate_height = outer_height - 2 * backplate_vertical_margin;
backplate_clearance_per_edge = backplate_side_margin - shell_wall;
enclosure_depth = shell_body_depth + backplate_thickness;

// TRYMAG mixed set (ASIN B0FMS4GTB6), using four corner 3 x 1 mm pairs.
// A 0.35 mm diametral allowance leaves room for ordinary CA/epoxy placement.
// Physical V3 testing found the original 1.10 mm wells held a nominal 1.00 mm
// magnet pair too far apart. Restore one 0.16 mm print layer on each floor so
// both magnets stand slightly proud and meet when the cover seats.
magnet_diameter = 3.00;
magnet_thickness = 1.00;
magnet_pocket_diameter = 3.35;
magnet_pocket_depth = 0.94;
magnet_support_diameter = 4.00;
magnet_keepout_xy = 0.20;
magnet_positions = [
    [-30.00,  18.35],
    [ 30.00,  18.35],
    [-30.00, -18.35],
    [ 30.00, -18.35]
];

// Bottom USB-C path, centered on the real PCB rather than the active pixels.
// Measured plug width is 9.45 mm; the existing 15 mm pocket leaves 2.775 mm
// per side. Plugged-in overall height is 38.03 mm versus 31.46 mm bare, so the
// cable extends 6.57 mm below the device. Its rearmost point is 10.67 mm from
// the screen face and remains inside the 11.51 mm device-depth driver.
usb_center_x = pcb_center_from_screen_x;
usb_pocket_width = 15.00;
usb_pocket_height = 6.50;
target_desktop_angle = 60.0;
target_backward_lean = 90 - target_desktop_angle;
// Keep the rear edge safely below the shell, then derive the front edge so the
// complete foot contact plane sits flat at the selected desktop angle.
// The taller balanced bezel moves the cable exit farther from the desk. A
// 1.80 mm rear drop gives the measured worst lower/rear cable corner about
// 2.69 mm of desktop clearance at the 60 degree posture, including the 1.60 mm
// offset from the textured bezel face to the screen surface.
foot_rear_drop = 1.80;
foot_front_drop = foot_rear_drop
                  + enclosure_depth * tan(target_backward_lean);
clearance_foot_width = 8.00;
clearance_foot_overlap = 0.40;

// Retained easel leg. The socket retains the original first-print clearances.
// The leg-body angle and wedged front feet produce 30 degrees of assembled
// backward screen lean, or 60 degrees from the desk.
socket_center_y = 5.30;
socket_length = 14.00;
socket_channel_width = 20.40;
socket_wall_width = 1.80;
socket_gap_depth = 1.65;
socket_lip_width = 1.00;
socket_lip_thickness = 1.00;

leg_tongue_width = 20.00;
leg_tongue_height = 13.00;
leg_tongue_thickness = 1.35;
leg_neck_width = 17.80;
leg_neck_height = 4.00;
leg_flare_height = 4.00;
leg_width = 34.00;
leg_height = 27.50;
leg_thickness = 3.20;
leg_body_angle = 74.33330;
leg_cable_notch_width = 7.00;
leg_cable_notch_height = 6.00;
// In desktop posture the body has 45.6667 degrees of residual X rotation.
// A triangular fill below the old square edge creates a broad coplanar foot
// without moving that established contact plane or changing the 60 degree
// display angle.
leg_desktop_rotation = 90 + target_backward_lean - leg_body_angle;
leg_contact_wedge_extension =
    leg_thickness / tan(leg_desktop_rotation);
leg_detent_radius = 0.28;
leg_detent_projection = 0.30;
leg_detent_pocket_radius = 0.34;
leg_detent_y = 4.20;

show_device_proxy = true;


module rounded_rect_2d(width, height, radius) {
    offset(r = radius)
        offset(delta = -radius)
            square([width, height], center = true);
}


module rounded_plate(width, height, depth, radius) {
    linear_extrude(depth)
        rounded_rect_2d(width, height, radius);
}


module front_bezel() {
    difference() {
        rounded_plate(outer_width, outer_height,
                      face_thickness, corner_radius);

        // Pixel-exact front edge with a hidden rear flare to prevent shadow.
        hull() {
            translate([0, 0, -0.10])
                linear_extrude(0.10)
                    square([opening_width, opening_height], center = true);
            translate([0, 0, face_thickness])
                linear_extrude(0.10)
                    square([opening_width + aperture_rear_relief,
                            opening_height + aperture_rear_relief],
                           center = true);
        }
    }
}


module shell_walls() {
    // Continue through the backplate thickness so the cover drops into a
    // shallow rear recess. These walls start on the bezel and need no support.
    wall_depth = enclosure_depth - face_thickness + 0.10;
    wall_z = face_thickness - 0.10 + wall_depth / 2;

    for (side = [-1, 1]) {
        translate([side * (outer_width / 2 - shell_wall / 2),
                   0, wall_z])
            cube([shell_wall, outer_height, wall_depth], center = true);

        translate([0, side * (outer_height / 2 - shell_wall / 2),
                   wall_z])
            cube([outer_width, shell_wall, wall_depth], center = true);
    }
}


module device_locators() {
    locator_z = face_thickness + locator_depth / 2 - 0.10;

    // The right shell wall already lands at the hardware envelope. A hidden
    // left rib fills the extra space created by the symmetric visible front.
    translate([pocket_left_x - locator_wall / 2, 0, locator_z])
        cube([locator_wall, pocket_height, locator_depth], center = true);

    // Short top and bottom ribs locate the board without covering rear
    // components or clamping the e-paper glass. Extend them 0.10 mm toward the
    // left locator so the solids overlap instead of meeting at one exact edge;
    // that removes a non-manifold seam without changing the pocket opening.
    for (side = [-1, 1])
        translate([pcb_center_from_screen_x - 0.05,
                   side * (pocket_height / 2 + locator_wall / 2),
                   locator_z])
            cube([pocket_width + 0.10, locator_wall, locator_depth],
                 center = true);
}


module cable_clearance_feet() {
    foot_depth = enclosure_depth;
    foot_top_y = -outer_height / 2 + clearance_foot_overlap;
    foot_front_y = -outer_height / 2 - foot_front_drop;
    foot_rear_y = -outer_height / 2 - foot_rear_drop;

    for (x_center = [
            -outer_width / 2 + side_border + clearance_foot_width / 2,
             outer_width / 2 - side_border - clearance_foot_width / 2]) {
        x0 = x_center - clearance_foot_width / 2;
        x1 = x_center + clearance_foot_width / 2;
        polyhedron(
            points = [
                [x0, foot_front_y, 0],
                [x1, foot_front_y, 0],
                [x1, foot_rear_y, foot_depth],
                [x0, foot_rear_y, foot_depth],
                [x0, foot_top_y, 0],
                [x1, foot_top_y, 0],
                [x1, foot_top_y, foot_depth],
                [x0, foot_top_y, foot_depth]
            ],
            faces = [
                [0, 3, 2, 1],
                [4, 5, 6, 7],
                [0, 1, 5, 4],
                [1, 2, 6, 5],
                [2, 3, 7, 6],
                [3, 0, 4, 7]
            ]
        );
    }
}


module frame_magnet_supports() {
    for (position = magnet_positions) {
        x = position[0];
        y = position[1];
        bridge_height = outer_height / 2 - abs(y);

        // Both posts sit beyond the device's measured top/bottom edges. They
        // grow continuously from the bezel and perimeter wall, so neither can
        // obstruct the board's straight rear-loading path.
        union() {
            translate([x, y, 0])
                cylinder(h = shell_body_depth,
                         d = magnet_support_diameter);
            translate([x,
                       sign(y) * (abs(y) + bridge_height / 2),
                       shell_body_depth / 2])
                cube([magnet_support_diameter, bridge_height,
                      shell_body_depth], center = true);
        }
    }
}


module frame_magnet_pockets() {
    for (position = magnet_positions)
        translate([position[0], position[1],
                   shell_body_depth - magnet_pocket_depth])
            cylinder(h = magnet_pocket_depth + 0.10,
                     d = magnet_pocket_diameter);
}


module right_cover_finger_access() {
    // Open only an 11.40 mm-high section of the rear right wall. This exposes
    // the cover's pull tab without leaving an unnecessary full-height slot.
    translate([outer_width / 2 - shell_wall / 2,
               0,
               shell_body_depth + backplate_thickness / 2 + 0.05])
        cube([shell_wall + 0.40,
              11.40,
              backplate_thickness + 0.30], center = true);
}


module main_frame() {
    difference() {
        union() {
            front_bezel();
            shell_walls();
            device_locators();
            cable_clearance_feet();
            frame_magnet_supports();
        }

        frame_magnet_pockets();
        right_cover_finger_access();

        // Preserve the uninterrupted visible front lip while opening the
        // bottom wall and rear structures around the right-angle connector.
        translate([usb_center_x,
                   -outer_height / 2 + usb_pocket_height / 2 - 0.10,
                   face_thickness
                   + (enclosure_depth
                      - face_thickness) / 2])
            cube([usb_pocket_width, usb_pocket_height + 0.20,
                  enclosure_depth
                  - face_thickness + 0.40], center = true);
    }
}


module backplate_magnet_pockets() {
    for (position = magnet_positions)
        translate([position[0], position[1], -0.10])
            cylinder(h = magnet_pocket_depth + backplate_preload + 0.10,
                     d = magnet_pocket_diameter);
}


module leg_tongue_bed_relief() {
    // The new inner layer must not move the already-proven rear leg. Recess the
    // tongue bed by the same 0.16 mm so its bearing plane, socket clearance,
    // insertion depth, and assembled desktop posture remain exactly V4.
    translate([0, socket_center_y,
               backplate_thickness + backplate_preload / 2])
        cube([socket_channel_width, socket_length,
              backplate_preload + 0.20], center = true);
}


module leg_socket() {
    wall_x = socket_channel_width / 2 + socket_wall_width / 2;
    total_depth = socket_gap_depth + socket_lip_thickness;

    difference() {
        union() {
            for (side = [-1, 1]) {
                translate([side * wall_x, socket_center_y,
                           backplate_thickness + total_depth / 2])
                    cube([socket_wall_width, socket_length,
                          total_depth], center = true);

                translate([side * (socket_channel_width / 2
                                   - socket_lip_width / 2),
                           socket_center_y,
                           backplate_thickness + socket_gap_depth
                           + socket_lip_thickness / 2])
                    cube([socket_lip_width, socket_length,
                          socket_lip_thickness], center = true);
            }

            // Two bottom pads catch the tongue's 1.1 mm side wings while
            // leaving the narrower leg neck open. A full-width bar collides
            // with the angled neck.
            stop_span = socket_channel_width + 2 * socket_wall_width;
            stop_pad_width = (stop_span - leg_neck_width) / 2;
            stop_x = leg_neck_width / 2 + stop_pad_width / 2;
            for (side = [-1, 1])
                translate([side * stop_x,
                           socket_center_y - socket_length / 2 - 0.50,
                           backplate_thickness + total_depth / 2])
                    cube([stop_pad_width, 1.00, total_depth], center = true);
        }

        // The side beads ride over 0.10 mm of interference, then settle into
        // these pockets at full insertion. This supplies a real click while
        // the rail lips and bottom pads continue to carry structural loads.
        for (side = [-1, 1])
            translate([side * socket_channel_width / 2,
                       socket_center_y + leg_detent_y,
                       backplate_thickness + socket_gap_depth / 2])
                sphere(r = leg_detent_pocket_radius);
    }
}


module backplate() {
    difference() {
        union() {
            rounded_plate(backplate_width, backplate_height,
                          backplate_total_thickness, 0.80);
            leg_socket();

            // A small side-accessible tongue reaches into the finger notch.
            // It stays 0.20 mm inside the outer frame edge and is invisible
            // from the uninterrupted front face.
            pull_tab_extension = backplate_side_margin - 0.20;
            pull_tab_overlap = 0.15;
            translate([backplate_width / 2
                       + (pull_tab_extension - pull_tab_overlap) / 2,
                       0, backplate_total_thickness / 2])
                cube([pull_tab_extension + pull_tab_overlap, 11.00,
                      backplate_total_thickness], center = true);
        }

        backplate_magnet_pockets();
        leg_tongue_bed_relief();

        translate([usb_center_x,
                   -backplate_height / 2 + usb_pocket_height / 2 - 0.10,
                   backplate_total_thickness / 2])
            cube([usb_pocket_width, usb_pocket_height + 0.20,
                  backplate_total_thickness + 0.30], center = true);
    }
}


module leg_body() {
    difference() {
        union() {
            linear_extrude(leg_thickness)
                offset(r = 1.10)
                    offset(delta = -1.10)
                        polygon([
                            [-leg_neck_width / 2, 0],
                            [ leg_neck_width / 2, 0],
                            [ leg_neck_width / 2, -leg_neck_height],
                            [ leg_width / 2,
                              -leg_neck_height - leg_flare_height],
                            [ leg_width / 2, -leg_height],
                            [-leg_width / 2, -leg_height],
                            [-leg_width / 2,
                              -leg_neck_height - leg_flare_height],
                            [-leg_neck_width / 2, -leg_neck_height]
                        ]);

            // Two triangular prisms turn the old line contact into a broad
            // desk-contact face while preserving the central cable tunnel.
            for (side = [-1, 1]) {
                inner_x = side * leg_cable_notch_width / 2;
                outer_x = side * (leg_width / 2 - 1.10);
                x0 = min(inner_x, outer_x);
                x1 = max(inner_x, outer_x);
                y0 = -leg_height;
                y1 = -leg_height - leg_contact_wedge_extension;
                polyhedron(
                    points = [
                        [x0, y0, 0], [x1, y0, 0],
                        [x1, y0, leg_thickness],
                        [x0, y0, leg_thickness],
                        [x0, y1, leg_thickness],
                        [x1, y1, leg_thickness]
                    ],
                    faces = [
                        [0, 4, 5, 1],
                        [0, 1, 2, 3],
                        [3, 2, 5, 4],
                        [0, 3, 4],
                        [1, 5, 2]
                    ]
                );
            }
        }

        translate([0,
                   (-leg_height - leg_contact_wedge_extension - 0.20
                    + -leg_height + leg_cable_notch_height) / 2,
                   leg_thickness / 2])
            cube([leg_cable_notch_width,
                  leg_contact_wedge_extension
                  + leg_cable_notch_height + 0.40,
                  leg_thickness + 0.30], center = true);
    }
}


module rear_leg() {
    union() {
        rounded_plate(leg_tongue_width, leg_tongue_height,
                      leg_tongue_thickness, 0.70);

        // Two tiny side beads give the already-proven captured tongue a mild
        // end-of-travel click without relying on a brittle cantilever.
        for (side = [-1, 1])
            translate([side * (leg_tongue_width / 2), leg_detent_y,
                       leg_tongue_thickness / 2])
                rotate([0, 90, 0])
                    cylinder(h = 2 * leg_detent_projection,
                             r = leg_detent_radius, center = true);

        translate([0, -leg_tongue_height / 2, 0])
            rotate([-leg_body_angle, 0, 0])
                leg_body();
    }
}


module solid_device_proxy() {
    // Exceed the delivered height by 0.14 mm and STEP width by 0.20 mm, while
    // retaining 0.10-0.20 mm per-edge air inside the proven locator pocket.
    // Depth uses the delivered unit's measured 11.51 mm maximum. The proxy
    // meets the nominal rear-cover plane without occupying solid volume there.
    translate([pcb_center_from_screen_x - device_insertion_width / 2,
               -device_insertion_height / 2, face_thickness])
        cube([device_insertion_width, device_insertion_height, device_depth]);
}


module device_proxy() {
    color([0.92, 0.92, 0.88, 0.60])
        solid_device_proxy();

    color([0.88, 0.85, 0.75, 0.90])
        translate([-active_width / 2, -active_height / 2, -0.04])
            cube([active_width, active_height, 0.04]);
}


module fit_gauge() {
    gauge_border = 4.0;
    difference() {
        rounded_plate(opening_width + 2 * gauge_border,
                      opening_height + 2 * gauge_border,
                      1.20, 1.0);
        translate([0, 0, -0.10])
            linear_extrude(1.40)
                square([opening_width, opening_height], center = true);
    }
}


module magnet_gauge() {
    // Optional four-minute glue-fit check for the nominal 3 x 1 mm discs.
    difference() {
        rounded_plate(10.00, 10.00, backplate_thickness, 1.00);
        translate([0, 0, -0.10])
            cylinder(h = magnet_pocket_depth + 0.10,
                     d = magnet_pocket_diameter);
    }
}


module assembled_backplate() {
    translate([0, 0, shell_body_depth]) backplate();
}


module backplate_insertion_sweep() {
    // The rear cover approaches straight from behind. Sweeping the complete
    // part at closely spaced approach positions proves the recess and finger
    // notch do not block it. Do not hull these shapes: hull would falsely fill
    // the four magnet pockets and report collisions with their matching posts.
    for (rear_offset = [0, 0.05, 0.16, 0.32, 0.64, 1.00, 2.00, 4.00, 6.00])
        translate([0, 0, rear_offset]) assembled_backplate();
}


module device_insertion_sweep() {
    // Rear loading must remain possible after all retention hardware is added.
    // Sweep the conservative device envelope 6 mm rearward through its final
    // approach; any intersection here exposes a blocked insertion path.
    hull() {
        solid_device_proxy();
        translate([0, 0, 6.00]) solid_device_proxy();
    }
}


module assembled_leg() {
    translate([0, socket_center_y,
               shell_body_depth + backplate_thickness + 0.15])
        rear_leg();
}


module colored_assembly() {
    color([0.52, 0.24, 0.65]) main_frame();
    color([0.44, 0.18, 0.57]) assembled_backplate();
    color([0.36, 0.12, 0.49]) assembled_leg();
    if (show_device_proxy) device_proxy();
}


module desktop_assembly() {
    // Original Y is frame-up and original Z is rearward. This rotation stands
    // the screen at the selected 30-degree backward lean for review.
    rotate([90 + target_backward_lean, 0, 0]) colored_assembly();
}


if (part == "frame") {
    // The uninterrupted visible face remains at Z=0 on the textured plate.
    main_frame();
} else if (part == "backplate") {
    // Inner face down. The magnet wells open on the plate; the rear leg socket
    // grows upward without support.
    backplate();
} else if (part == "leg") {
    // Cancel the assembled leg-body angle so its broad hidden face prints flat.
    intersection() {
        rotate([leg_body_angle, 0, 0])
            translate([0, leg_tongue_height / 2, 0]) rear_leg();
        translate([-100, -100, 0]) cube([200, 200, 200]);
    }
} else if (part == "fit_gauge") {
    fit_gauge();
} else if (part == "magnet_gauge") {
    magnet_gauge();
} else if (part == "assembly_backplate") {
    assembled_backplate();
} else if (part == "assembly_leg") {
    assembled_leg();
} else if (part == "device") {
    // Solid proxy for collision and enclosure-clearance validation.
    solid_device_proxy();
} else if (part == "intersection_frame_backplate") {
    intersection() { main_frame(); assembled_backplate(); }
} else if (part == "intersection_frame_backplate_path") {
    intersection() { main_frame(); backplate_insertion_sweep(); }
} else if (part == "intersection_frame_leg") {
    intersection() { main_frame(); assembled_leg(); }
} else if (part == "intersection_frame_device") {
    intersection() { main_frame(); solid_device_proxy(); }
} else if (part == "intersection_frame_device_path") {
    intersection() { main_frame(); device_insertion_sweep(); }
} else if (part == "intersection_backplate_leg") {
    intersection() { assembled_backplate(); assembled_leg(); }
} else if (part == "intersection_backplate_device") {
    intersection() { assembled_backplate(); solid_device_proxy(); }
} else if (part == "intersection_leg_device") {
    intersection() { assembled_leg(); solid_device_proxy(); }
} else if (part == "desktop_assembly") {
    desktop_assembly();
} else {
    colored_assembly();
}
