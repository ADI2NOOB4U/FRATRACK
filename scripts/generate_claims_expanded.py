#!/usr/bin/env python3
"""
FRA Claims Synthetic Data Generator

Generates synthetic Forest Rights Act claims across all real Indian districts.
Reads from district_master.csv and outputs claims_expanded.json.

Configurable:
  TOTAL_CLAIMS: Total number of claims to generate (default: 20000)
  RANDOM_SEED: Random seed for reproducibility (default: 42)
"""

import json
import csv
import random
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict


# Configuration
BASE_DIR = Path(__file__).resolve().parent
TOTAL_CLAIMS = 20000
RANDOM_SEED = 42
DISTRICT_MASTER_PATH = BASE_DIR / "district_master__1_.csv"
OUTPUT_DIR = BASE_DIR.parent / "backend" / "app" / "data" / "synthetic"
OUTPUT_FILE = OUTPUT_DIR / "claims_expanded.json"
STATE_METADATA_FILE = BASE_DIR.parent / "backend" / "app" / "data" / "states.json"
STATE_CODE_ALIASES = {
    'DH': 'Dadra and Nagar Haveli and Daman and Diu',
    'LK': 'Lakshadweep',
    'TS': 'Telangana',
    'UK': 'Uttarakhand',
}


class FRAClaimsGenerator:
    """Generate synthetic FRA claims for testing and demonstration."""
    
    STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']
    
    STATUS_DISTRIBUTION = {
        'PENDING': 0.30,
        'APPROVED': 0.45,
        'REJECTED': 0.18,
        'WITHDRAWN': 0.07
    }
    
    def __init__(self, master_path, output_dir, total_claims, random_seed):
        """Initialize generator."""
        self.master_path = Path(master_path)
        self.output_dir = Path(output_dir)
        self.output_file = self.output_dir / OUTPUT_FILE.name
        self.total_claims = total_claims
        self.random_seed = random_seed
        
        random.seed(random_seed)
        
        self.districts = []
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def load_districts(self):
        """Load districts from master CSV."""
        print(f"Loading districts from {self.master_path}...")

        used_district_ids = set()
        with open(STATE_METADATA_FILE, 'r', encoding='utf-8') as f:
            state_names = {
                state['state_id']: state['state_name']
                for state in json.load(f)
            }

        with open(self.master_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                state_code = row['state_name'].strip().upper()
                state_name = state_names.get(
                    state_code,
                    STATE_CODE_ALIASES.get(state_code, state_code),
                )
                normalized = row['normalized_district'].strip()
                geo_feature_id = int(row['geo_feature_id'])
                
                # Create district_id as STATE_CODE_normalized_district
                base_district_id = f"{state_code}_{normalized}"
                district_id = base_district_id
                if district_id in used_district_ids:
                    district_id = f"{base_district_id}_GEO{geo_feature_id}"
                    suffix = 2
                    while district_id in used_district_ids:
                        district_id = f"{base_district_id}_GEO{geo_feature_id}_{suffix}"
                        suffix += 1
                used_district_ids.add(district_id)
                
                district = {
                    'geo_feature_id': geo_feature_id,
                    'district_id': district_id,
                    'district_name': row['district_name'].strip(),
                    'state_name': state_name,
                    'state_code': state_code,
                    'normalized_district': normalized,
                    'latitude': float(row['latitude']),
                    'longitude': float(row['longitude']),
                }
                self.districts.append(district)
        
        print(f"Loaded {len(self.districts)} districts")
        return len(self.districts)
    
    def generate_claim_id(self, claim_num):
        """Generate unique claim ID."""
        year = datetime.now().year
        return f"FRA-{year}-{claim_num:06d}"
    
    def get_random_date(self, days_back=730):
        """Generate random date in past N days."""
        offset = random.randint(-days_back, 0)
        return datetime.now() + timedelta(days=offset)
    
    def add_spatial_jitter(self, lat, lon, jitter_km=5):
        """Add realistic jitter to coordinates."""
        lat_jitter = random.gauss(0, jitter_km / 111.0)
        lon_jitter = random.gauss(0, jitter_km / 85.0)
        return round(lat + lat_jitter, 6), round(lon + lon_jitter, 6)
    
    def generate_area_mismatch(self, base_area):
        """Generate claimed vs recorded area with realistic variation."""
        variant = random.random()
        
        if variant < 0.70:
            # Perfect match (±2%)
            mismatch = random.gauss(1.0, 0.02)
        elif variant < 0.95:
            # Minor mismatch (±8%)
            mismatch = random.gauss(1.0, 0.08)
        else:
            # Major mismatch (±25%)
            mismatch = random.gauss(1.0, 0.25)
        
        claimed = round(base_area * mismatch, 2)
        return base_area, claimed
    
    def generate_processing_dates(self, submission_date, status):
        """Generate submission and processing dates based on status."""
        if status == 'PENDING':
            return submission_date.strftime('%Y-%m-%d'), None
        
        if status == 'WITHDRAWN':
            # Withdrawn 5-45 days after submission
            offset = random.randint(5, 45)
            processing_date = submission_date + timedelta(days=offset)
            return submission_date.strftime('%Y-%m-%d'), processing_date.strftime('%Y-%m-%d')
        
        # APPROVED/REJECTED: 30-180 days
        processing_delay = random.randint(30, 180)
        processing_date = submission_date + timedelta(days=processing_delay)
        return submission_date.strftime('%Y-%m-%d'), processing_date.strftime('%Y-%m-%d')
    
    def generate_single_claim(self, claim_num, district):
        """Generate a single claim record."""
        # Base area: 2-500 hectares
        base_area = round(random.uniform(2, 500), 2)
        recorded_area, claimed_area = self.generate_area_mismatch(base_area)
        
        # Status
        status = random.choices(
            list(self.STATUS_DISTRIBUTION.keys()),
            weights=list(self.STATUS_DISTRIBUTION.values()),
            k=1
        )[0]
        
        # Dates
        submission_date = self.get_random_date(
            days_back=180 if status == 'PENDING' else 730
        )
        submission_str, processing_str = self.generate_processing_dates(submission_date, status)
        
        # Coordinates with jitter
        latitude, longitude = self.add_spatial_jitter(
            district['latitude'],
            district['longitude'],
            jitter_km=5
        )
        
        claim = {
            'claim_id': self.generate_claim_id(claim_num),
            'state_id': district['state_code'],
            'state_name': district['state_name'],
            'district_id': district['district_id'],
            'district_name': district['district_name'],
            'status': status,
            'submission_date': submission_str,
            'processing_date': processing_str,
            'claimed_area': claimed_area,
            'recorded_area': recorded_area,
            'latitude': latitude,
            'longitude': longitude
        }
        
        return claim
    
    def generate_claims(self):
        """Generate all synthetic claims."""
        print(f"Generating {self.total_claims} synthetic claims...")

        claims = []
        if not self.districts:
            return claims

        base_claims, remainder = divmod(self.total_claims, len(self.districts))
        
        claim_num = 1
        for district_index, district in enumerate(self.districts):
            num_claims = base_claims + (1 if district_index < remainder else 0)
            
            for _ in range(num_claims):
                claim = self.generate_single_claim(claim_num, district)
                claims.append(claim)
                claim_num += 1
        
        return claims
    
    def save_json(self, claims):
        """Save claims to JSON file."""
        print(f"Saving {len(claims)} claims to {self.output_file}...")
        
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(claims, f, indent=2, ensure_ascii=False)
        
        file_size_mb = self.output_file.stat().st_size / (1024 * 1024)
        print(f"Saved {len(claims)} claims ({file_size_mb:.2f} MB)")
    
    def generate(self):
        """Run generation pipeline."""
        print("=" * 70)
        print("FRA CLAIMS SYNTHETIC DATA GENERATOR")
        print("=" * 70)
        
        num_districts = self.load_districts()
        claims = self.generate_claims()
        self.save_json(claims)
        
        # Summary
        print()
        print("=" * 70)
        print("GENERATION COMPLETE")
        print("=" * 70)
        print(f"Total Claims: {len(claims):,}")
        print(f"Districts Used: {num_districts}")
        print(f"Output: {self.output_file}")
        print()
        
        # Status distribution
        from collections import Counter
        status_counts = Counter(c['status'] for c in claims)
        print("Status Distribution:")
        for status in self.STATUSES:
            count = status_counts.get(status, 0)
            pct = (count / len(claims) * 100) if len(claims) > 0 else 0
            print(f"  {status:12}: {count:6,} ({pct:5.1f}%)")
        
        print("=" * 70)


def main():
    """Main entry point."""
    import sys
    import os
    
    # Look for district_master.csv in current directory
    if not os.path.exists(DISTRICT_MASTER_PATH):
        print(f"Error: {DISTRICT_MASTER_PATH} not found in current directory")
        sys.exit(1)
    
    generator = FRAClaimsGenerator(
        DISTRICT_MASTER_PATH,
        OUTPUT_DIR,
        TOTAL_CLAIMS,
        RANDOM_SEED
    )
    
    generator.generate()


if __name__ == "__main__":
    main()
