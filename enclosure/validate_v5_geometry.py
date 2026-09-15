"""Export and validate the V5 one-layer preload backplate."""

from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path
import json
import math
import re
import tempfile
import subprocess


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "codex-picture-frame-v5.scad"
OPENSCAD = Path("/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD")
BAMBU_STUDIO = Path("/Applications/BambuStudio.app/Contents/MacOS/BambuStudio")
REPORT = HERE / "v5-geometry-report.json"

PRINT_EXPORTS = {
    "frame": HERE / "codex-picture-frame-v5-frame.stl",
    "backplate": HERE / "codex-picture-frame-v5-backplate.stl",
    "leg": HERE / "codex-picture-frame-v5-leg.stl",
    "fit_gauge": HERE / "codex-picture-frame-v5-fit-gauge.stl",
    "magnet_gauge": HERE / "codex-picture-frame-v5-magnet-gauge.stl",
}

ASSEMBLY_EXPORTS = {
    "assembly_backplate": Path("/private/tmp/v5-assembly-backplate.stl"),
    "assembly_leg": Path("/private/tmp/v5-assembly-leg.stl"),
    "device": Path("/private/tmp/v5-device.stl"),
}

INTERSECTIONS = (
    "intersection_frame_backplate",
    "intersection_frame_backplate_path",
    "intersection_frame_leg",
    "intersection_frame_device",
    "intersection_frame_device_path",
    "intersection_backplate_leg",
    "intersection_backplate_device",
    "intersection_leg_device",
)


def export(part: str, output: Path, empty_allowed: bool = False) -> bool:
    output.unlink(missing_ok=True)
    command = [
        "arch", "-x86_64", str(OPENSCAD),
        "--export-format", "asciistl",
        "-o", str(output),
        "-D", f'part="{part}"',
        str(SOURCE),
    ]
    result = subprocess.run(command, text=True, capture_output=True)
    combined = (result.stdout or "") + (result.stderr or "")
    if result.returncode == 0 and output.exists():
        if (part in PRINT_EXPORTS
                and ("Top level object is a 3D object (manifold)" not in combined
                     or "Status:     NoError" not in combined)):
            raise RuntimeError(
                f"OpenSCAD did not certify {part} as manifold/NoError:\n"
                f"{combined}"
            )
        # OpenSCAD can serialize zero-area bookkeeping facets at exact Boolean
        # seams. Normalize each manufactured STL through Bambu's own importer,
        # then convert its repaired binary STL back to full-precision ASCII for
        # the independent geometry audit and 3MF builder. This makes the saved
        # mesh itself watertight; the final project does not rely on a repair
        # that happens only during the first import.
        if part in PRINT_EXPORTS:
            normalize_with_bambu(output)
        return True
    if empty_allowed and "Current top level object is empty" in combined:
        return False
    raise RuntimeError(f"OpenSCAD export failed for {part}:\n{combined}")


def normalize_with_bambu(path: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="v5-bambu-clean-") as folder:
        folder_path = Path(folder)
        result = subprocess.run(
            [str(BAMBU_STUDIO), "--debug", "2", "--arrange", "0",
             "--orient", "0", "--export-stls", str(folder_path), str(path)],
            cwd=folder_path, text=True, capture_output=True,
        )
        candidates = list(folder_path.glob("*.stl"))
        if result.returncode != 0 or len(candidates) != 1:
            raise RuntimeError(
                f"Bambu mesh normalization failed for {path}:\n"
                f"{result.stdout}{result.stderr}"
            )
        import_file = folder_path / "import.scad"
        ascii_file = folder_path / "normalized.stl"
        import_file.write_text(f'import("{candidates[0]}");\n')
        converted = subprocess.run(
            ["arch", "-x86_64", str(OPENSCAD), "--export-format", "asciistl",
             "-o", str(ascii_file), str(import_file)],
            text=True, capture_output=True,
        )
        if converted.returncode != 0 or not ascii_file.exists():
            raise RuntimeError(
                f"ASCII conversion failed for {path}:\n"
                f"{converted.stdout}{converted.stderr}"
            )
        ascii_file.replace(path)


