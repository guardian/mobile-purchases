"""
cd adjust_report_etl

python -m venv myenv
source myenv/bin/activate
pip install fivetran-connector-sdk

fivetran debug --configuration ./configuration/adjust_feast.json
fivetran debug --configuration ./configuration/adjust_premium.json

fivetran deploy --api-key xxx --destination GNM --connection adjust_feast --configuration ./configuration/adjust_feast.json
fivetran deploy --api-key xxx --destination GNM --connection adjust_premium --configuration ./configuration/adjust_premium.json
"""

import csv
import json
import hashlib
from datetime import datetime, timedelta
from io import StringIO
from typing import Dict, List, Set

import requests
from fivetran_connector_sdk import Connector
from fivetran_connector_sdk import Logging as log
from fivetran_connector_sdk import Operations as op

log.LOG_LEVEL = log.Level.INFO

CSV_REPORT_TABLE_NAME = "csv_report"
CSV_REPORT_METRICS = [
    "clicks",
    "impressions",
    "installs",
    "cost",
    "ad_revenue",
    "revenue",
    "att_status_authorized",
    "att_status_denied",
]

SKAD_REPORT_TABLE_NAME = "skad_report"
SKAD_REPORT_METRICS = [
    "skad_installs",
    "skad_total_installs",
    "valid_conversions",
    "conversion_1",
    "conversion_2",
    "conversion_3",
    "conversion_4",
    "conversion_5",
    "conversion_6",
]

# Dimensions for composite key generation
COMPOSITE_KEY_DIMENSIONS = [
    "day",
    "app_token",
    "country",
    "network",
    "campaign",
    "adgroup",
    "creative",
    "channel",
    "store_type",
    "partner_name",
    "source_network",
]

ALL_DIMENSIONS = [
    "adgroup",
    "adgroup_network",
    "app",
    "app_token",
    "campaign",
    "campaign_network",
    "channel",
    "country",
    "creative",
    "creative_network",
    "currency",
    "day",
    "network",
    "partner_name",
    "source_network",
    "store_type",
]

# Apple Search Ads networks that require special handling
APPLE_SEARCH_ADS_NETWORKS = [
    "Apple Search Ads",
    "Apple Search Ads Advanced",
    "Apple Search Ads Basic",
]


def generate_composite_key(row: Dict[str, str]) -> str:
    """
    Generate MD5 hash from composite key dimensions.
    This ensures unique identification of records for proper UPSERT operations.
    """
    composite_string = "|".join([
        row.get(dim, "") for dim in COMPOSITE_KEY_DIMENSIONS
    ])
    return hashlib.md5(composite_string.encode('utf-8')).hexdigest()


def is_apple_search_ads(network: str) -> bool:
    """Check if the network is Apple Search Ads"""
    return network in APPLE_SEARCH_ADS_NETWORKS


def get_attribution_status(row: Dict[str, str]) -> str:
    """
    Determine attribution status based on network and data freshness.
    Apple Search Ads data within 3 days is considered 'pending', otherwise 'final'.
    """
    network = row.get("network", "")
    day = row.get("day", "")

    if not is_apple_search_ads(network):
        return "final"

    try:
        record_date = datetime.strptime(day, "%Y-%m-%d")
        days_old = (datetime.now() - record_date).days

        # Apple Search Ads data is considered pending if less than 3 days old
        return "pending" if days_old < 3 else "final"
    except ValueError:
        log.warning(f"Invalid date format: {day}")
        return "unknown"


def deduplicate_batch(batch_data: List[Dict]) -> List[Dict]:
    """
    Deduplicate records within a batch based on composite key.
    Keep the most recent record for each key.
    """
    seen_keys: Set[str] = set()
    deduplicated_batch = []

    for row in batch_data:
        composite_key = generate_composite_key(row)

        if composite_key not in seen_keys:
            seen_keys.add(composite_key)
            deduplicated_batch.append(row)
        else:
            log.info(f"Duplicate record found and skipped for key: {composite_key}")

    return deduplicated_batch


def get_enhanced_date_period(app_token: str) -> str:
    """
    Generate enhanced date period with extended backfill for Apple Search Ads.
    Uses 14-day window for Apple Search Ads, 7-day for others.
    """
    # For Apple Search Ads, use extended 14-day backfill window
    # For other networks, use standard 7-day window
    backfill_days = 14  # Extended for Apple Search Ads attribution delays

    end_date = datetime.now()
    start_date = end_date - timedelta(days=backfill_days)

    return f"{start_date.strftime('%Y-%m-%d')}:{end_date.strftime('%Y-%m-%d')}"


