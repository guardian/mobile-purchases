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
import {androidpublisher_v3} from "@googleapis/androidpublisher";
import {regionCodeMappings} from "./regionCodeMappings";
import fs from 'fs';
import {getClient} from "./googleClient";

const packageName = 'com.guardian';

const filePath = process.env.FILE_PATH;
if (!filePath) {
    console.log('Missing FILE_PATH');
    process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
let writeStream = fs.createWriteStream('price-rise-migration-output.csv');
writeStream.write('productId,region,regionCode\n');
if (DRY_RUN) {
    console.log('*****DRY RUN*****');
}

const priceRiseData = parsePriceRiseCsv(filePath);

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
                return bp;
            } else {
                return Promise.reject('No base plan found');
            }
        });

getClient().then(client => Promise.all(
    Object.entries(priceRiseData).map(([productId, regionalPrices]) => {
        console.log(`Migrating productId ${productId} in regions: ${Object.keys(regionalPrices).join(', ')}`);

        return getCurrentBasePlan(client, productId, packageName)
            .then((basePlan) => {
                const regionalPriceMigrations: androidpublisher_v3.Schema$RegionalPriceMigrationConfig[] =
                    Object.entries(regionalPrices).flatMap(([region]) => {
                        const regionCodes = regionCodeMappings[region];
                        return regionCodes.map(regionCode => {
                            writeStream.write(`${productId},${region},${regionCode}\n`);
                            return {
                                priceIncreaseType: 'PRICE_INCREASE_TYPE_OPT_OUT',
                                regionCode,
                                oldestAllowedPriceVersionTime: new Date().toISOString(),
                            }
                        });
                    });

                if (!DRY_RUN) {
                    if (basePlan.basePlanId) {
                        return client.monetization.subscriptions.basePlans
                            .migratePrices({
                                productId,
                                packageName,
                                basePlanId: basePlan.basePlanId,
                                requestBody: {
                                    basePlanId: basePlan.basePlanId,
                                    packageName,
                                    productId,
                                    regionsVersion: { version: '2022/02' },
                                    regionalPriceMigrations,
                                },
                            })
                            .then((response) => {
                                console.log(`Migration successful for ${productId}`);
                            })
                    }
                }
            });
    })
))
    .catch(err => {
        console.log('Error:');
        console.log(err);
    })
    .finally(() => {
        writeStream.close();
    });
