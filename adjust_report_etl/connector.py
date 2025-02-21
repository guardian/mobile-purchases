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
from io import StringIO

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

DIMENSIONS = [
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


def schema(configuration: dict):
    return [
        {
            "table": CSV_REPORT_TABLE_NAME,
            "primary_key": DIMENSIONS,
            "columns": {
                # Dimensions
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
            "primary_key": DIMENSIONS,
            "columns": {
                # Dimensions
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
    DATE_PERIOD = "2023-04-01:-0d"
    API_KEY = configuration["API_KEY"]
    APP_TOKEN = configuration["APP_TOKEN"]

    if not API_KEY:
        log.severe("Api key not provided")
        return
    if not APP_TOKEN:
        log.severe("App token not provided")
        return

    # CSV REPORT
    try:
        headers = {
            "Authorization": f"Bearer {API_KEY}",
        }

        params = {
            "ad_spend_mode": AD_SPEND_MODE,
            "app_token__in": APP_TOKEN,
            "date_period": DATE_PERIOD,
            "dimensions": ",".join(DIMENSIONS),
            "metrics": ",".join(CSV_REPORT_METRICS),
        }
        log.info("Fetching data from Adjust for CSV report...")
        response = requests.get(ADJUST_API_URL, headers=headers, params=params)

        log.info(f"Received response with status code: {response.status_code}")
        response.raise_for_status()
    except requests.exceptions.HTTPError as err:
        log.severe(f"HTTP error occurred: {err}")
        log.severe(f"Response content: {response.text}")
    except Exception as err:
        log.severe(f"Other error occurred: {err}")

    try:
        log.info("Processing Adjust data...")
        csv_reader = csv.DictReader(StringIO(response.text))
        report_data = [row for row in csv_reader]

        log.info("Upserting rows to bigquery...")
        for row in report_data:
            yield op.upsert(
                table=CSV_REPORT_TABLE_NAME,
                data={
                    # Dimensions
                    "adgroup": row["adgroup"],
                    "adgroup_network": row["adgroup_network"],
                    "app": row["app"],
                    "app_token": row["app_token"],
                    "campaign": row["campaign"],
                    "campaign_network": row["campaign_network"],
                    "channel": row["channel"],
                    "country": row["country"],
                    "creative": row["creative"],
                    "creative_network": row["creative_network"],
                    "currency": row["currency"],
                    "day": row["day"],
                    "network": row["network"],
                    "partner_name": row["partner_name"],
                    "source_network": row["source_network"],
                    "store_type": row["store_type"],
                    # Metrics
                    "clicks": int(row["clicks"]),
                    "impressions": int(row["impressions"]),
                    "installs": int(row["installs"]),
                    "cost": float(row["cost"]),
                    "ad_revenue": float(row["ad_revenue"]),
                    "revenue": float(row["revenue"]),
                    "att_status_authorized": int(row["att_status_authorized"]),
                    "att_status_denied": int(row["att_status_denied"]),
                },
            )
        log.info(f"Completed upserting {len(report_data)} rows to BigQuery.")

    except json.JSONDecodeError as json_err:
        log.severe(f"JSON decoding error: {json_err}")
        log.severe(f"Raw response content: {response.text}")
    except Exception as err:
        log.severe(f"Other error occurred: {err}")

    # SKAD REPORT
    try:
        headers = {
            "Authorization": f"Bearer {API_KEY}",
        }

        params = {
            "ad_spend_mode": AD_SPEND_MODE,
            "app_token__in": APP_TOKEN,
            "date_period": DATE_PERIOD,
            "dimensions": ",".join(DIMENSIONS),
            "metrics": ",".join(SKAD_REPORT_METRICS),
        }
        log.info("Fetching data from Adjust for SKAD report...")
        response = requests.get(ADJUST_API_URL, headers=headers, params=params)

        log.info(f"Received response with status code: {response.status_code}")
        response.raise_for_status()
    except requests.exceptions.HTTPError as err:
        log.severe(f"HTTP error occurred: {err}")
        log.severe(f"Response content: {response.text}")
    except Exception as err:
        log.severe(f"Other error occurred: {err}")

    try:
        log.info("Processing Adjust data...")
        csv_reader = csv.DictReader(StringIO(response.text))
        report_data = [row for row in csv_reader]

        log.info("Upserting rows to bigquery...")
        for row in report_data:
            yield op.upsert(
                table=SKAD_REPORT_TABLE_NAME,
                data={
                    # Dimensions
                    "adgroup": row["adgroup"],
                    "adgroup_network": row["adgroup_network"],
                    "app": row["app"],
                    "app_token": row["app_token"],
                    "campaign": row["campaign"],
                    "campaign_network": row["campaign_network"],
                    "channel": row["channel"],
                    "country": row["country"],
                    "creative": row["creative"],
                    "creative_network": row["creative_network"],
                    "currency": row["currency"],
                    "day": row["day"],
                    "network": row["network"],
                    "partner_name": row["partner_name"],
                    "source_network": row["source_network"],
                    "store_type": row["store_type"],
                    # Metrics
                    "skad_installs": int(row["skad_installs"]),
                    "skad_total_installs": int(row["skad_total_installs"]),
                    "valid_conversions": int(row["valid_conversions"]),
                    "conversion_1": int(row["conversion_1"]),
                    "conversion_2": int(row["conversion_2"]),
                    "conversion_3": int(row["conversion_3"]),
                    "conversion_4": int(row["conversion_4"]),
                    "conversion_5": int(row["conversion_5"]),
                    "conversion_6": int(row["conversion_6"]),
                },
            )
        log.info(f"Completed upserting {len(report_data)} rows to BigQuery.")

    except json.JSONDecodeError as json_err:
        log.severe(f"JSON decoding error: {json_err}")
        log.severe(f"Raw response content: {response.text}")
    except Exception as err:
        log.severe(f"Other error occurred: {err}")


connector = Connector(update=update, schema=schema)
