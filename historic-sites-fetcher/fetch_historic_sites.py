from __future__ import annotations

import argparse
import json
import re
import sys
import time
from typing import Any

import requests


OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

VALID_CATEGORIES = {
    "temple",
    "museum",
    "market",
    "monument",
    "palace",
    "park",
    "neighborhood",
    "bridge",
    "shrine",
    "cultural-site",
}

VALID_VIBE_TAGS = {
    "historic",
    "vintage",
    "riverside",
    "street-food",
    "night-market",
    "temple-visit",
    "romantic",
    "sunset",
    "rooftop",
    "quiet",
    "bustling",
    "hidden-gem",
    "upscale",
    "budget-friendly",
    "family-friendly",
    "monsoon-comfort",
    "garden",
    "artsy",
    "colonial",
    "floating-market",
    "backpacker",
    "local-favorite",
    "scenic-view",
    "late-night",
    "morning",
}

DAY_SECONDS = 24 * 60 * 60


def contains_thai(text: str) -> bool:
    return bool(re.search(r"[\u0E00-\u0E7F]", text or ""))


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    """
    Expected format:
      south,west,north,east

    Example:
      13.70,100.48,13.78,100.56
    """
    try:
        parts = [float(part.strip()) for part in value.split(",")]
    except ValueError as exc:
        raise ValueError("bbox must contain numbers only: south,west,north,east") from exc

    if len(parts) != 4:
        raise ValueError("bbox must be: south,west,north,east")

    south, west, north, east = parts

    if not (-90 <= south <= 90 and -90 <= north <= 90):
        raise ValueError("bbox latitude values must be between -90 and 90")
    if not (-180 <= west <= 180 and -180 <= east <= 180):
        raise ValueError("bbox longitude values must be between -180 and 180")
    if south >= north:
        raise ValueError("bbox south must be less than north")
    if west >= east:
        raise ValueError("bbox west must be less than east")

    return south, west, north, east


def bbox_to_overpass(bbox: tuple[float, float, float, float]) -> str:
    south, west, north, east = bbox
    return f"{south},{west},{north},{east}"


def resolve_area_to_bbox(area: str, user_agent: str) -> tuple[float, float, float, float]:
    """
    Uses Nominatim once to convert an area name into a bounding box.

    Nominatim returns boundingbox as:
      [south, north, west, east]
    """
    headers = {"User-Agent": user_agent}
    params = {
        "format": "jsonv2",
        "q": area,
        "limit": 1,
        "addressdetails": 0,
    }

    response = requests.get(NOMINATIM_URL, headers=headers, params=params, timeout=30)

    if response.status_code == 403:
        raise RuntimeError(
            "Nominatim returned 403 Forbidden. Use a real --user-agent contact string, "
            "or skip Nominatim by using --bbox instead."
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Nominatim returned HTTP {response.status_code}.\n\n"
            f"Response body:\n{response.text[:1500]}"
        )

    data = response.json()
    if not data:
        raise RuntimeError(f"Nominatim could not find area: {area}")

    raw_bbox = data[0].get("boundingbox")
    if not raw_bbox or len(raw_bbox) != 4:
        raise RuntimeError(f"Nominatim result had no bounding box for: {area}")

    south = float(raw_bbox[0])
    north = float(raw_bbox[1])
    west = float(raw_bbox[2])
    east = float(raw_bbox[3])

    return south, west, north, east


def build_overpass_query(
    bbox: tuple[float, float, float, float],
    timeout_seconds: int,
    fetch_limit: int,
) -> str:
    bbox_text = bbox_to_overpass(bbox)
    limit_text = f" {fetch_limit}" if fetch_limit > 0 else ""

    return f"""
[out:json][timeout:{timeout_seconds}];
(
  nwr["historic"]({bbox_text});
  nwr["heritage"]({bbox_text});
  nwr["tourism"="attraction"]({bbox_text});
  nwr["tourism"="museum"]({bbox_text});
  nwr["amenity"="place_of_worship"]({bbox_text});
  nwr["amenity"="marketplace"]({bbox_text});
  nwr["leisure"="park"]["historic"]({bbox_text});
  nwr["leisure"="park"]["heritage"]({bbox_text});
  nwr["building"="temple"]({bbox_text});
  way["bridge"="yes"]["name"]({bbox_text});
  relation["bridge"="yes"]["name"]({bbox_text});
);
out tags center qt{limit_text};
""".strip()


