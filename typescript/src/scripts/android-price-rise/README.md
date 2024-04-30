## Android Price Rise

This directory contains a script for performing an Android price rise.

Once a price rise has been done, you can migrate existing subscribers to the new price from the Google Play web console.

### `runPriceRise.ts`
This script uses the [PATCH endpoint](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/patch) to change the prices.

`FILE_PATH=/path/to/price-rise.csv yarn android-price-rise [--dry-run]`

It works as follows:

1. It reads in a CSV file with the new prices for each product_id/region (see testPriceRise.csv for an example).
2. For each product_id, it fetches the existing Rate Plan from the Google API. It then sends a modified version of this Rate Plan to the PATCH endpoint, based on the prices from the CSV.

The script outputs a CSV file listing every product_id/region that was updated.

Use the `--dry-run` parameter to check the changes before running the script for real.


### Credentials
The scripts require credentials for a Google service account to be store in AWS Parameter Store.

The Parameter Store key is configured in `./googleClient.ts`.
