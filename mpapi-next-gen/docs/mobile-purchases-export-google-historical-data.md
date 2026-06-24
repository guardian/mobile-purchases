
mobile-purchases-export-historical-data read from queue

```
mobile-purchases-PROD-apple-historical-subscriptions
```

and writes the datalake files, of the form

```
PROD/date=YYYY-MM-DD/YYYY-MM-DD-<random>.json.gz
```

This uses the same handler as `mobile-purchases-export-apple-historical-data-*` (eg: `src/handlers/export-historical-data.ts`). The difference is the SQS queue that it reads data from.