def fetch_overpass_once(
    bbox: tuple[float, float, float, float],
    timeout_seconds: int,
    fetch_limit: int,
    user_agent: str,
    overpass_url: str,
) -> list[dict[str, Any]]:
    query = build_overpass_query(bbox, timeout_seconds, fetch_limit)

    headers = {
        "User-Agent": user_agent,
        "Accept": "application/json",
    }

    response = requests.post(
        overpass_url,
        data={"data": query},
        headers=headers,
        timeout=timeout_seconds + 30,
    )

    if response.status_code >= 400:
        body = response.text[:2500]
        raise RuntimeError(
            f"Overpass returned HTTP {response.status_code} for bbox {bbox}.\n\n"
            f"Response body:\n{body}\n\n"
            "Try a smaller --bbox, lower --fetch-limit, or use a larger --grid."
        )

    try:
        data = response.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Overpass returned non-JSON response for bbox {bbox}.\n\n"
            f"Response body:\n{response.text[:2500]}"
        ) from exc

    return data.get("elements", [])


def fetch_overpass(
    bbox: tuple[float, float, float, float],
    timeout_seconds: int,
    fetch_limit: int,
    user_agent: str,
    overpass_url: str,
    retries: int,
    retry_delay_seconds: float,
) -> list[dict[str, Any]]:
    last_error: Exception | None = None

    for attempt in range(retries + 1):
        try:
            return fetch_overpass_once(
                bbox=bbox,
                timeout_seconds=timeout_seconds,
                fetch_limit=fetch_limit,
                user_agent=user_agent,
                overpass_url=overpass_url,
            )
        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc

            if attempt >= retries:
                break

            sleep_for = retry_delay_seconds * (attempt + 1)
            print(
                f"Overpass attempt {attempt + 1} failed. Retrying in {sleep_for:.1f}s...",
                file=sys.stderr,
            )
            time.sleep(sleep_for)

    assert last_error is not None
    raise last_error


def split_bbox_grid(
    bbox: tuple[float, float, float, float],
    grid: int,
) -> list[tuple[float, float, float, float]]:
    """
    Split one bbox into grid x grid smaller bboxes.

    Input/output order:
      south, west, north, east
    """
    if grid <= 1:
        return [bbox]

    south, west, north, east = bbox
    lat_step = (north - south) / grid
    lng_step = (east - west) / grid

    tiles: list[tuple[float, float, float, float]] = []

    for row in range(grid):
        for col in range(grid):
            tile_south = south + row * lat_step
            tile_north = south + (row + 1) * lat_step
            tile_west = west + col * lng_step
            tile_east = west + (col + 1) * lng_step

            tiles.append((tile_south, tile_west, tile_north, tile_east))

    return tiles


def fetch_overpass_grid(
    bbox: tuple[float, float, float, float],
    timeout_seconds: int,
    fetch_limit: int,
    user_agent: str,
    overpass_url: str,
    grid: int,
    delay_seconds: float,
    retries: int,
) -> list[dict[str, Any]]:
    tiles = split_bbox_grid(bbox, grid)
    all_elements: list[dict[str, Any]] = []
    failed_tiles = 0

    for index, tile in enumerate(tiles, start=1):
        print(
            f"Fetching Overpass tile {index}/{len(tiles)}: "
            f"{tile[0]:.6f},{tile[1]:.6f},{tile[2]:.6f},{tile[3]:.6f}",
            file=sys.stderr,
        )

        try:
            elements = fetch_overpass(
                bbox=tile,
                timeout_seconds=timeout_seconds,
                fetch_limit=fetch_limit,
                user_agent=user_agent,
                overpass_url=overpass_url,
                retries=retries,
                retry_delay_seconds=max(delay_seconds, 1.0),
            )
            print(f"  Raw elements: {len(elements)}", file=sys.stderr)
            all_elements.extend(elements)
        except Exception as exc:
            failed_tiles += 1
            print(f"  Tile {index} failed: {exc}", file=sys.stderr)

        if index < len(tiles):
            time.sleep(delay_seconds)

    if not all_elements and failed_tiles:
        raise RuntimeError("All Overpass tiles failed. Try a smaller bbox or lower --fetch-limit.")

    if failed_tiles:
        print(f"Warning: {failed_tiles} tile(s) failed but partial data was collected.", file=sys.stderr)

    return all_elements


