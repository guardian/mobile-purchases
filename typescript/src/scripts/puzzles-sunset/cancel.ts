import {getClient} from "../android-price-rise/googleClient";
import {parseRefundCsv} from "./parseRefundCsv";
import fs from "fs";
import {PACKAGE_NAME, SSM_PATH} from "./shared";

const filePath = process.env.FILE_PATH;
if (!filePath) {
    console.log('Missing FILE_PATH');
    process.exit(1);
}

const refunds = parseRefundCsv(filePath);

let writeStream = fs.createWriteStream('cancel-output.csv');
writeStream.write('subscription_id,token,success\n');

getClient(SSM_PATH).then(client =>
    refunds.reduce(async (prev, {subscriptionId, token}) => {
        await prev;

        console.log(`Cancelling ${subscriptionId} with token ${token}`);
        return client.purchases.subscriptions.cancel({
            packageName: PACKAGE_NAME,
            subscriptionId,
            token,
        }).then(resp => {
            console.log(resp.data);
            if (resp.status !== 204) {
                console.log(`Failed to cancel ${subscriptionId} with token ${token}: ${resp.statusText}`);
                writeStream.write(`${subscriptionId},${token},false\n`);
            } else {
                writeStream.write(`${subscriptionId},${token},true\n`);
            }
        })
    }, Promise.resolve())
)
    .catch(err => {
        console.log('Error:')
        console.log(err);
    })
    .finally(() => {
        writeStream.close();
    });
