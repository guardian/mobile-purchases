## Introduction

This folder contains Fivetran custom connectors, written in Python. They are used to extract data from the Adjust marketing platform for our Premium and Feast apps, and upload to Bigquery, so that the return on investment of Adjust marketing spend can be incorporated into the Marketing Effectiveness Data Asset for MRR.

## Why Python scripts and not a lambda function within our AWS stack?
Python was the only language that we could use for the custom connector, as per fivetran constraints. We could have built a lambda function instead but decided this would result in a higher technical overhead on aspects such as scheduling and infrastructure. With the Python script, all we need to maintain is the script itself.

## Stakeholders 
Data Design working on behalf of MRR.

## How to test
None of Adjust, Fivetran or Bigquery have a development environment, so the following strategies were used to dev and test the solution:

- Change into project folder:
```
cd adjust_report_etl
```

- Create virtual environment and install libraries:
```
python -m venv myenv
source myenv/bin/activate
pip install fivetran-connector-sdk
```

- Test the extract from Adjust by running the script locally:
```
fivetran debug --configuration ./configuration/adjust_feast.json
fivetran debug --configuration ./configuration/adjust_premium.json
```

- Or configuring a request in an API testing tool, such as Postman, and verifying that the parameters are correct. I found this particularly useful when trying combinations or dimensions and metrics. 

- Update the script iteratively and upload to fivetran in production. Check-in with Data Design to ensure data schema is correct and records are displaying as expected.

## Considerations
- Adding a dimension (an aggregator, or a field that groups the data, such as by 'country'), can significantly increase the time needed to extract and load the data.

- Each dimension should comprise part of the primary key as defined in the script, otherwise some records risk being overwritten

- When a new connection is created, it may be necessary to raise a PR to gain access to the dataset in bigquery (example, https://github.com/guardian/gcp-iac-terraform/pull/1009)

- During development it can be helpful to be able to delete the data in the target table and rerun the sync to verify certain behaviours are as expected. Data Tech can help with this.

## Uploading script to Fivetran
- Use this command to upload the script to Fivetran (the configuration file contains the related [Adjust app token](https://suite.adjust.com/apps)):
```
fivetran deploy --api-key xxx --destination GNM --connection adjust_feast --configuration ./configuration/adjust_feast.json

fivetran deploy --api-key xxx --destination GNM --connection adjust_premium --configuration ./configuration/adjust_premium.json
```

- Connection name automatically maps to the connection name in fivetran as well as the dataset name in bigquery

## Troubleshooting
_I was unable to find a log section in fivetran that would help to debug any issues with the script._

- Fivetran indicates that only the extract was performed
  - check metrics and dimensions specifications. Ensure each one exists in Adjust, and ensure they are typed correctly in the python script.
  - When the issue is likely a dimension or a metric, it was sometimes necessary to strip the metrics and dimensions all the way back to one of each, and rebuild from there to zero-in on which one was causing the issue.