def get_coordinates(element: dict[str, Any]) -> tuple[float, float] | None:
    if "lat" in element and "lon" in element:
        return float(element["lat"]), float(element["lon"])

    center = element.get("center")
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])

    return None


def choose_name(tags: dict[str, str], include_unnamed: bool) -> str | None:
    name = (
        tags.get("name:en")
        or tags.get("official_name:en")
        or tags.get("name")
        or tags.get("name:th")
        or tags.get("official_name")
    )

    if name:
        return normalize_space(name)

    if include_unnamed:
        return "Unnamed Historic Site"

    return None


def choose_thai_name(tags: dict[str, str], fallback_name: str) -> str:
    thai_name = tags.get("name:th") or tags.get("official_name:th")
    if thai_name:
        return normalize_space(thai_name)

    if contains_thai(fallback_name):
        return fallback_name

    return fallback_name


def infer_category(tags: dict[str, str], name: str) -> str:
    historic = tags.get("historic", "").lower()
    tourism = tags.get("tourism", "").lower()
    amenity = tags.get("amenity", "").lower()
    religion = tags.get("religion", "").lower()
    leisure = tags.get("leisure", "").lower()
    building = tags.get("building", "").lower()
    bridge = tags.get("bridge", "").lower()
    place = tags.get("place", "").lower()
    name_lower = name.lower()

    if tourism == "museum" or "museum" in name_lower or "พิพิธภัณฑ์" in name:
        return "museum"

    if historic == "palace" or "palace" in name_lower or "พระราชวัง" in name:
        return "palace"

    if amenity == "marketplace" or "market" in name_lower or "ตลาด" in name:
        return "market"

    if bridge == "yes" or historic == "bridge" or "bridge" in name_lower or "สะพาน" in name:
        return "bridge"

    if historic in {"monument", "memorial"}:
        return "monument"

    if "monument" in name_lower or "memorial" in name_lower or "อนุสาวรีย์" in name:
        return "monument"

    if historic in {"wayside_shrine", "shrine"}:
        return "shrine"

    if amenity == "place_of_worship" and religion in {
        "hindu",
        "taoist",
        "chinese_folk",
        "shinto",
    }:
        return "shrine"

    if (
        amenity == "place_of_worship"
        and religion == "buddhist"
    ):
        return "temple"

    if (
        building == "temple"
        or historic == "temple"
        or "temple" in name_lower
        or "wat " in name_lower
        or name_lower.startswith("wat")
        or "วัด" in name
    ):
        return "temple"

    if leisure == "park":
        return "park"

    if place in {"neighbourhood", "neighborhood", "quarter", "suburb"}:
        return "neighborhood"

    return "cultural-site"


def infer_vibe_tags(category: str, tags: dict[str, str], name: str) -> list[str]:
    vibes: list[str] = ["historic"]

    text = " ".join(
        [
            name.lower(),
            tags.get("name", "").lower(),
            tags.get("description", "").lower(),
            tags.get("tourism", "").lower(),
            tags.get("historic", "").lower(),
            tags.get("waterway", "").lower(),
        ]
    )

    if category in {"temple", "shrine"}:
        vibes.extend(["temple-visit", "morning"])

    if category == "museum":
        vibes.extend(["monsoon-comfort", "artsy", "family-friendly"])

    if category == "market":
        vibes.extend(["street-food", "bustling", "local-favorite"])

    if category == "park":
        vibes.extend(["garden", "quiet", "family-friendly"])

    if category == "bridge":
        vibes.extend(["riverside", "scenic-view", "sunset"])

    if category == "palace":
        vibes.extend(["scenic-view", "family-friendly"])

    if category == "monument":
        vibes.extend(["vintage", "scenic-view"])

    if "river" in text or "riverside" in text or "chao phraya" in text or "แม่น้ำ" in text:
        vibes.extend(["riverside", "scenic-view"])

    if tags.get("heritage") or tags.get("old_name"):
        vibes.append("vintage")

    seen = set()
    clean: list[str] = []

    for vibe in vibes:
        if vibe in VALID_VIBE_TAGS and vibe not in seen:
            clean.append(vibe)
            seen.add(vibe)

    return clean or ["historic"]


