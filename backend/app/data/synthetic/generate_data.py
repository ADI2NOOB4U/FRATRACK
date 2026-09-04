import json
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

OUTPUT_DIR = Path(__file__).parent

# -----------------------------
# STATES
# -----------------------------

states = [
    {
        "state_id": "S001",
        "state_name": "Madhya Pradesh"
    },
    {
        "state_id": "S002",
        "state_name": "Odisha"
    },
    {
        "state_id": "S003",
        "state_name": "Chhattisgarh"
    },
    {
        "state_id": "S004",
        "state_name": "Jharkhand"
    }
]

# -----------------------------
# DISTRICTS
# -----------------------------

districts = [
    {
        "district_id": "D001",
        "district_name": "Mandla",
        "state_id": "S001",
        "latitude": 22.5979,
        "longitude": 80.3714
    },
    {
        "district_id": "D002",
        "district_name": "Dindori",
        "state_id": "S001",
        "latitude": 22.9432,
        "longitude": 81.0775
    },
    {
        "district_id": "D003",
        "district_name": "Balaghat",
        "state_id": "S001",
        "latitude": 21.8106,
        "longitude": 80.1838
    },
    {
        "district_id": "D004",
        "district_name": "Shahdol",
        "state_id": "S001",
        "latitude": 23.2951,
        "longitude": 81.3619
    },
    {
        "district_id": "D005",
        "district_name": "Mayurbhanj",
        "state_id": "S002",
        "latitude": 21.9287,
        "longitude": 86.7191
    },
    {
        "district_id": "D006",
        "district_name": "Koraput",
        "state_id": "S002",
        "latitude": 18.8135,
        "longitude": 82.7110
    },
    {
        "district_id": "D007",
        "district_name": "Kandhamal",
        "state_id": "S002",
        "latitude": 20.1341,
        "longitude": 84.0139
    },
    {
        "district_id": "D008",
        "district_name": "Bastar",
        "state_id": "S003",
        "latitude": 19.1071,
        "longitude": 81.9535
    },
    {
        "district_id": "D009",
        "district_name": "Dantewada",
        "state_id": "S003",
        "latitude": 18.9000,
        "longitude": 81.3500
    },
    {
        "district_id": "D010",
        "district_name": "Kanker",
        "state_id": "S003",
        "latitude": 20.2719,
        "longitude": 81.4917
    },
    {
        "district_id": "D011",
        "district_name": "West Singhbhum",
        "state_id": "S004",
        "latitude": 22.5700,
        "longitude": 85.8000
    },
    {
        "district_id": "D012",
        "district_name": "Simdega",
        "state_id": "S004",
        "latitude": 22.6150,
        "longitude": 84.5000
    }
]

# -----------------------------
# CLAIM STATUSES
# -----------------------------

statuses = [
    "Submitted",
    "Under Verification",
    "Approved",
    "Rejected",
    "Pending Documentation"
]

# -----------------------------
# HELPER FUNCTIONS
# -----------------------------

def random_date(start, end):
    days = (end - start).days
    return start + timedelta(days=random.randint(0, days))


def generate_coordinates(district):
    lat = district["latitude"] + random.uniform(-0.08, 0.08)
    lon = district["longitude"] + random.uniform(-0.08, 0.08)

    return round(lat, 6), round(lon, 6)


# -----------------------------
# GENERATE CLAIMS
# -----------------------------

claims = []

start_date = date(2025, 9, 1)
end_date = date(2026, 8, 31)

for i in range(1, 501):

    district = random.choice(districts)

    state = next(
        s for s in states
        if s["state_id"] == district["state_id"]
    )

    submission_date = random_date(
        start_date,
        end_date
    )

    status = random.choice(statuses)

    processing_date = None

    if status in ["Approved", "Rejected", "Under Verification"]:

        processing_days = random.randint(5, 60)

        processing_date = (
            submission_date +
            timedelta(days=processing_days)
        )

        if processing_date > end_date:
            processing_date = end_date

    claimed_area = round(
        random.uniform(0.5, 6.0),
        2
    )

    reference_area = round(
        max(
            0.1,
            claimed_area +
            random.uniform(-0.25, 0.25)
        ),
        2
    )

    latitude, longitude = generate_coordinates(
        district
    )

    claim = {
        "claim_id": f"CLM-{i:04d}",

        "data_label": "Synthetic Demo Data",

        "state_id": state["state_id"],
        "state_name": state["state_name"],

        "district_id": district["district_id"],
        "district_name": district["district_name"],

        "claim_status": status,

        "submission_date": submission_date.isoformat(),

        "processing_date": (
            processing_date.isoformat()
            if processing_date
            else None
        ),

        "claimed_area": claimed_area,

        "recorded_reference_area": reference_area,

        "latitude": latitude,
        "longitude": longitude
    }

    claims.append(claim)


# -----------------------------
# GENERATE HISTORICAL DATA
# -----------------------------

historical_metrics = []

months = [
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08"
]

for district in districts:

    base_claims = random.randint(25, 60)

    for month in months:

        total_claims = max(
            5,
            base_claims +
            random.randint(-8, 12)
        )

        approved = int(
            total_claims *
            random.uniform(0.35, 0.60)
        )

        rejected = int(
            total_claims *
            random.uniform(0.05, 0.15)
        )

        pending = int(
            total_claims *
            random.uniform(0.10, 0.25)
        )

        under_verification = max(
            0,
            total_claims -
            approved -
            rejected -
            pending
        )

        historical_metrics.append({
            "district_id": district["district_id"],
            "district_name": district["district_name"],
            "state_id": district["state_id"],
            "month": month,

            "total_claims": total_claims,

            "approved_claims": approved,

            "rejected_claims": rejected,

            "under_verification": under_verification,

            "pending_documentation": pending,

            "average_processing_days": round(
                random.uniform(15, 40),
                1
            ),

            "average_claimed_area": round(
                random.uniform(1.5, 4.5),
                2
            ),

            "average_reference_area": round(
                random.uniform(1.5, 4.5),
                2
            )
        })


# -----------------------------
# SAVE FILES
# -----------------------------

with open(
    OUTPUT_DIR / "states.json",
    "w",
    encoding="utf-8"
) as file:
    json.dump(
        states,
        file,
        indent=2
    )

with open(
    OUTPUT_DIR / "districts.json",
    "w",
    encoding="utf-8"
) as file:
    json.dump(
        districts,
        file,
        indent=2
    )

with open(
    OUTPUT_DIR / "claims.json",
    "w",
    encoding="utf-8"
) as file:
    json.dump(
        claims,
        file,
        indent=2
    )

with open(
    OUTPUT_DIR / "historical_metrics.json",
    "w",
    encoding="utf-8"
) as file:
    json.dump(
        historical_metrics,
        file,
        indent=2
    )

print("===================================")
print("Synthetic FRA data generated!")
print("===================================")
print(f"Claims: {len(claims)}")
print(f"Districts: {len(districts)}")
print(f"Historical records: {len(historical_metrics)}")
print("===================================")