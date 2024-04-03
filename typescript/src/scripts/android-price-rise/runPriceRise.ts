/**
 * Script for changing the prices of android products.
 * Takes as input a CSV with product_id, region, currency, new price. See testPriceRise.csv for an example.
 *
 * Usage:
 * FILE_PATH=/path/to/price-rise.csv yarn run-price-rise [--dry-run]
 *
 * Outputs to a CSV with a row per product_id + region.
 */

import {parsePriceRiseCsv} from "./parsePriceRiseCsv";
import {initialiseAndroidPublisherClient} from "../../services/google-play-v2";
import {androidpublisher_v3} from "@googleapis/androidpublisher";
import {regionCodeMappings} from "./regionCodeMappings";
import fs from 'fs';

const packageName = 'com.guardian';

const filePath = process.env.FILE_PATH;
if (!filePath) {
    console.log('Missing FILE_PATH');
    process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
let writeStream = fs.createWriteStream('price-rise-output.csv');
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
        console.log(`Updating productId ${productId} in regions: ${Object.keys(regionalPrices).join(', ')}`);

        // Fetch existing regional prices from billing api
        // https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/get?apix_params=%7B%22packageName%22%3A%22com.guardian%22%2C%22productId%22%3A%22dev_testing_only_5%22%7D
        // client.monetization.subscriptions.get({ packageName, productId }).then((resp) => {
        //     const bp = resp.data.basePlans ? resp.data.basePlans[0] : undefined;
        //     if (bp) {
        //         console.log(bp.regionalConfigs);
        //     }
        // }).catch(err => {
        //     console.log(err)
        // });

        // Update price of each product_id/region - https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/patch
        const regionalConfigs: androidpublisher_v3.Schema$RegionalBasePlanConfig[] =
            Object.entries(regionalPrices).flatMap(([region, priceDetails]) => {
                const regionCodes = regionCodeMappings[region];
                return regionCodes.map(regionCode => {
                    writeStream.write(`${productId},${region},${regionCode},${priceDetails.currency},${priceDetails.price}\n`);
                    return {
                        price: buildPrice(priceDetails.currency, priceDetails.price),
                        regionCode,
                        newSubscriberAvailability: true,
                    }
                });
            });

        if (!DRY_RUN) {
            client.monetization.subscriptions
                .patch({
                    productId,
                    packageName,
                    "regionsVersion.version": '2022/02',
                    updateMask: 'basePlans',
                    requestBody: {
                        basePlans: [{
                            regionalConfigs,
                        }]
                    }
                })
                .then((response) => {
                    console.log(response);
                })
                .catch(err => {
                    console.log(err);
                    // console.log(err.response.data.error.errors);
                });
        }
    });
}).finally(() => {
    writeStream.close();
});