def make_summary(
    name: str,
    category: str,
    tags: dict[str, str],
    area_label: str,
) -> str:
    description = (
        tags.get("description:en")
        or tags.get("description")
        or tags.get("note:en")
        or tags.get("note")
    )

    if description:
        description = normalize_space(description)
        if len(description) > 220:
            description = description[:217].rstrip() + "..."
        return description

    if category == "temple":
        return f"{name} is a mapped temple or place of worship in {area_label}, useful as a cultural stop for historic walking routes."

    if category == "museum":
        return f"{name} is a museum-style cultural stop in {area_label}, useful when the itinerary needs indoor historical context or monsoon-friendly pacing."

    if category == "market":
        return f"{name} is a mapped market in {area_label}, useful for local atmosphere, food-route planning, and heritage-neighborhood exploration."

    if category == "monument":
        return f"{name} is a historic monument or memorial in {area_label}, useful as a civic landmark and orientation point."

    if category == "palace":
        return f"{name} is a palace-related historic attraction in {area_label}, useful for royal-history and old-city itinerary planning."

    if category == "bridge":
        return f"{name} is a mapped bridge landmark in {area_label}, useful for river crossings, photo stops, and historic urban walks."

    if category == "shrine":
        return f"{name} is a mapped shrine or place of worship in {area_label}, useful for local cultural context and compact neighborhood stops."

    if category == "park":
        return f"{name} is a historic or heritage-tagged park in {area_label}, useful for quieter breaks between dense attraction clusters."

    return f"{name} is a mapped historic or cultural attraction in {area_label}, pulled from OpenStreetMap for itinerary testing and discovery."


def osm_url(element: dict[str, Any]) -> str:
    osm_type = element.get("type")
    osm_id = element.get("id")
    return f"https://www.openstreetmap.org/{osm_type}/{osm_id}"


def quality_score(element: dict[str, Any], item: dict[str, Any]) -> int:
    tags = element.get("tags") or {}
    score = 0

    if tags.get("name:en"):
        score += 6
    if tags.get("name:th"):
        score += 6
    if tags.get("wikidata"):
        score += 10
    if tags.get("wikipedia"):
        score += 8
    if tags.get("heritage"):
        score += 8
    if tags.get("historic"):
        score += 8
    if tags.get("tourism") in {"attraction", "museum"}:
        score += 4

    category = item.get("category")
    if category in {"temple", "museum", "palace", "monument", "shrine"}:
        score += 5
    elif category in {"market", "bridge", "park"}:
        score += 3

    name = item.get("name", "")
    if name and name != "Unnamed Historic Site":
        score += 4

    return score


def element_to_schema(
    element: dict[str, Any],
    area_label: str,
    include_source: bool,
    include_unnamed: bool,
) -> dict[str, Any] | None:
    tags = element.get("tags") or {}

    coords = get_coordinates(element)
    if not coords:
        return None

    name = choose_name(tags, include_unnamed)
    if not name:
        return None

    lat, lng = coords
    category = infer_category(tags, name)

    if category not in VALID_CATEGORIES:
        category = "cultural-site"

    item: dict[str, Any] = {
        "name": name,
        "nameTh": choose_thai_name(tags, name),
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "category": category,
        "summary": make_summary(name, category, tags, area_label),
        "vibeTags": infer_vibe_tags(category, tags, name),
    }

    item["_qualityScore"] = quality_score(element, item)

    if include_source:
        item["_source"] = {
            "provider": "OpenStreetMap",
            "osmType": element.get("type"),
            "osmId": element.get("id"),
            "osmUrl": osm_url(element),
            "wikidata": tags.get("wikidata"),
            "wikipedia": tags.get("wikipedia"),
            "rawTags": tags,
        }

    return item


def dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    deduped: list[dict[str, Any]] = []

    for item in items:
        key = (
            item["name"].casefold(),
            round(float(item["lat"]), 5),
            round(float(item["lng"]), 5),
        )

        if key in seen:
            continue

        seen.add(key)
        deduped.append(item)

    return deduped


