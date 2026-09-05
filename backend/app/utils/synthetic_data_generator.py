#!/usr/bin/env python3
"""
synthetic_data_generator.py

Generates deterministic, synthetic FRA (Forest Rights Act) claims data
for demo/testing purposes only. Reads district/state reference data from
app/data/districts.json and writes generated claims to
app/data/synthetic/claims.json.

No real personal data (PII) is generated or used.
"""
import hashlib
import json
import os
import random
import uuid
from datetime import datetime, timedelta

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

RANDOM_SEED = 42

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DISTRICTS_PATH = os.path.join(BASE_DIR, "data", "districts.json")
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "synthetic")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "claims_legacy.json")

TOTAL_CLAIMS = 10000

STATUSES = ["pending", "approved", "rejected", "withdrawn"]
# Base status distribution (will be perturbed slightly per-district for realism)
STATUS_WEIGHTS = {
    "pending": 0.30,
    "approved": 0.45,
    "rejected": 0.18,
    "withdrawn": 0.07,
}

MIN_CLAIM_DATE = datetime(2010, 1, 1)
MAX_SUBMISSION_DATE = datetime(2024, 12, 31)
# Pending claims should represent relatively recent unresolved cases.
MIN_PENDING_DATE = datetime(2023, 1, 1)
MAX_PENDING_DATE = datetime(2025, 6, 30)

# Fraction of completed (non-pending) claims considered "delayed" (long processing time)
DELAYED_CLAIM_FRACTION = 0.15
NORMAL_PROCESSING_DAYS_RANGE = (15, 180)
DELAYED_PROCESSING_DAYS_RANGE = (181, 900)

# Area mismatch (claimed vs recorded) settings
AREA_MISMATCH_FRACTION_MIN = 0.05
AREA_MISMATCH_FRACTION_MAX = 0.10
AREA_MISMATCH_MIN_PCT = 0.30  # >30% difference
AREA_MISMATCH_MAX_PCT = 0.90

CLAIMED_AREA_MIN_HA = 0.1
CLAIMED_AREA_MAX_HA = 15.0

# Fallback bounding box for India, used only if a district has no usable
# coordinate reference data at all.
INDIA_BBOX = {
    "lat_min": 8.0,
    "lat_max": 35.0,
    "lon_min": 68.0,
    "lon_max": 97.0,
}


# ----------------------------------------------------------------------
# District loading / normalization
# ----------------------------------------------------------------------