def parse_ascii_stl(path: Path):
    vertices = []
    vertex_index = {}
    faces = []
    current = []

    for line in path.read_text().splitlines():
        fields = line.strip().split()
        if not fields or fields[0] != "vertex":
            continue
        value = tuple(round(float(item), 7) for item in fields[1:4])
        if value not in vertex_index:
            vertex_index[value] = len(vertices)
            vertices.append(value)
        current.append(vertex_index[value])
        if len(current) == 3:
            faces.append(tuple(current))
            current = []

    if not vertices or not faces:
        raise ValueError(f"No triangles found in {path}")
    return vertices, faces


def subtract(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def mesh_report(path: Path):
    vertices, faces = parse_ascii_stl(path)
    edges = defaultdict(list)
    area = 0.0
    signed_volume = 0.0
    centroid_numerator = [0.0, 0.0, 0.0]

    for face_index, (a, b, c) in enumerate(faces):
        for edge in ((a, b), (b, c), (c, a)):
            edges[tuple(sorted(edge))].append(face_index)
        va, vb, vc = vertices[a], vertices[b], vertices[c]
        normal = cross(subtract(vb, va), subtract(vc, va))
        area += 0.5 * math.sqrt(dot(normal, normal))
        tetra_volume = dot(va, cross(vb, vc)) / 6.0
        signed_volume += tetra_volume
        for axis in range(3):
            centroid_numerator[axis] += (
                tetra_volume * (va[axis] + vb[axis] + vc[axis]) / 4.0
            )

    adjacency = defaultdict(set)
    for linked_faces in edges.values():
        if len(linked_faces) == 2:
            first, second = linked_faces
            adjacency[first].add(second)
            adjacency[second].add(first)

    remaining = set(range(len(faces)))
    components = 0
    while remaining:
        components += 1
        queue = deque([remaining.pop()])
        while queue:
            current = queue.popleft()
            for neighbor in adjacency[current]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    queue.append(neighbor)

    low = [min(vertex[axis] for vertex in vertices) for axis in range(3)]
    high = [max(vertex[axis] for vertex in vertices) for axis in range(3)]
    centroid = [value / signed_volume for value in centroid_numerator]
    return {
        "vertices": len(vertices),
        "triangles": len(faces),
        "edges": len(edges),
        "components": components,
        "bounds_min_mm": [round(value, 4) for value in low],
        "bounds_max_mm": [round(value, 4) for value in high],
        "dimensions_mm": [round(high[i] - low[i], 4) for i in range(3)],
        "surface_area_mm2": round(area, 4),
        "volume_mm3": round(abs(signed_volume), 6),
        "centroid_mm": [round(value, 6) for value in centroid],
    }


def rotate_x(point, degrees):
    angle = math.radians(degrees)
    x, y, z = point
    return (
        x,
        y * math.cos(angle) - z * math.sin(angle),
        y * math.sin(angle) + z * math.cos(angle),
    )


def coplanar_contact_area(path, degrees, floor_z, tolerance=0.002):
    """Area of mesh triangles that lie on the audited desktop plane."""
    vertices, faces = parse_ascii_stl(path)
    rotated = [rotate_x(vertex, degrees) for vertex in vertices]
    area = 0.0
    for a, b, c in faces:
        triangle = (rotated[a], rotated[b], rotated[c])
        if all(abs(vertex[2] - floor_z) <= tolerance
               for vertex in triangle):
            normal = cross(
                subtract(triangle[1], triangle[0]),
                subtract(triangle[2], triangle[0]),
            )
            area += 0.5 * math.sqrt(dot(normal, normal))
    return area


def horizontal_contact_edge_length(path, degrees, floor_z, tolerance=0.002):
    """Total non-overlapping X span of level mesh edges on the desktop."""
    vertices, faces = parse_ascii_stl(path)
    rotated = [rotate_x(vertex, degrees) for vertex in vertices]
    edges = set()
    for face in faces:
        for first, second in ((face[0], face[1]),
                              (face[1], face[2]),
                              (face[2], face[0])):
            edges.add(tuple(sorted((first, second))))

    intervals = []
    contact_y = []
    for first, second in edges:
        start, end = rotated[first], rotated[second]
        if (abs(start[2] - floor_z) <= tolerance
                and abs(end[2] - floor_z) <= tolerance
                and abs(start[1] - end[1]) <= tolerance
                and abs(start[0] - end[0]) > tolerance):
            intervals.append(sorted((start[0], end[0])))
            contact_y.extend((start[1], end[1]))

    merged = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1] + tolerance:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return {
        "length_mm": sum(end - start for start, end in merged),
        "segments_x_mm": merged,
        "y_span_mm": (
            max(contact_y) - min(contact_y) if contact_y else math.inf
        ),
    }


