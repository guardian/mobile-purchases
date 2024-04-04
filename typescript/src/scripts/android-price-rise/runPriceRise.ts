/**
 * Script for changing the prices of android products.
 * Takes as input a CSV with product_id, region, currency, new price. See testPriceRise.csv for an example.
 *
 * Usage:
 * FILE_PATH=/path/to/price-rise.csv yarn run-price-rise [--dry-run]
 *
 * Outputs to a CSV with a row per product_id + region.
 */

import {RegionPriceMap, parsePriceRiseCsv} from "./parsePriceRiseCsv";
import {androidpublisher_v3} from "@googleapis/androidpublisher";
import fs from 'fs';
import {getClient} from "./googleClient";

const packageName = 'com.guardian';

const filePath = process.env.FILE_PATH;
if (!filePath) {
    console.log('Missing FILE_PATH');
    process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
let writeStream = fs.createWriteStream('price-rise-output.csv');
writeStream.write('productId,regionCode,currency,price\n');
if (DRY_RUN) {
    console.log('*****DRY RUN*****');
}

const priceRiseData = parsePriceRiseCsv(filePath);

const buildPrice = (currency: string, price: number): androidpublisher_v3.Schema$Money => {
    const [units, nanos] = price.toFixed(2).split('.');
    return {
        currencyCode: currency,
        units: units,
        nanos: parseInt(`${nanos}0000000`),
    };
}

/**
 * Fetch existing basePlan from google API.
 * This is because we have to send the entire basePlan object in the PATCH request later
 */
const getCurrentBasePlan = (
    client: androidpublisher_v3.Androidpublisher,
    productId: string,
    packageName: string,
): Promise<androidpublisher_v3.Schema$BasePlan> =>
    client.monetization.subscriptions
        .get({ packageName, productId })
        .then((resp) => {
            const bp = resp.data.basePlans ? resp.data.basePlans[0] : undefined;
            if (bp) {
                // console.log(bp);
                // console.log('US bp:', bp.regionalConfigs?.find(rc => rc.regionCode === 'US'));
                return bp;
            } else {
                return Promise.reject('No base plan found');
            }
        });

// Returns a new BasePlan with updated prices
const updatePrices = (
    basePlan: androidpublisher_v3.Schema$BasePlan,
    googleRegionPriceMap: RegionPriceMap,
    productId: string,
): androidpublisher_v3.Schema$BasePlan => {
    const updatedRegionalConfigs = basePlan.regionalConfigs?.map((regionalConfig) => {
        if (regionalConfig.regionCode && googleRegionPriceMap[regionalConfig.regionCode]) {
            // Update the price
            const priceDetails = googleRegionPriceMap[regionalConfig.regionCode];
            if (regionalConfig.price?.currencyCode !== priceDetails.currency) {
                console.log(`Currency mismatch for ${productId} in ${regionalConfig.regionCode}: ${regionalConfig.price?.currencyCode} -> ${priceDetails.currency}`);
            }
            const currency = regionalConfig.price?.currencyCode ?? priceDetails.currency;
            writeStream.write(`${productId},${regionalConfig.regionCode},${currency},${priceDetails.price}\n`);
            return {
                ...regionalConfig,
                price: buildPrice(currency, priceDetails.price),
            };
        } else {
            // No mapping for this product_id/region, don't change it
            return regionalConfig;
        }
    });
    return {
        ...basePlan,
        regionalConfigs: updatedRegionalConfigs,
    };
}

getClient().then(client => Promise.all(
    // For each product_id in priceRiseData, update the prices in each region
    Object.entries(priceRiseData).map(([productId, regionPriceMap]) => {
        console.log(`Updating productId ${productId} in ${Object.keys(regionPriceMap).length} regions`);

        return getCurrentBasePlan(client, productId, packageName)
            .then((currentBasePlan) => {
                return updatePrices(currentBasePlan, regionPriceMap, productId);
            })
            .then((updatedBasePlan: androidpublisher_v3.Schema$BasePlan) => {
                if (!DRY_RUN) {
                    return client.monetization.subscriptions
                        .patch({
                            productId,
                            packageName,
                            "regionsVersion.version": '2022/02',
                            updateMask: 'basePlans',
                            requestBody: {
                                productId,
                                packageName,
                                basePlans: [updatedBasePlan],
                            }
                        })
                        .then((response) => {
                            console.log('Updated prices for', productId);
                        })
                }
            });
    })
))
    .catch(err => {
        console.log('Error:')
        console.log(err);
    })
    .finally(() => {
        writeStream.close();
    });
