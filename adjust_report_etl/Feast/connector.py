# Upload to fivetran using the following command:
# fivetran deploy --api-key xxx --destination GNM --connection <connection name (same as bigquery dataset name)> --configuration configuration.json

import requests
import json
import csv

from io import StringIO
from fivetran_connector_sdk import Connector
from fivetran_connector_sdk import Logging as log
from fivetran_connector_sdk import Operations as op

log.LOG_LEVEL = log.Level.INFO

TABLE_NAME = 'csv_report'

def schema(configuration: dict):
    return [
        {
            "table": TABLE_NAME,
            "primary_key": [
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
                "store_type"
            ],

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
        }
    ]

def update(configuration: dict, state: dict):
    
    ADJUST_API_URL = 'https://automate.adjust.com/reports-service/csv_report'

    AD_SPEND_MODE = 'network'
    DATE_PERIOD = '2023-04-01:-0d'

    DIMENSIONS = ','.join([
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
        "store_type"
    ])
    
    METRICS = ','.join([
        "clicks",
        "impressions",
        "installs",
        "cost",
        "ad_revenue",
        "revenue",
        "att_status_authorized",
        "att_status_denied",
    ])

    try:
        API_KEY = configuration['API_KEY']
        headers = {
            'Authorization': f'Bearer {API_KEY}',
        }
        
        APP_TOKEN = configuration['APP_TOKEN']
        params = {
            'ad_spend_mode': AD_SPEND_MODE,
            'app_token__in': APP_TOKEN,
            'date_period': DATE_PERIOD,
            'dimensions': DIMENSIONS,
            'metrics': METRICS
        }

        log.info("Fetching data from Adjust...")
        response = requests.get(ADJUST_API_URL, headers=headers, params=params)

        log.info(f"Received response with status code: {response.status_code}")
        response.raise_for_status()
        
        log.info("Processing Adjust data...")
        csv_reader = csv.DictReader(StringIO(response.text))
        report_data = [row for row in csv_reader]

        log.info("Upserting rows to bigquery...")
        for row in report_data:
            yield op.upsert(table=TABLE_NAME, data={
                # Dimensions
                "adgroup": row['adgroup'],
                "adgroup_network": row['adgroup_network'],
                "app": row['app'],
                "app_token": row['app_token'],
                "campaign": row['campaign'],
                "campaign_network": row['campaign_network'],
                "channel": row['channel'],
                "country": row['country'],
                "creative": row['creative'],
                "creative_network": row['creative_network'],
                "currency": row['currency'],
                "day": row['day'],
                "network": row['network'],
                "partner_name": row['partner_name'],
                "source_network": row['source_network'],
                "store_type": row['store_type'],

                # Metrics
                "clicks": int(row['clicks']),
                "impressions": int(row['impressions']),
                "installs": int(row['installs']),
                "cost": float(row['cost']),
                "ad_revenue": float(row['ad_revenue']),
                "revenue": float(row['revenue']),
                "att_status_authorized": int(row['att_status_authorized']),
                "att_status_denied": int(row['att_status_denied']),
            })
        log.info(f"Completed upserting {len(report_data)} rows to BigQuery.")

    except requests.exceptions.HTTPError as err:
        log.warning(f'HTTP error occurred: {err}')
        log.warning(f'Response content: {response.text}')
    except json.JSONDecodeError as json_err:
        log.warning(f'JSON decoding error: {json_err}')
        log.warning(f'Raw response content: {response.text}')
    except Exception as err:
        log.warning(f'Other error occurred: {err}')

connector = Connector(update=update, schema=schema)