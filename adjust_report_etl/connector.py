import requests
import json
import csv
from io import StringIO
from fivetran_connector_sdk import Connector
from fivetran_connector_sdk import Logging as log
from fivetran_connector_sdk import Operations as op

log.LOG_LEVEL = log.Level.INFO

ADJUST_API_URL = 'https://automate.adjust.com/reports-service/csv_report'
TABLE_NAME = 'data'

def schema(configuration: dict):
   return [
       {
           "table": TABLE_NAME,
           "primary_key": ["campaign_id_network", "device_type"],
           "columns": {
               # Dimensions
               "day": "STRING",
               "week": "STRING",
               "month": "STRING",
               "year": "STRING",
               "quarter": "STRING",
               "os_name": "STRING",
               "device_type": "STRING",
               "app": "STRING",
               "app_token": "STRING",
               "store_id": "STRING",
               "store_type": "STRING",
               "currency": "STRING",
               "currency_code": "STRING",
               "network": "STRING",
               "campaign": "STRING",
               "campaign_network": "STRING",
               "campaign_id_network": "STRING",
               "adgroup": "STRING",
               "adgroup_network": "STRING",
               "adgroup_id_network": "STRING",
               "source_network": "STRING",
               "source_id_network": "STRING",
               "creative": "STRING",
               "creative_network": "STRING",
               "creative_id_network": "STRING",
               "country": "STRING",
               "country_code": "STRING",
               "region": "STRING",
               "partner_name": "STRING",
               "partner_id": "STRING",
               "partner": "STRING",
               "channel": "STRING",
               "platform": "STRING",

               # Metrics
               "att_status_authorized": "INT",
               "att_status_non_determined": "INT",
               "att_status_denied": "INT",
               "att_status_restricted": "INT",
               "att_consent_rate": "FLOAT",
               "daus": "FLOAT",
               "maus": "FLOAT",
               "waus": "FLOAT",
               "base_sessions": "INT",
               # "cancels": "INT", no access to this metric. Do we need it?
               "clicks": "INT",
               "attribution_clicks": "INT",
               "network_clicks": "INT",
               "click_conversion_rate": "FLOAT",
               "ctr": "FLOAT",
               "deattributions": "INT",
               "events": "INT",
               "first_reinstalls": "INT",
               "first_uninstalls": "INT",
               "gdpr_forgets": "INT",
               "impressions": "INT",
               "attribution_impressions": "INT",
               "network_impressions": "INT",
               "impression_conversion_rate": "FLOAT",
               "installs": "INT",
               "network_installs": "INT",
               "network_installs_diff": "INT",
               "installs_per_mile": "FLOAT",
               "limit_ad_tracking_installs": "INT",
               "limit_ad_tracking_install_rate": "FLOAT",
               "limit_ad_tracking_reattributions": "INT",
               "limit_ad_tracking_reattribution_rate": "FLOAT",
               "non_organic_installs": "INT",
               "organic_installs": "INT",
               "reattributions": "INT",
               "reattribution_reinstalls": "INT",
               "reinstalls": "INT",
               # "renewals": "INT", no access to this metric. Do we need it?
               "sessions": "INT",
               "uninstalls": "INT",
               "uninstall_cohort": "FLOAT",
               "network_cost": "FLOAT",
           },
       }
   ]