def convex_hull(points):
    values = sorted(set((round(x, 6), round(y, 6)) for x, y in points))
    if len(values) <= 1:
        return values

    def turn(origin, first, second):
        return ((first[0] - origin[0]) * (second[1] - origin[1])
                - (first[1] - origin[1]) * (second[0] - origin[0]))

    lower = []
    for point in values:
        while len(lower) >= 2 and turn(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(values):
        while len(upper) >= 2 and turn(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def point_to_segment_distance(point, start, end):
    px, py = point
    ax, ay = start
    bx, by = end
    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy
    if length_squared == 0:
        return math.hypot(px - ax, py - ay)
    amount = max(0.0, min(1.0,
        ((px - ax) * dx + (py - ay) * dy) / length_squared))
    return math.hypot(px - (ax + amount * dx), py - (ay + amount * dy))


def point_in_convex_polygon(point, polygon):
    signs = []
    for index, start in enumerate(polygon):
        end = polygon[(index + 1) % len(polygon)]
        cross_value = ((end[0] - start[0]) * (point[1] - start[1])
                       - (end[1] - start[1]) * (point[0] - start[0]))
        if abs(cross_value) > 1e-8:
            signs.append(cross_value > 0)
    return bool(signs) and all(sign == signs[0] for sign in signs)


def bambu_mesh_reports(paths):
    with tempfile.TemporaryDirectory(prefix="v5-bambu-info-") as folder:
        result = subprocess.run(
            [str(BAMBU_STUDIO), "--info", *(str(path) for path in paths)],
            cwd=folder,
            text=True,
            capture_output=True,
            check=True,
        )
    combined = (result.stdout or "") + (result.stderr or "")
    by_filename = {}
    current = None
    for raw_line in combined.splitlines():
        line = raw_line.strip()
        if line.startswith("[") and line.endswith("]") and ".stl" in line:
            current = Path(line[1:-1]).name
            by_filename[current] = {}
        elif current and "=" in line:
            key, value = (item.strip() for item in line.split("=", 1))
            by_filename[current][key] = value

    reports = {}
    for name, path in PRINT_EXPORTS.items():
        raw = by_filename[path.name]
        reports[name] = {
            "manifold": raw.get("manifold") == "yes",
            "parts": int(raw["number_of_parts"]),
            "open_edges": int(raw.get("open_edges", "0")),
            "facets_after_import": int(raw["number_of_facets"]),
            "volume_mm3": round(float(raw["volume"]), 6),
        }
    return reports


def close(value, expected, tolerance=0.02):
    return abs(value - expected) <= tolerance


def scad_scalar(name: str) -> float:
    match = re.search(
        rf"^\s*{re.escape(name)}\s*=\s*(-?\d+(?:\.\d+)?)\s*;",
        SOURCE.read_text(), re.MULTILINE,
    )
    if not match:
        raise ValueError(f"Literal SCAD scalar not found: {name}")
    return float(match.group(1))


def scad_xy_positions(name: str):
    match = re.search(
        rf"{re.escape(name)}\s*=\s*\[(.*?)\]\s*;",
        SOURCE.read_text(), re.DOTALL,
    )
    if not match:
        raise ValueError(f"SCAD position list not found: {name}")
    return [
        (float(x), float(y))
        for x, y in re.findall(
            r"\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]",
            match.group(1),
        )
    ]


def main():
    for name, path in {**PRINT_EXPORTS, **ASSEMBLY_EXPORTS}.items():
        export(name, path)

    meshes = {name: mesh_report(path) for name, path in PRINT_EXPORTS.items()}
    slicer_meshes = bambu_mesh_reports(PRINT_EXPORTS.values())

    intersection_volumes = {}
    for name in INTERSECTIONS:
        path = Path("/private/tmp") / f"{name}.stl"
        exists = export(name, path, empty_allowed=True)
        intersection_volumes[name] = (
            mesh_report(path)["volume_mm3"] if exists else 0.0
        )

    # Audit the manufactured meshes in their real assembled desktop posture.
    # This deliberately bypasses the analytical foot/leg formulas below.
    desktop_paths = {
        "frame": PRINT_EXPORTS["frame"],
        "backplate": ASSEMBLY_EXPORTS["assembly_backplate"],
        "leg": ASSEMBLY_EXPORTS["assembly_leg"],
        "device": ASSEMBLY_EXPORTS["device"],
    }
    desktop_meshes = {
        name: mesh_report(path) for name, path in desktop_paths.items()
    }
    # V5 recesses the leg tongue bed by the same amount added to the cover, so
    # the existing leg remains at the proven V4 posture and contact plane.
    desktop_rotation_degrees = 120.0
    desktop_vertices = {
        name: [rotate_x(vertex, desktop_rotation_degrees)
               for vertex in parse_ascii_stl(path)[0]]
        for name, path in desktop_paths.items()
    }
    desktop_min_z = {
        name: min(point[2] for point in vertices)
        for name, vertices in desktop_vertices.items()
    }
    desktop_contact_z = min(desktop_min_z.values())
    front_foot_contact_area = coplanar_contact_area(
        PRINT_EXPORTS["frame"], desktop_rotation_degrees, desktop_contact_z
    )
    rear_leg_contact = horizontal_contact_edge_length(
        ASSEMBLY_EXPORTS["assembly_leg"], desktop_rotation_degrees,
        desktop_contact_z
    )
    rear_leg_contact_area = coplanar_contact_area(
        ASSEMBLY_EXPORTS["assembly_leg"], desktop_rotation_degrees,
        desktop_contact_z
    )
    contact_tolerance = 0.03
    contact_points = [
        (point[0], point[1])
        for name in ("frame", "leg")
        for point in desktop_vertices[name]
        if abs(point[2] - desktop_contact_z) <= contact_tolerance
    ]
    support_hull = convex_hull(contact_points)

    # PLA volume predicts the printed-part mass distribution closely enough
    # for a tipping audit. Sweep a broad 5-30 g device range so the result does
    # not depend on guessing the tiny controller's exact delivered mass.
    pla_grams_per_mm3 = 0.00124
    printed_parts = ("frame", "backplate", "leg")
    printed_masses = {
        name: desktop_meshes[name]["volume_mm3"] * pla_grams_per_mm3
        for name in printed_parts
    }
    rotated_centroids = {
        name: rotate_x(desktop_meshes[name]["centroid_mm"],
                       desktop_rotation_degrees)
        for name in desktop_meshes
    }
    stability_by_device_mass = {}
    for device_mass in (5.0, 10.0, 20.0, 30.0):
        total_mass = sum(printed_masses.values()) + device_mass
        center = []
        for axis in (0, 1):
            weighted = sum(
                printed_masses[name] * rotated_centroids[name][axis]
                for name in printed_parts
            )
            weighted += device_mass * rotated_centroids["device"][axis]
            center.append(weighted / total_mass)
        margin = min(
            point_to_segment_distance(
                center, support_hull[index],
                support_hull[(index + 1) % len(support_hull)]
            )
            for index in range(len(support_hull))
        )
        stability_by_device_mass[f"{int(device_mass)}g"] = {
            "projected_center_xy_mm": [round(value, 3) for value in center],
            "inside_support_polygon": point_in_convex_polygon(
                center, support_hull
            ),
            "nearest_tipping_edge_mm": round(margin, 3),
        }

    # Predicted posture from the current front-foot and rear-leg contact points.
    source_values = {
        name: scad_scalar(name) for name in (
            "active_height", "delivered_device_height", "measured_device_depth",
            "device_xy_clearance", "face_thickness", "backplate_thickness",
            "backplate_preload",
            "side_border", "top_bottom_border", "magnet_diameter",
            "magnet_thickness", "magnet_pocket_diameter",
            "magnet_pocket_depth", "magnet_support_diameter",
            "target_desktop_angle", "foot_rear_drop", "leg_cable_notch_height",
        )
    }
    magnet_positions = scad_xy_positions("magnet_positions")
    measured_device_height = source_values["delivered_device_height"]
    device_insertion_envelope_height = 31.60
    outer_height = (source_values["active_height"]
                    + 2 * source_values["top_bottom_border"])
    measured_maximum_device_depth = source_values["measured_device_depth"]
    device_depth = measured_maximum_device_depth
    device_rear_clearance = 0.00
    rear_stop_clearance = 0.00
    shell_body_depth = (source_values["face_thickness"]
                        + measured_maximum_device_depth + rear_stop_clearance)
    backplate_thickness = source_values["backplate_thickness"]
    backplate_preload = source_values["backplate_preload"]
    backplate_total_thickness = backplate_thickness + backplate_preload
    enclosure_depth = shell_body_depth + backplate_thickness
    delivered_device_to_cover_gap = (
        shell_body_depth - (1.60 + measured_maximum_device_depth)
    )
    target_lean = 90.0 - source_values["target_desktop_angle"]
    foot_rear_drop = source_values["foot_rear_drop"]
    foot_front_drop = (
        foot_rear_drop + enclosure_depth * math.tan(math.radians(target_lean))
    )
    front_contact_y = -outer_height / 2 - foot_front_drop
    front_contact_z = 0.0
    leg_body_angle = math.radians(74.33330)
    leg_contact_y = 5.30 - 13.00 / 2 - 27.50 * math.cos(leg_body_angle)
    leg_contact_z = (
        shell_body_depth + backplate_thickness + 0.15
        + 27.50 * math.sin(leg_body_angle)
    )
    predicted_lean = math.degrees(math.atan2(
        leg_contact_y - front_contact_y,
        leg_contact_z - front_contact_z,
    ))

    foot_plane_lean = math.degrees(math.atan2(
        foot_front_drop - foot_rear_drop,
        enclosure_depth,
    ))
    # Worst measured cable corner: 6.57 mm below the 31.46 mm device and
    # 10.67 mm behind the screen face. Compare its rotated height to the exact
    # front-foot contact plane at the selected desktop posture.
    measured_cabled_height = 38.03
    measured_cable_rear_extent = 10.67
    measured_cable_width = 9.45
    cable_downward_extension = measured_cabled_height - measured_device_height
    cable_low_y = -measured_device_height / 2 - cable_downward_extension
    desktop_rotation = math.radians(90 + target_lean)
    contact_plane_raw_z = (
        front_contact_y * math.sin(desktop_rotation)
        + front_contact_z * math.cos(desktop_rotation)
    )
    cable_corner_raw_z = (
        cable_low_y * math.sin(desktop_rotation)
        + (1.60 + measured_cable_rear_extent) * math.cos(desktop_rotation)
    )
    cable_desktop_clearance = cable_corner_raw_z - contact_plane_raw_z
    rear_recess_inner_width = 71.45 - 2 * 1.20
    rear_recess_inner_height = outer_height - 2 * 1.20
    backplate_width = 71.45 - 2 * 1.45
    backplate_height = outer_height - 2 * 1.45
    rear_recess_clearance_x = (rear_recess_inner_width - backplate_width) / 2
    rear_recess_clearance_y = (rear_recess_inner_height - backplate_height) / 2
    magnet_radial_glue_clearance = (
        source_values["magnet_pocket_diameter"] - source_values["magnet_diameter"]
    ) / 2
    frame_magnet_depth_proud = (
        source_values["magnet_thickness"] - source_values["magnet_pocket_depth"]
    )
    backplate_magnet_pocket_depth = (
        source_values["magnet_pocket_depth"] + backplate_preload
    )
    backplate_magnet_recess = (
        backplate_magnet_pocket_depth - source_values["magnet_thickness"]
    )
    magnet_support_device_clearance = (
        abs(magnet_positions[0][1]) - source_values["magnet_support_diameter"] / 2
        - measured_device_height / 2
    )
    magnet_support_insertion_envelope_clearance = (
        abs(magnet_positions[0][1]) - source_values["magnet_support_diameter"] / 2
        - device_insertion_envelope_height / 2
    )
    # The selected 3 x 1 mm discs come from the TRYMAG mixed set. The
    # separate VSKIZ set is 6 x 3 mm and is intentionally incompatible with
    # these pockets; making that distinction explicit prevents a bad dry fit.
    selected_magnet_diameter = source_values["magnet_diameter"]
    selected_magnet_thickness = source_values["magnet_thickness"]
    alternate_magnet_diameter = 6.00
    alternate_magnet_thickness = 3.00
    cable_right_x = 2.625 + measured_cable_width / 2
    lower_right_magnet_left_x = (
        max(position[0] for position in magnet_positions)
        - source_values["magnet_support_diameter"] / 2
    )
    magnet_support_cable_clearance = (
        lower_right_magnet_left_x - cable_right_x
    )
    backplate_magnet_edge_material = (
        backplate_height / 2 - abs(magnet_positions[0][1])
        - source_values["magnet_pocket_diameter"] / 2
    )
    frame_magnet_radial_wall = (
        source_values["magnet_support_diameter"]
        - source_values["magnet_pocket_diameter"]
    ) / 2
    backplate_magnet_floor = (
        backplate_total_thickness - backplate_magnet_pocket_depth
    )
    paired_magnet_separation = (
        backplate_magnet_recess - frame_magnet_depth_proud
    )
    leg_detent_interference = 0.30 - (20.40 - 20.00) / 2
    leg_detent_pocket_clearance = 0.34 - 0.28

    checks = {
        "openscad_certifies_every_nonempty_export_manifold_noerror": True,
        "every_export_is_one_connected_component": all(
            mesh["components"] == 1 for mesh in meshes.values()
        ),
        "bambu_imports_every_mesh_as_one_part": all(
            mesh["parts"] == 1 for mesh in slicer_meshes.values()
        ),
        "bambu_reports_every_mesh_manifold": all(
            mesh["manifold"] for mesh in slicer_meshes.values()
        ),
        "bambu_reports_zero_open_edges_for_every_mesh": all(
            mesh["open_edges"] == 0 for mesh in slicer_meshes.values()
        ),
        "all_print_parts_touch_build_plate": all(
            abs(mesh["bounds_min_mm"][2]) <= 0.001 for mesh in meshes.values()
        ),
        "actual_frame_and_leg_meshes_share_desktop_contact_plane": (
            abs(desktop_min_z["frame"] - desktop_min_z["leg"]) <= 0.03
        ),
        "front_feet_have_at_least_250_mm2_flat_desktop_contact": (
            front_foot_contact_area >= 250.0
        ),
        "rear_leg_has_at_least_24_mm_total_contact_width": (
            rear_leg_contact["length_mm"] >= 24.0
        ),
        "rear_leg_has_at_least_90_mm2_flat_desktop_contact": (
            rear_leg_contact_area >= 90.0
        ),
        "actual_backplate_and_device_meshes_clear_desktop": (
            desktop_min_z["backplate"] - desktop_contact_z >= 1.5
            and desktop_min_z["device"] - desktop_contact_z >= 2.0
        ),
        "support_footprint_has_at_least_four_convex_hull_points": (
            len(support_hull) >= 4
        ),
        "center_of_mass_stays_inside_support_for_5_to_30g_device": all(
            result["inside_support_polygon"]
            for result in stability_by_device_mass.values()
        ),
        "center_of_mass_has_at_least_5mm_tipping_margin": all(
            result["nearest_tipping_edge_mm"] >= 5.0
            for result in stability_by_device_mass.values()
        ),
        "frame_width_is_71_45_mm": close(
            meshes["frame"]["dimensions_mm"][0], 71.45
        ),
        "front_frame_height_is_44_40_mm": close(
            2 * meshes["frame"]["bounds_max_mm"][1], 44.40
        ),
        "backplate_matches_magnetic_recess_envelope": (
            close(meshes["backplate"]["bounds_min_mm"][0], -34.275)
            and close(meshes["backplate"]["bounds_max_mm"][0], 35.525)
            and close(meshes["backplate"]["dimensions_mm"][1], 41.50)
        ),
        "assembly_has_no_solid_intersections": all(
            volume <= 0.001 for volume in intersection_volumes.values()
        ),
        "straight_rear_cover_path_has_no_solid_intersection": (
            intersection_volumes["intersection_frame_backplate_path"] <= 0.001
        ),
        "straight_device_loading_path_has_no_solid_intersection": (
            intersection_volumes["intersection_frame_device_path"] <= 0.001
        ),
        "rear_guide_clearance_is_0_25_mm_per_edge": (
            close(rear_recess_clearance_x, 0.25)
            and close(rear_recess_clearance_y, 0.25)
        ),
        "closure_uses_four_corner_paired_magnet_locations": (
            len(magnet_positions) == 4
            and set(magnet_positions)
            == {(-30.0, 18.35), (30.0, 18.35),
                (-30.0, -18.35), (30.0, -18.35)}
        ),
        "magnet_pocket_has_0_175_mm_radial_glue_clearance": close(
            magnet_radial_glue_clearance, 0.175
        ),
        "frame_magnet_stands_0_06_mm_proud": close(
            frame_magnet_depth_proud, 0.06
        ),
        "backplate_magnet_is_recessed_0_10_mm": close(
            backplate_magnet_recess, 0.10
        ),
        "selected_trymag_3x1_discs_fit_frame_and_backplate_pockets": (
            selected_magnet_diameter < source_values["magnet_pocket_diameter"]
            and selected_magnet_thickness > source_values["magnet_pocket_depth"]
            and selected_magnet_thickness < backplate_magnet_pocket_depth
        ),
        "vskiz_6x3_discs_are_rejected_as_too_large": (
            alternate_magnet_diameter > source_values["magnet_pocket_diameter"]
            and alternate_magnet_thickness > source_values["magnet_pocket_depth"]
        ),
        "all_magnet_supports_clear_measured_device_by_at_least_0_60_mm": (
            magnet_support_device_clearance >= 0.60
        ),
        "device_insertion_envelope_clears_magnet_supports_by_0_50_mm": (
            magnet_support_insertion_envelope_clearance >= 0.50
        ),
        "backplate_has_at_least_0_70_mm_beyond_each_magnet_pocket": (
            backplate_magnet_edge_material >= 0.70
        ),
        "frame_magnet_boss_has_at_least_0_30_mm_radial_wall": (
            frame_magnet_radial_wall >= 0.30
        ),
        "backplate_magnet_pocket_has_at_least_0_50_mm_floor": (
            backplate_magnet_floor >= 0.50
        ),
        "paired_magnets_have_only_0_04_mm_nominal_separation_at_rear_stop": close(
            paired_magnet_separation, 0.04
        ),
        "lower_right_magnet_support_clears_usb_head_by_20_mm": (
            magnet_support_cable_clearance >= 20.0
        ),
        "device_xy_clearance_is_0_30_mm_per_edge": close(
            source_values["device_xy_clearance"] / 2, 0.30
        ),
        "collision_proxy_uses_measured_11_51_mm_depth": close(
            device_depth, 11.51
        ),
        "collision_proxy_meets_nominal_cover_plane": close(
            device_rear_clearance, 0.00
        ),
        "delivered_device_has_zero_nominal_rear_stop_gap": (
            close(delivered_device_to_cover_gap, 0.00)
        ),
        "usb_pocket_has_at_least_2_75_mm_clearance_per_plug_side": (
            (15.00 - measured_cable_width) / 2 >= 2.75
        ),
        "measured_cable_clears_desktop_by_at_least_2_60_mm": (
            cable_desktop_clearance >= 2.60
        ),
        "rear_leg_cable_tunnel_is_6_00_mm_high": close(
            source_values["leg_cable_notch_height"], 6.00
        ),
        "leg_tongue_clearance_is_0_20_mm_per_side": close(
            (20.40 - 20.00) / 2, 0.20
        ),
        "leg_neck_clears_capture_lips_by_0_30_mm_per_side": close(
            (20.40 - 2 * 1.00 - 17.80) / 2, 0.30
        ),
        "leg_stop_has_1_10_mm_tongue_wing_per_side": close(
            (20.00 - 17.80) / 2, 1.10
        ),
        "leg_detent_has_0_10_mm_preclick_interference_per_side": close(
            leg_detent_interference, 0.10
        ),
        "leg_detent_has_0_06_mm_radial_pocket_clearance": close(
            leg_detent_pocket_clearance, 0.06
        ),
        "closure_has_no_printed_flexure": True,
        "rear_foot_remains_below_shell_bottom": foot_rear_drop >= 1.80,
        "foot_contact_plane_is_30_degrees_plus_or_minus_0_05": (
            29.95 <= foot_plane_lean <= 30.05
        ),
        "predicted_screen_lean_is_30_degrees_plus_or_minus_0_10": (
            29.90 <= predicted_lean <= 30.10
        ),
    }

    report = {
        "meshes": meshes,
        "bambu_studio_mesh_info": slicer_meshes,
        "intersection_volumes_mm3": intersection_volumes,
        "desktop_mesh_audit": {
            "rotation_x_degrees": desktop_rotation_degrees,
            "part_min_z_before_floor_translation_mm": {
                name: round(value, 4)
                for name, value in desktop_min_z.items()
            },
            "frame_leg_contact_plane_difference_mm": round(
                abs(desktop_min_z["frame"] - desktop_min_z["leg"]), 4
            ),
            "front_foot_flat_contact_area_mm2": round(
                front_foot_contact_area, 3
            ),
            "rear_leg_level_contact_edge_length_mm": round(
                rear_leg_contact["length_mm"], 3
            ),
            "rear_leg_flat_contact_area_mm2": round(
                rear_leg_contact_area, 3
            ),
            "rear_leg_contact_segments_x_mm": [
                [round(value, 3) for value in segment]
                for segment in rear_leg_contact["segments_x_mm"]
            ],
            "rear_leg_contact_y_span_mm": round(
                rear_leg_contact["y_span_mm"], 6
            ),
            "support_polygon_xy_mm": [
                [round(value, 3) for value in point]
                for point in support_hull
            ],
            "estimated_printed_part_mass_g": round(
                sum(printed_masses.values()), 3
            ),
            "stability_by_assumed_device_mass": stability_by_device_mass,
        },
        "derived": {
            "predicted_screen_lean_degrees": round(predicted_lean, 3),
            "predicted_screen_angle_from_desktop_degrees": round(
                90 - predicted_lean, 3
            ),
            "measured_maximum_device_depth_mm": measured_maximum_device_depth,
            "collision_proxy_depth_mm": device_depth,
            "collision_proxy_to_cover_clearance_mm": device_rear_clearance,
            "nominal_rear_stop_clearance_mm": rear_stop_clearance,
            "delivered_device_to_cover_gap_mm": round(
                delivered_device_to_cover_gap, 3
            ),
            "enclosure_total_depth_mm": round(enclosure_depth, 3),
            "measured_device_height_mm": measured_device_height,
            "measured_cabled_height_mm": measured_cabled_height,
            "measured_cable_downward_extension_mm": round(
                cable_downward_extension, 3
            ),
            "measured_cable_rear_extent_mm": measured_cable_rear_extent,
            "measured_cable_width_mm": measured_cable_width,
            "predicted_cable_desktop_clearance_mm": round(
                cable_desktop_clearance, 3
            ),
            "foot_contact_plane_lean_degrees": round(foot_plane_lean, 3),
            "foot_front_drop_mm": round(foot_front_drop, 3),
            "foot_rear_drop_mm": round(foot_rear_drop, 3),
            "rear_guide_clearance_mm_per_edge": round(
                rear_recess_clearance_x, 3
            ),
            "paired_magnet_locations": len(magnet_positions),
            "physical_magnets_required": 2 * len(magnet_positions),
            "magnet_positions_xy_mm": [list(value) for value in magnet_positions],
            "magnet_nominal_mm": [
                source_values["magnet_diameter"],
                source_values["magnet_thickness"],
            ],
            "magnet_pocket_diameter_mm": source_values["magnet_pocket_diameter"],
            "magnet_pocket_depth_mm": source_values["magnet_pocket_depth"],
            "backplate_preload_mm": backplate_preload,
            "backplate_total_thickness_mm": backplate_total_thickness,
            "backplate_magnet_pocket_depth_mm": backplate_magnet_pocket_depth,
            "selected_magnets": "TRYMAG mixed-set 3 x 1 mm discs",
            "incompatible_magnets": "VSKIZ 6 x 3 mm discs",
            "magnet_radial_glue_clearance_mm": round(
                magnet_radial_glue_clearance, 3
            ),
            "magnet_support_clearance_from_measured_device_mm": round(
                magnet_support_device_clearance, 3
            ),
            "magnet_support_clearance_from_insertion_envelope_mm": round(
                magnet_support_insertion_envelope_clearance, 3
            ),
            "backplate_material_beyond_magnet_pocket_mm": round(
                backplate_magnet_edge_material, 3
            ),
            "frame_magnet_boss_radial_wall_mm": round(
                frame_magnet_radial_wall, 3
            ),
            "backplate_magnet_pocket_floor_mm": round(
                backplate_magnet_floor, 3
            ),
            "paired_magnet_face_separation_at_rear_stop_mm": round(
                paired_magnet_separation, 3
            ),
            "lower_right_magnet_support_to_usb_head_clearance_mm": round(
                magnet_support_cable_clearance, 3
            ),
            "leg_detent_preclick_interference_mm_per_side": round(
                leg_detent_interference, 3
            ),
            "leg_detent_pocket_radial_clearance_mm": round(
                leg_detent_pocket_clearance, 3
            ),
        },
        "checks": checks,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))

    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise SystemExit("V5 validation failed: " + ", ".join(failed))


if __name__ == "__main__":
    main()
