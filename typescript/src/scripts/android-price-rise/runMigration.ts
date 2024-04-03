/**
 * Script for migrating all android subscribers who are currently on legacy prices to the latest prices.
 * Takes as input a CSV with product_id, region, currency, new price. See testPriceRise.csv for an example.
 *
 * Usage:
 * FILE_PATH=/path/to/price-rise.csv yarn run-price-rise-migration [--dry-run]
 *
 * Outputs to a CSV with a row per product_id + region.
 */

import {parsePriceRiseCsv} from "./parsePriceRiseCsv";
import {initialiseAndroidPublisherClient} from "../../services/google-play-v2";
import {androidpublisher_v3} from "@googleapis/androidpublisher";
import {regionCodeMappings} from "./regionCodeMappings";
import fs from 'fs';

const packageName = 'com.guardian';

// This is our internal definition of regions, which we map to google's region codes
const ALL_REGIONS = ['AU', 'CA', 'EU', 'UK', 'US', 'NZ', 'ROW'];
export type PriceRegion = (typeof ALL_REGIONS)[number];

export type PriceRise = {
    [productId: string]: {
        [region in PriceRegion]: {
            price: number;
            currency: string;
        };
    };
}

const filePath = process.env.FILE_PATH;
if (!filePath) {
    console.log('Missing FILE_PATH');
    process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
let writeStream = fs.createWriteStream('price-rise-dry-run.csv');
writeStream.write('productId,region,regionCode,currency,price\n');
if (DRY_RUN) {
    console.log('*****DRY RUN*****');
}

// Load new prices for each region/product_id from sheet
const priceRiseData = parsePriceRiseCsv(filePath);
console.log(priceRiseData);

const buildPrice = (currency: string, price: number): androidpublisher_v3.Schema$Money => {
    const [units, nanos] = price.toFixed(2).split('.');
    return {
        currencyCode: currency,
        units: units,
        nanos: parseInt(`${nanos}0000000`),
    };
}

initialiseAndroidPublisherClient().then(client => {
    Object.entries(priceRiseData).map(([productId, regionalPrices]) => {
        console.log(`Migrating productId ${productId} in regions: ${Object.keys(regionalPrices).join(', ')}`);

        const regionalPriceMigrations: androidpublisher_v3.Schema$RegionalPriceMigrationConfig[] =
            Object.entries(regionalPrices).flatMap(([region]) => {
                const regionCodes = regionCodeMappings[region];
                return regionCodes.map(regionCode => {
                    writeStream.write(`${productId},${region},${regionCode}\n`);
                    return {
                        priceIncreaseType: 'PRICE_INCREASE_TYPE_OPT_OUT',
                        regionCode,
                    }
                });
            });

        if (!DRY_RUN) {
            client.monetization.subscriptions.basePlans
                .migratePrices({
                    productId,
                    packageName,
                    requestBody: {
                        regionalPriceMigrations,
                    },
                })
                .then((response) => {
                    console.log(response);
                })
                .catch(err => {
                    console.log(err);
                });
        }
    });
}).finally(() => {
    writeStream.close();
});