def schema(configuration: dict):
    return [
        {
            "table": CSV_REPORT_TABLE_NAME,
            "primary_key": ["composite_key"],  # Use composite key as primary key
            "columns": {
                # Composite key for UPSERT operations
                "composite_key": "STRING",
                # Attribution tracking
                "attribution_status": "STRING",
                "last_updated": "TIMESTAMP",
                # Original dimensions
                "adgroup": "STRING",
                "adgroup_network": "STRING",
                "app": "STRING",
                "app_token": "STRING",
                "campaign": "STRING",
                "campaign_network": "STRING",
                "channel": "STRING",
                "country": "STRING",
                "creative": "STRING",
                "creative_network": "STRING",
                "currency": "STRING",
                "day": "STRING",
                "network": "STRING",
                "partner_name": "STRING",
                "source_network": "STRING",
                "store_type": "STRING",
                # Metrics
                "clicks": "INT",
                "impressions": "INT",
                "installs": "INT",
                "cost": "FLOAT",
                "ad_revenue": "FLOAT",
                "revenue": "FLOAT",
                "att_status_authorized": "INT",
                "att_status_denied": "INT",
            },
        },
        {
            "table": SKAD_REPORT_TABLE_NAME,
            "primary_key": ["composite_key"],  # Use composite key as primary key
            "columns": {
                # Composite key for UPSERT operations
                "composite_key": "STRING",
                # Attribution tracking
                "attribution_status": "STRING",
                "last_updated": "TIMESTAMP",
                # Original dimensions
                "adgroup": "STRING",
                "adgroup_network": "STRING",
                "app": "STRING",
                "app_token": "STRING",
                "campaign": "STRING",
                "campaign_network": "STRING",
                "channel": "STRING",
                "country": "STRING",
                "creative": "STRING",
                "creative_network": "STRING",
                "currency": "STRING",
                "day": "STRING",
                "network": "STRING",
                "partner_name": "STRING",
                "source_network": "STRING",
                "store_type": "STRING",
                # SKAD metrics
                "skad_installs": "INT",
                "skad_total_installs": "INT",
                "valid_conversions": "INT",
                "conversion_1": "INT",
                "conversion_2": "INT",
                "conversion_3": "INT",
                "conversion_4": "INT",
                "conversion_5": "INT",
                "conversion_6": "INT",
            },
        },
    ]