def update(configuration: dict, state: dict):
   API_KEY = configuration['API_KEY']
   APP_TOKEN = configuration['APP_TOKEN']
  
   AD_SPEND_MODE = 'network'
   DATE_PERIOD = '-30d:-0d'
   DIMENSIONS = 'day,week,month,year,quarter,os_name,device_type,app,app_token,store_id,store_type,currency,currency_code,network,campaign,campaign_network,campaign_id_network,adgroup,adgroup_network,adgroup_id_network,source_network,source_id_network,creative,creative_network,creative_id_network,country,country_code,region,partner_name,partner_id,partner,channel,platform'
   METRICS = 'network_cost,att_status_authorized,att_status_non_determined,att_status_denied,att_status_restricted,att_consent_rate,daus,maus,waus,base_sessions,clicks,attribution_clicks,network_clicks,click_conversion_rate,ctr,deattributions,events,first_reinstalls,first_uninstalls,gdpr_forgets,impressions,attribution_impressions,network_impressions,impression_conversion_rate,installs,network_installs,network_installs_diff,installs_per_mile,limit_ad_tracking_installs,limit_ad_tracking_install_rate,limit_ad_tracking_reattributions,limit_ad_tracking_reattribution_rate,non_organic_installs,organic_installs,reattributions,reattribution_reinstalls,reinstalls,sessions,uninstalls,uninstall_cohort'

   headers = {
       'Authorization': f'Bearer {API_KEY}',
   }
  
   params = {
       'ad_spend_mode': AD_SPEND_MODE,
       'app_token__in': APP_TOKEN,
       'date_period': DATE_PERIOD,
       'dimensions': DIMENSIONS,
       'metrics': METRICS
   }

   try:
       log.info("Fetching data from Adjust...")
       response = requests.get(ADJUST_API_URL, headers=headers, params=params)

       log.info("Processing response from Adjust...")
       response.raise_for_status()
      
       csv_reader = csv.DictReader(StringIO(response.text))
       report_data = [row for row in csv_reader]

       log.info("Upserting to bigquery...")
       for row in report_data:

           yield op.upsert(table=TABLE_NAME, data={
               # Dimensions
               "day": row['day'],
               "week": row['week'],
               "month": row['month'],
               "year": row['year'],
               "quarter": row['quarter'],
               "os_name": row['os_name'],
               "device_type": row['device_type'],
               "app": row['app'],
               "app_token": row['app_token'],
               "store_id": row['store_id'],
               "store_type": row['store_type'],
               "currency": row['currency'],
               "currency_code": row['currency_code'],
               "network": row['network'],
               "campaign": row['campaign'],
               "campaign_network": row['campaign_network'],
               "campaign_id_network": row['campaign_id_network'],
               "adgroup": row['adgroup'],
               "adgroup_network": row['adgroup_network'],
               "adgroup_id_network": row['adgroup_id_network'],
               "source_network": row['source_network'],
               "source_id_network": row['source_id_network'],
               "creative": row['creative'],
               "creative_network": row['creative_network'],
               "creative_id_network": row['creative_id_network'],
               "country": row['country'],
               "country_code": row['country_code'],
               "region": row['region'],
               "partner_name": row['partner_name'],
               "partner_id": row['partner_id'],
               "partner": row['partner'],
               "channel": row['channel'],
               "platform": row['platform'],

               # Metrics
               "network_cost": float(row['network_cost']),
               "att_status_authorized": int(row['att_status_authorized']),
               "att_status_non_determined": int(row['att_status_non_determined']),
               "att_status_denied": int(row['att_status_denied']),
               "att_status_restricted": int(row['att_status_restricted']),
               "att_consent_rate": float(row['att_consent_rate']),
               "daus": float(row['daus']),
               "maus": float(row['maus']),
               "waus": float(row['waus']),
               "base_sessions": int(row['base_sessions']),
               "clicks": int(row['clicks']),
               "attribution_clicks": int(row['attribution_clicks']),
               "network_clicks": int(row['network_clicks']),
               "click_conversion_rate": float(row['click_conversion_rate']),
               "ctr": float(row['ctr']),
               "deattributions": int(row['deattributions']),
               "events": int(row['events']),
               "first_reinstalls": int(row['first_reinstalls']),
               "first_uninstalls": int(row['first_uninstalls']),
               "gdpr_forgets": int(row['gdpr_forgets']),
               "impressions": int(row['impressions']),
               "attribution_impressions": int(row['attribution_impressions']),
               "network_impressions": int(row['network_impressions']),
               "impression_conversion_rate": float(row['impression_conversion_rate']),
               "installs": int(row['installs']),
               "network_installs": int(row['network_installs']),
               "network_installs_diff": int(row['network_installs_diff']),
               "installs_per_mile": float(row['installs_per_mile']),
               "limit_ad_tracking_installs": int(row['limit_ad_tracking_installs']),
               "limit_ad_tracking_install_rate": float(row['limit_ad_tracking_install_rate']),
               "limit_ad_tracking_reattributions": int(row['limit_ad_tracking_reattributions']),
               "limit_ad_tracking_reattribution_rate": float(row['limit_ad_tracking_reattribution_rate']),
               "non_organic_installs": int(row['non_organic_installs']),
               "organic_installs": int(row['organic_installs']),
               "reattributions": int(row['reattributions']),
               "reattribution_reinstalls": int(row['reattribution_reinstalls']),
               "reinstalls": int(row['reinstalls']),
               "sessions": int(row['sessions']),
               "uninstalls": int(row['uninstalls']),
               "uninstall_cohort": float(row['uninstall_cohort']),
           })

   except requests.exceptions.HTTPError as err:
       log.warning(f'HTTP error occurred: {err}')
       log.warning(f'Response content: {response.text}')
   except json.JSONDecodeError as json_err:
       log.warning(f'JSON decoding error: {json_err}')
       log.warning(f'Raw response content: {response.text}')
   except Exception as err:
       log.warning(f'Other error occurred: {err}')

connector = Connector(update=update, schema=schema)