def load_districts(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Districts reference file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if isinstance(raw, dict):
        if "districts" in raw:
            raw = raw["districts"]
        else:
            raw = list(raw.values())

    if not isinstance(raw, list) or not raw:
        raise ValueError("districts.json did not contain a non-empty list of districts")

    normalized = []
    for entry in raw:
        normalized.append(_normalize_district(entry))

    normalized = [d for d in normalized if d is not None]
    if not normalized:
        raise ValueError("No valid districts could be parsed from districts.json")

    return normalized


def _first_present(entry, keys):
    for k in keys:
        if k in entry and entry[k] is not None:
            return entry[k]
    return None


def _normalize_district(entry):
    if not isinstance(entry, dict):
        return None

    district_id = _first_present(
        entry, ["district_id", "districtId", "id", "code"]
    )
    state_id = _first_present(
        entry, ["state_id", "stateId", "state_code"]
    )

    if district_id is None:
        return None

    district_id = str(district_id)
    state_id = str(state_id) if state_id is not None else "UNKNOWN"

    lat_min = lat_max = lon_min = lon_max = None

    bbox = _first_present(
        entry, ["bbox", "bounding_box", "boundingBox"]
    )

    if isinstance(bbox, dict):
        lat_min = _first_present(
            bbox, ["lat_min", "min_lat", "south"]
        )
        lat_max = _first_present(
            bbox, ["lat_max", "max_lat", "north"]
        )
        lon_min = _first_present(
            bbox, ["lon_min", "min_lon", "west", "lng_min"]
        )
        lon_max = _first_present(
            bbox, ["lon_max", "max_lon", "east", "lng_max"]
        )

    elif isinstance(bbox, (list, tuple)) and len(bbox) == 4:
        lon_min, lat_min, lon_max, lat_max = bbox

    if lat_min is None:
        lat_min = _first_present(
            entry, ["lat_min", "min_lat", "south"]
        )

    if lat_max is None:
        lat_max = _first_present(
            entry, ["lat_max", "max_lat", "north"]
        )

    if lon_min is None:
        lon_min = _first_present(
            entry, ["lon_min", "min_lon", "west"]
        )

    if lon_max is None:
        lon_max = _first_present(
            entry, ["lon_max", "max_lon", "east"]
        )

    centroid_lat = _first_present(
        entry,
        ["centroid_lat", "latitude", "lat",
         "center_lat", "centroid_latitude"]
    )

    centroid_lon = _first_present(
        entry,
        ["centroid_lon", "longitude", "lon",
         "lng", "center_lon", "centroid_longitude"]
    )

    centroid = entry.get("centroid")

    if isinstance(centroid, dict) and centroid_lat is None:
        centroid_lat = _first_present(
            centroid, ["lat", "latitude"]
        )
        centroid_lon = _first_present(
            centroid, ["lon", "lng", "longitude"]
        )

    elif (
        isinstance(centroid, (list, tuple))
        and len(centroid) == 2
        and centroid_lat is None
    ):
        centroid_lon, centroid_lat = centroid

    has_bbox = None not in (
        lat_min, lat_max, lon_min, lon_max
    )

    has_centroid = None not in (
        centroid_lat, centroid_lon
    )

    # Fallback when district has no geographic reference.
    if not has_bbox and not has_centroid:
        seed_val = int(
            hashlib.md5(
                district_id.encode("utf-8")
            ).hexdigest()[:8],
            16
        )

        centroid_lat = (
            INDIA_BBOX["lat_min"]
            + (seed_val % 10000) / 10000
            * (
                INDIA_BBOX["lat_max"]
                - INDIA_BBOX["lat_min"]
            )
        )

        centroid_lon = (
            INDIA_BBOX["lon_min"]
            + ((seed_val // 10000) % 10000) / 10000
            * (
                INDIA_BBOX["lon_max"]
                - INDIA_BBOX["lon_min"]
            )
        )

        has_centroid = True

    # Create a small bounding box around centroid.
    if not has_bbox and has_centroid:
        pad = 0.15

        lat_min = centroid_lat - pad
        lat_max = centroid_lat + pad
        lon_min = centroid_lon - pad
        lon_max = centroid_lon + pad

    return {
        "district_id": district_id,
        "state_id": state_id,
        "lat_min": float(lat_min),
        "lat_max": float(lat_max),
        "lon_min": float(lon_min),
        "lon_max": float(lon_max),
    }
# ----------------------------------------------------------------------
# Generation helpers
# ----------------------------------------------------------------------

def weighted_status_choice(rng, weights):
    statuses = list(weights.keys())
    probs = list(weights.values())
    return rng.choices(statuses, weights=probs, k=1)[0]


def random_date(rng, start, end):
    delta_days = (end - start).days
    if delta_days <= 0:
        return start
    offset = rng.randint(0, delta_days)
    return start + timedelta(days=offset)


def random_coord_in_district(rng, district):
    lat = rng.uniform(district["lat_min"], district["lat_max"])
    lon = rng.uniform(district["lon_min"], district["lon_max"])
    return round(lat, 6), round(lon, 6)


def generate_area_pair(rng, mismatch=False):
    claimed = round(rng.uniform(CLAIMED_AREA_MIN_HA, CLAIMED_AREA_MAX_HA), 2)
    if mismatch:
        pct = rng.uniform(AREA_MISMATCH_MIN_PCT, AREA_MISMATCH_MAX_PCT)
        direction = rng.choice([-1, 1])
        recorded = claimed * (1 + direction * pct)
    else:
        # Small, realistic natural variation
        pct = rng.uniform(-0.08, 0.08)
        recorded = claimed * (1 + pct)
    recorded = max(0.01, round(recorded, 2))
    return claimed, recorded


def build_district_status_weights(rng, base_weights):
    """Slightly perturb the base status distribution per district so
    rejection/pending/delay rates vary realistically across districts."""
    perturbed = {}
    for status, weight in base_weights.items():
        jitter = rng.uniform(-0.05, 0.05)
        perturbed[status] = max(0.01, weight + jitter)
    total = sum(perturbed.values())
    return {k: v / total for k, v in perturbed.items()}


# ----------------------------------------------------------------------
# Main generation
# ----------------------------------------------------------------------

def generate_claims(districts, total_claims, seed):
    rng = random.Random(seed)

    district_weights_cache = {
        d["district_id"]: build_district_status_weights(rng, STATUS_WEIGHTS)
        for d in districts
    }

    claims = []
    used_ids = set()

    for i in range(total_claims):
        district = districts[rng.randrange(len(districts))]

        claim_id = f"FRA-{i+1:07d}"
        while claim_id in used_ids:
            claim_id = f"FRA-{uuid.UUID(int=rng.getrandbits(128)).hex[:12]}"
        used_ids.add(claim_id)

        status_weights = district_weights_cache[district["district_id"]]
        status = weighted_status_choice(rng, status_weights)

        if status == "pending":
            # Keep pending claims recent enough to produce realistic backlog ages.
            submission_date = random_date(
                rng,
                MIN_PENDING_DATE,
                MAX_PENDING_DATE
            )
            processing_date = None
        else:
            submission_date = random_date(
                rng,
                MIN_CLAIM_DATE,
                MAX_SUBMISSION_DATE
            )

            is_delayed = rng.random() < DELAYED_CLAIM_FRACTION

            if is_delayed:
                days = rng.randint(*DELAYED_PROCESSING_DAYS_RANGE)
            else:
                days = rng.randint(*NORMAL_PROCESSING_DAYS_RANGE)

            processing_date = submission_date + timedelta(days=days)

            if processing_date > datetime(2025, 6, 30):
                processing_date = datetime(2025, 6, 30)

            if processing_date <= submission_date:
                processing_date = submission_date + timedelta(days=1)
            else:
             is_delayed = rng.random() < DELAYED_CLAIM_FRACTION
            if is_delayed:
                days = rng.randint(*DELAYED_PROCESSING_DAYS_RANGE)
            else:
                days = rng.randint(*NORMAL_PROCESSING_DAYS_RANGE)
            processing_date = submission_date + timedelta(days=days)
            if processing_date > datetime(2025, 6, 30):
                processing_date = datetime(2025, 6, 30)
            if processing_date <= submission_date:
                processing_date = submission_date + timedelta(days=1)

        is_mismatch = rng.random() < rng.uniform(
            AREA_MISMATCH_FRACTION_MIN, AREA_MISMATCH_FRACTION_MAX
        )
        claimed_area, recorded_area = generate_area_pair(rng, mismatch=is_mismatch)

        latitude, longitude = random_coord_in_district(rng, district)

        claims.append(
            {
                "claim_id": claim_id,
                "state_id": district["state_id"],
                "district_id": district["district_id"],
                "status": status,
                "submission_date": submission_date.strftime("%Y-%m-%d"),
                "processing_date": processing_date.strftime("%Y-%m-%d")
                if processing_date
                else None,
                "claimed_area": claimed_area,
                "recorded_area": recorded_area,
                "latitude": latitude,
                "longitude": longitude,
            }
        )

    return claims


# ----------------------------------------------------------------------
# Validation
# ----------------------------------------------------------------------

def validate_claims(claims, districts):
    district_map = {d["district_id"]: d for d in districts}
    valid_state_ids = {d["state_id"] for d in districts}
    seen_ids = set()

    if len(claims) == 0:
        raise ValueError("No claims were generated")

    for c in claims:
        required_fields = [
            "claim_id",
            "state_id",
            "district_id",
            "status",
            "submission_date",
            "processing_date",
            "claimed_area",
            "recorded_area",
            "latitude",
            "longitude",
        ]
        for field in required_fields:
            if field not in c:
                raise ValueError(f"Missing field '{field}' in claim {c.get('claim_id')}")

        if c["claim_id"] in seen_ids:
            raise ValueError(f"Duplicate claim_id: {c['claim_id']}")
        seen_ids.add(c["claim_id"])

        if c["district_id"] not in district_map:
            raise ValueError(f"Invalid district_id: {c['district_id']}")

        district = district_map[c["district_id"]]
        if c["state_id"] != district["state_id"]:
            raise ValueError(
                f"State/district mismatch for claim {c['claim_id']}: "
                f"{c['state_id']} != {district['state_id']}"
            )

        if c["state_id"] not in valid_state_ids:
            raise ValueError(f"Invalid state_id: {c['state_id']}")

        if c["status"] not in STATUSES:
            raise ValueError(f"Invalid status: {c['status']}")

        submission_dt = datetime.strptime(c["submission_date"], "%Y-%m-%d")

        if c["status"] == "pending":
            if c["processing_date"] is not None:
                raise ValueError(
                    f"Pending claim {c['claim_id']} must have null processing_date"
                )
        else:
            if c["processing_date"] is None:
                raise ValueError(
                    f"Completed claim {c['claim_id']} must have a processing_date"
                )
            processing_dt = datetime.strptime(c["processing_date"], "%Y-%m-%d")
            if processing_dt <= submission_dt:
                raise ValueError(
                    f"processing_date must be after submission_date for {c['claim_id']}"
                )

        if c["claimed_area"] <= 0 or c["recorded_area"] <= 0:
            raise ValueError(f"Non-positive area for claim {c['claim_id']}")

        if not (district["lat_min"] - 1e-6 <= c["latitude"] <= district["lat_max"] + 1e-6):
            raise ValueError(
                f"Latitude out of district bounds for claim {c['claim_id']}"
            )
        if not (district["lon_min"] - 1e-6 <= c["longitude"] <= district["lon_max"] + 1e-6):
            raise ValueError(
                f"Longitude out of district bounds for claim {c['claim_id']}"
            )

    return True


# ----------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------

def main():
    districts = load_districts(DISTRICTS_PATH)

    claims = generate_claims(districts, TOTAL_CLAIMS, RANDOM_SEED)

    validate_claims(claims, districts)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(claims, f, indent=2)

    print(f"Generated {len(claims)} synthetic claims -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()