def filter_categories(
    items: list[dict[str, Any]],
    categories: set[str] | None,
) -> list[dict[str, Any]]:
    if not categories:
        return items

    return [item for item in items if item.get("category") in categories]


def strip_internal_fields(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    clean_items: list[dict[str, Any]] = []

    for item in items:
        clean = dict(item)
        clean.pop("_qualityScore", None)
        clean_items.append(clean)

    return clean_items


def parse_categories(value: str | None) -> set[str] | None:
    if not value:
        return None

    categories = {
        category.strip()
        for category in value.split(",")
        if category.strip()
    }

    invalid = categories - VALID_CATEGORIES
    if invalid:
        raise ValueError(f"Invalid categories: {sorted(invalid)}")

    return categories


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch historic sites and attractions from OpenStreetMap/Overpass."
    )

    location = parser.add_mutually_exclusive_group(required=True)
    location.add_argument(
        "--area",
        help='Area name, for example: "Bangkok, Thailand" or "Asok, Bangkok, Thailand".',
    )
    location.add_argument(
        "--bbox",
        help='Bounding box as "south,west,north,east", for example: "13.70,100.48,13.78,100.56".',
    )

    parser.add_argument(
        "--max-results",
        type=int,
        default=100,
        help="Maximum final JSON records. Use 0 for no final cap.",
    )
    parser.add_argument(
        "--fetch-limit",
        type=int,
        default=500,
        help="Maximum raw OSM elements requested per tile. Use 0 for no Overpass output cap.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Overpass timeout in seconds.",
    )
    parser.add_argument(
        "--grid",
        type=int,
        default=1,
        help="Split the bbox into grid x grid smaller Overpass requests. Example: --grid 6 means 36 requests.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.2,
        help="Seconds to wait between Overpass tile requests.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=1,
        help="Retry count per tile after an Overpass failure.",
    )
    parser.add_argument(
        "--categories",
        help="Optional comma list, for example: temple,museum,monument,palace,shrine",
    )
    parser.add_argument(
        "--out",
        default="historic_sites.json",
        help="Output JSON file.",
    )
    parser.add_argument(
        "--include-source",
        action="store_true",
        help="Include _source debug info. Useful for development but not schema-clean.",
    )
    parser.add_argument(
        "--include-unnamed",
        action="store_true",
        help="Include unnamed OSM features. Usually leave this off for app seed data.",
    )
    parser.add_argument(
        "--user-agent",
        default="greg-bangkok-vegan-app/0.1 pietruszka.grzegorz@gmail.com",
        help="Required for Nominatim and polite for Overpass. Use your real app name/contact.",
    )
    parser.add_argument(
        "--overpass-url",
        default=OVERPASS_URL,
        help="Overpass API endpoint.",
    )

    args = parser.parse_args()

    if args.grid < 1:
        raise ValueError("--grid must be at least 1")

    if args.delay < 0:
        raise ValueError("--delay must be 0 or higher")

    selected_categories = parse_categories(args.categories)

    if args.area:
        time.sleep(1.1)
        bbox = resolve_area_to_bbox(args.area, args.user_agent)
        area_label = args.area
    else:
        bbox = parse_bbox(args.bbox)
        area_label = args.bbox

    raw_elements = fetch_overpass_grid(
        bbox=bbox,
        timeout_seconds=args.timeout,
        fetch_limit=args.fetch_limit,
        user_agent=args.user_agent,
        overpass_url=args.overpass_url,
        grid=args.grid,
        delay_seconds=args.delay,
        retries=args.retries,
    )

    items: list[dict[str, Any]] = []

    for element in raw_elements:
        item = element_to_schema(
            element=element,
            area_label=area_label,
            include_source=args.include_source,
            include_unnamed=args.include_unnamed,
        )
        if item:
            items.append(item)

    items = dedupe_items(items)
    items = filter_categories(items, selected_categories)

    items.sort(
        key=lambda item: (
            -int(item.get("_qualityScore", 0)),
            item["category"],
            item["name"].casefold(),
        )
    )

    if args.max_results > 0:
        items = items[: args.max_results]

    output_items = strip_internal_fields(items)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(output_items, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Raw OSM elements fetched: {len(raw_elements)}")
    print(f"Final records written: {len(output_items)}")
    print(f"Output file: {args.out}")


if __name__ == "__main__":
    main()
PY