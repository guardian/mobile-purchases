## Android Price Rise

This directory contains two scripts for performing an Android price rise and migration.

### `runPriceRise.ts`
This script uses the [PATCH endpoint](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/patch) to change the prices.

`FILE_PATH=/path/to/price-rise.csv yarn android-price-rise [--dry-run]`

It works as follows:

1. It reads in a CSV file with the new prices for each product_id/region (see testPriceRise.csv for an example).
2. It maps Guardian regions to Google regions (see `regionCodeMappings.ts`).
3. For each product_id, it fetches the existing Rate Plan from the Google API. It then sends a modified version of this Rate Plan to the PATCH endpoint, based on the prices from the CSV.

The script outputs a CSV file listing every product_id/region that was updated.

Use the `--dry-run` parameter to check the changes before running the script for real.

### `runMigration.ts`
This script uses the [migratePrices endpoint](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions.basePlans/migratePrices) to migrate existing users to the new prices.

`FILE_PATH=/path/to/price-rise.csv yarn android-price-rise-migration [--dry-run]`

It works as follows:
1. It reads in the same CSV file as `runPriceRise.ts`.
2. For each product_id, it sends a request to the migratePrices endpoint listing each region to be migrated.


### Credentials
The scripts require credentials for a Google service account to be store in AWS Parameter Store.

The Parameter Store key is configured in `./googleClient.ts`.
