"""Build the Almaty map and bicycle graph from an OpenStreetMap API extract."""

import argparse
from collections import defaultdict
from html import escape
import json
from math import cos, hypot, radians
from pathlib import Path


BOUNDS = (76.898, 43.2195, 76.943, 43.243)
WIDTH = 960
WEST, SOUTH, EAST, NORTH = BOUNDS
METRES_LON = 111320 * cos(radians((NORTH + SOUTH) / 2))
METRES_LAT = 111132
METRES_PER_PIXEL = (EAST - WEST) * METRES_LON / WIDTH
HEIGHT = round((NORTH - SOUTH) * METRES_LAT / METRES_PER_PIXEL)

PLACES = {
    "mira": (43.23743, 76.91682), "arman": (43.23059, 76.90966),
    "dana": (43.23366, 76.92845), "timur": (43.22492, 76.92488),
    "101": (43.23659, 76.91912), "102": (43.23829, 76.91729),
    "103": (43.23694, 76.92780), "104": (43.22635, 76.91413),
    "105": (43.22728, 76.90533), "106": (43.23146, 76.91400),
    "107": (43.23673, 76.92955), "108": (43.23630, 76.93461),
    "109": (43.22957, 76.93274), "110": (43.22645, 76.92253),
    "111": (43.22534, 76.92788), "112": (43.22104, 76.93274),
}

ROAD_TYPES = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "living_street", "service", "cycleway", "pedestrian",
    "path", "footway", "steps", "track",
}
BIKE_TYPES = {
    "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "living_street", "service", "cycleway",
    "pedestrian", "path", "footway", "track",
}
BIKE_YES = {"yes", "designated", "permissive"}
BLOCKED = {"no", "private", "customers"}


def project(lat, lon):
    return ((lon - WEST) * METRES_LON / METRES_PER_PIXEL,
            (NORTH - lat) * METRES_LAT / METRES_PER_PIXEL)


def in_bounds(lat, lon):
    return SOUTH <= lat <= NORTH and WEST <= lon <= EAST


def length(a, b):
    return hypot((a[0] - b[0]) * METRES_LAT, (a[1] - b[1]) * METRES_LON)


def bike_direction(tags):
    highway = tags.get("highway", "").removesuffix("_link")
    bicycle = tags.get("bicycle")
    if highway not in BIKE_TYPES or bicycle in BLOCKED | {"dismount", "use_sidepath"}:
        return None
    if bicycle not in BIKE_YES and (
        tags.get("access") in BLOCKED or tags.get("vehicle") in BLOCKED
        or highway in {"pedestrian", "path", "footway", "track"}
    ):
        return None
    oneway = tags.get("oneway:bicycle", tags.get("oneway"))
    if oneway is None and tags.get("junction") == "roundabout":
        oneway = "yes"
    if oneway in {"yes", "true", "1"}:
        return 1
    if oneway == "-1":
        return -1
    return 0


def reachable(graph, seed):
    seen, stack = {seed}, [seed]
    while stack:
        for vertex in graph[stack.pop()]:
            if vertex not in seen:
                stack.append(vertex)
                seen.add(vertex)
    return seen


def build_network(ways, coordinates):
    edges = {}
    forward, backward = defaultdict(set), defaultdict(set)
    for way in ways:
        direction = bike_direction(way.get("tags", {}))
        if direction is None:
            continue
        for a, b in zip(way["nodes"], way["nodes"][1:]):
            if a == b or not all(node in coordinates and in_bounds(*coordinates[node]) for node in (a, b)):
                continue
            metres = round(length(coordinates[a], coordinates[b]), 2)
            if not metres:
                continue
            directions = [(a, b)] if direction == 1 else [(b, a)] if direction == -1 else [(a, b), (b, a)]
            for start, end in directions:
                edges[start, end] = metres
                forward[start].add(end)
                backward[end].add(start)

    seed = min(forward.keys() & backward.keys(), key=lambda node: length(coordinates[node], (43.2268, 76.9225)))
    connected = sorted(reachable(forward, seed) & reachable(backward, seed))
    vertices = {osm_id: index for index, osm_id in enumerate(connected)}
    points = [[round(value, 2) for value in project(*coordinates[node])] for node in connected]
    segments = [[vertices[a], vertices[b], metres] for (a, b), metres in sorted(edges.items())
                if a in vertices and b in vertices]
    anchors = {}
    for name, point in PLACES.items():
        nearest = min(connected, key=lambda node: length(coordinates[node], point))
        distance = length(coordinates[nearest], point)
        if distance > 150:
            raise ValueError(f"Demo stop {name} is {distance:.0f} metres from the road graph")
        anchors[name] = vertices[nearest]
    if len(set(anchors.values())) != len(anchors):
        raise ValueError("Two demo stops share the same road node")
    return {"width": WIDTH, "height": HEIGHT, "metresPerPixel": round(METRES_PER_PIXEL, 6),
            "points": points, "segments": segments, "anchors": anchors}


def path(points, close=False):
    if len(points) < 2:
        return ""
    return "M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in points) + ("Z" if close else "")


