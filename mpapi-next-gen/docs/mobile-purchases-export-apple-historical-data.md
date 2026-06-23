
export-historical-data writes the datalake files, of the form

```
bucket: s3://ophan-raw-mobile-subscription-historical-google/
path  : PROD/date=YYYY-MM-DD/YYYY-MM-DD-<random>.json.gz
```

This uses the same handler as `mobile-purchases-export-google-historical-data-*` (eg: `src/handlers/export-historical-data.ts`). The difference is the SQS queue that it reads data from.