def update(configuration: dict, state: dict):
    ADJUST_API_URL = "https://automate.adjust.com/reports-service/csv_report"
    AD_SPEND_MODE = "network"
    API_KEY = configuration["API_KEY"]
    APP_TOKEN = configuration["APP_TOKEN"]

    if not API_KEY:
        log.severe("Api key not provided")
        return
    if not APP_TOKEN:
        log.severe("App token not provided")
        return

    DATE_PERIOD = get_enhanced_date_period(APP_TOKEN)
    log.info(f"Using enhanced date period: {DATE_PERIOD}")

    # CSV REPORT with enhanced UPSERT logic
    try:
        headers = {
            "Authorization": f"Bearer {API_KEY}",
        }

        params = {
            "ad_spend_mode": AD_SPEND_MODE,
            "app_token__in": APP_TOKEN,
            "date_period": DATE_PERIOD,
            "dimensions": ",".join(ALL_DIMENSIONS),
            "metrics": ",".join(CSV_REPORT_METRICS),
        }

        log.info("Fetching data from Adjust for CSV report with enhanced backfill...")
        response = requests.get(ADJUST_API_URL, headers=headers, params=params)

        log.info(f"Received response with status code: {response.status_code}")
        response.raise_for_status()

    except requests.exceptions.HTTPError as err:
        log.severe(f"HTTP error occurred: {err}")
        log.severe(f"Response content: {response.text}")
        return
    except Exception as err:
        log.severe(f"Other error occurred: {err}")
        return

    try:
        log.info("Processing Adjust data with composite key strategy...")
        csv_reader = csv.DictReader(StringIO(response.text))
        report_data = [row for row in csv_reader]

        # Deduplicate within batch to prevent duplicate records
        report_data = deduplicate_batch(report_data)

        log.info(f"Processing {len(report_data)} deduplicated records...")

        # Enhanced UPSERT with composite key and attribution tracking
        upsert_count = 0
        apple_search_ads_count = 0

        for row in report_data:
            composite_key = generate_composite_key(row)
            attribution_status = get_attribution_status(row)
            current_timestamp = datetime.now().isoformat()

            # Track Apple Search Ads records for monitoring
            if is_apple_search_ads(row.get("network", "")):
                apple_search_ads_count += 1

            # Enhanced data payload with composite key and attribution tracking
            enhanced_data = {
                # Composite key for UPSERT operations
                "composite_key": composite_key,
                # Attribution tracking
                "attribution_status": attribution_status,
                "last_updated": current_timestamp,
                # Original dimensions
                "adgroup": row.get("adgroup", ""),
                "adgroup_network": row.get("adgroup_network", ""),
                "app": row.get("app", ""),
                "app_token": row.get("app_token", ""),
                "campaign": row.get("campaign", ""),
                "campaign_network": row.get("campaign_network", ""),
                "channel": row.get("channel", ""),
                "country": row.get("country", ""),
                "creative": row.get("creative", ""),
                "creative_network": row.get("creative_network", ""),
                "currency": row.get("currency", ""),
                "day": row.get("day", ""),
                "network": row.get("network", ""),
                "partner_name": row.get("partner_name", ""),
                "source_network": row.get("source_network", ""),
                "store_type": row.get("store_type", ""),
                # Metrics with safe conversion
                "clicks": int(float(row.get("clicks", "0") or "0")),
                "impressions": int(float(row.get("impressions", "0") or "0")),
                "installs": int(float(row.get("installs", "0") or "0")),
                "cost": float(row.get("cost", "0") or "0"),
                "ad_revenue": float(row.get("ad_revenue", "0") or "0"),
                "revenue": float(row.get("revenue", "0") or "0"),
                "att_status_authorized": int(float(row.get("att_status_authorized", "0") or "0")),
                "att_status_denied": int(float(row.get("att_status_denied", "0") or "0")),
            }

            yield op.upsert(
                table=CSV_REPORT_TABLE_NAME,
                data=enhanced_data,
            )
            upsert_count += 1

        log.info(f"Completed upserting {upsert_count} records to BigQuery CSV report")
        log.info(f"Apple Search Ads records processed: {apple_search_ads_count}")

    except json.JSONDecodeError as json_err:
        log.severe(f"JSON decoding error: {json_err}")
        log.severe(f"Raw response content: {response.text}")
    except Exception as err:
        log.severe(f"Error processing CSV report: {err}")

    # SKAD REPORT with enhanced UPSERT logic
    try:
        headers = {
            "Authorization": f"Bearer {API_KEY}",
        }

        params = {
            "ad_spend_mode": AD_SPEND_MODE,
            "app_token__in": APP_TOKEN,
            "date_period": DATE_PERIOD,
            "dimensions": ",".join(ALL_DIMENSIONS),
            "metrics": ",".join(SKAD_REPORT_METRICS),
        }

        log.info("Fetching data from Adjust for SKAD report with enhanced backfill...")
        response = requests.get(ADJUST_API_URL, headers=headers, params=params)

        log.info(f"Received response with status code: {response.status_code}")
        response.raise_for_status()

    except requests.exceptions.HTTPError as err:
        log.severe(f"HTTP error occurred: {err}")
        log.severe(f"Response content: {response.text}")
        return
    except Exception as err:
        log.severe(f"Other error occurred: {err}")
        return

    try:
        log.info("Processing Adjust SKAD data with composite key strategy...")
        csv_reader = csv.DictReader(StringIO(response.text))
        report_data = [row for row in csv_reader]

        # Deduplicate within batch to prevent duplicate records
        report_data = deduplicate_batch(report_data)

        log.info(f"Processing {len(report_data)} deduplicated SKAD records...")

        # Enhanced UPSERT with composite key and attribution tracking
        upsert_count = 0
        apple_search_ads_count = 0

        for row in report_data:
            composite_key = generate_composite_key(row)
            attribution_status = get_attribution_status(row)
            current_timestamp = datetime.now().isoformat()

            # Track Apple Search Ads records for monitoring
            if is_apple_search_ads(row.get("network", "")):
                apple_search_ads_count += 1

            # Enhanced data payload with composite key and attribution tracking
            enhanced_data = {
                # Composite key for UPSERT operations
                "composite_key": composite_key,
                # Attribution tracking
                "attribution_status": attribution_status,
                "last_updated": current_timestamp,
                # Original dimensions
                "adgroup": row.get("adgroup", ""),
                "adgroup_network": row.get("adgroup_network", ""),
                "app": row.get("app", ""),
                "app_token": row.get("app_token", ""),
                "campaign": row.get("campaign", ""),
                "campaign_network": row.get("campaign_network", ""),
                "channel": row.get("channel", ""),
                "country": row.get("country", ""),
                "creative": row.get("creative", ""),
                "creative_network": row.get("creative_network", ""),
                "currency": row.get("currency", ""),
                "day": row.get("day", ""),
                "network": row.get("network", ""),
                "partner_name": row.get("partner_name", ""),
                "source_network": row.get("source_network", ""),
                "store_type": row.get("store_type", ""),
                # SKAD metrics with safe conversion
                "skad_installs": int(float(row.get("skad_installs", "0") or "0")),
                "skad_total_installs": int(float(row.get("skad_total_installs", "0") or "0")),
                "valid_conversions": int(float(row.get("valid_conversions", "0") or "0")),
                "conversion_1": int(float(row.get("conversion_1", "0") or "0")),
                "conversion_2": int(float(row.get("conversion_2", "0") or "0")),
                "conversion_3": int(float(row.get("conversion_3", "0") or "0")),
                "conversion_4": int(float(row.get("conversion_4", "0") or "0")),
                "conversion_5": int(float(row.get("conversion_5", "0") or "0")),
                "conversion_6": int(float(row.get("conversion_6", "0") or "0")),
            }

            yield op.upsert(
                table=SKAD_REPORT_TABLE_NAME,
                data=enhanced_data,
            )
            upsert_count += 1

        log.info(f"Completed upserting {upsert_count} records to BigQuery SKAD report")
        log.info(f"Apple Search Ads SKAD records processed: {apple_search_ads_count}")

    except json.JSONDecodeError as json_err:
        log.severe(f"JSON decoding error: {json_err}")
        log.severe(f"Raw response content: {response.text}")
    except Exception as err:
        log.severe(f"Error processing SKAD report: {err}")


connector = Connector(update=update, schema=schema)