def render_map(ways, coordinates):
    layers = defaultdict(list)
    for way in ways:
        tags = way.get("tags", {})
        ids = way["nodes"]
        if len(ids) < 2 or any(node not in coordinates for node in ids):
            continue
        geometry = [coordinates[node] for node in ids]
        if not any(in_bounds(*point) for point in geometry):
            continue
        projected = [project(*point) for point in geometry]
        closed = ids[0] == ids[-1]
        highway = tags.get("highway", "").removesuffix("_link")
        if closed and tags.get("area") == "yes" and highway:
            layers["plaza"].append(path(projected, True))
        elif highway in ROAD_TYPES:
            road = ("major" if highway in {"motorway", "trunk", "primary", "secondary"}
                    else "street" if highway in {"tertiary", "unclassified", "residential", "living_street"}
                    else "path" if highway in {"path", "footway", "steps", "cycleway", "track"} else "local")
            layers["bridge" if tags.get("bridge") not in {None, "no"} else road].append(path(projected))
        elif tags.get("waterway") in {"river", "stream"}:
            layers["river"].append(path(projected))
        elif closed:
            if tags.get("natural") == "water" or tags.get("waterway") == "riverbank":
                layers["water"].append(path(projected, True))
            elif tags.get("building") not in {None, "no"}:
                layers["building"].append(path(projected, True))
            elif (tags.get("leisure") in {"park", "garden", "nature_reserve", "pitch", "recreation_ground"}
                  or tags.get("natural") in {"wood", "scrub", "grassland"}
                  or tags.get("landuse") in {"forest", "grass", "meadow", "village_green", "recreation_ground"}):
                layers["green"].append(path(projected, True))
            elif tags.get("amenity") in {"university", "college", "school"} or tags.get("landuse") == "education":
                layers["campus"].append(path(projected, True))

    def layer(name, fill, stroke="none", width=1, extra=""):
        shapes = layers[name]
        if not shapes:
            return ""
        return (f'<path d="{"".join(shapes)}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" '
                f'stroke-linecap="round" stroke-linejoin="round" {extra}/>')

    labels = [
        (43.2394, 76.9062, "АЛМАЛИНСКИЙ РАЙОН", "area", 0),
        (43.2332, 76.9164, "КОКТЕМ-3", "area", 0),
        (43.2300, 76.9177, "КОКТЕМ-2", "area", 0),
        (43.2311, 76.9278, "КОКТЕМ-1", "area", 0),
        (43.2241, 76.9119, "Ботанический сад", "green-label", 0),
        (43.2233, 76.9211, "КазНУ им. аль-Фараби", "poi", 0),
        (43.2358, 76.9188, "Музей Кастеева", "poi", 0),
        (43.2357, 76.9296, "Satbayev University", "poi", 0),
        (43.2356, 76.9097, "ул. Сатпаева", "road-label", -7),
        (43.2269, 76.9064, "ул. Тимирязева", "road-label", -7),
        (43.2281, 76.9253, "ул. Тимирязева", "road-label", -9),
        (43.2315, 76.9188, "бульвар Бухар Жырау", "road-label", -7),
        (43.2321, 76.9137, "ул. Байзакова", "road-label", 84),
        (43.2264, 76.9298, "Есентай", "river-label", 61),
        (43.2229, 76.9374, "пр. Аль-Фараби", "road-label", -39),
    ]
    text = []
    for lat, lon, name, style, angle in labels:
        x, y = project(lat, lon)
        text.append(f'<text x="{x:.1f}" y="{y:.1f}" class="{style}" '
                    f'transform="rotate({angle} {x:.1f} {y:.1f})">{escape(name)}</text>')
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}">',
        '<!-- Map data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright -->',
        "<style>text{font:650 11px system-ui,sans-serif;text-anchor:middle;paint-order:stroke;stroke:#f6f6ef;stroke-width:3;stroke-linejoin:round}"
        ".area{font-size:11px;letter-spacing:1.5px;fill:#666879}.poi{fill:#3b597b}.road-label{fill:#686666;font-size:10px}"
        ".green-label{fill:#316340;font-size:13px}.river-label{fill:#306776;font-style:italic}</style>",
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#ecece6"/>',
        layer("campus", "#e4e8df"), layer("green", "#d2e4c9", "#c1d7b9", .5),
        layer("plaza", "#f0eee5"), layer("building", "#d7d6d0", "#cfcdc7", .3),
        layer("water", "#b5d9e0"), layer("river", "none", "#a7cfdb", 7),
        layer("path", "none", "#f7f8ed", 1.5, 'stroke-dasharray="2 2"'),
        layer("local", "none", "#f9f8f0", 2),
        layer("street", "none", "#d7d6cb", 5.2), layer("street", "none", "#fffdf5", 3.7),
        layer("major", "none", "#d9c6a2", 7.4), layer("major", "none", "#f8e4ba", 5.8),
        layer("bridge", "none", "#d7c7a9", 7.4), layer("bridge", "none", "#ffedc6", 5.5),
        *text, "</svg>",
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("extract", type=Path, help="OpenStreetMap API map.json response")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    args = parser.parse_args()
    elements = json.loads(args.extract.read_text(encoding="utf-8"))["elements"]
    coordinates = {item["id"]: (item["lat"], item["lon"]) for item in elements if item["type"] == "node"}
    ways = [item for item in elements if item["type"] == "way"]
    network = build_network(ways, coordinates)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "almaty-data.mjs").write_text(
        "// © OpenStreetMap contributors. Database: ODbL 1.0, https://www.openstreetmap.org/copyright\n"
        "export default " + json.dumps(network, separators=(",", ":")) + ";\n", encoding="utf-8",
    )
    (args.out / "almaty-base.svg").write_text(render_map(ways, coordinates), encoding="utf-8")
    print(f'{len(network["points"])} nodes, {len(network["segments"])} directed edges, {WIDTH}x{HEIGHT} map')


if __name__ == "__main__":
    main()
