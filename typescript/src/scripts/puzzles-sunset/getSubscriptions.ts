import {getClient} from "../android-price-rise/googleClient";
import {PACKAGE_NAME, SSM_PATH} from "./shared";
import fs from "fs";

const filePath = process.env.FILE_PATH;
if (!filePath) {
    console.log('Missing FILE_PATH');
    process.exit(1);
}

const lines = fs.readFileSync(filePath, 'utf8').split('\n');
console.log(lines.length);

getClient(SSM_PATH)
    .then(client =>
        lines.reduce(async (prev, line) => {
            await prev;

            const [subscriptionId, token] = line.split(',');
            if (subscriptionId && token) {
                // console.log(subscriptionId, token);
                return client.purchases.subscriptions.get({
                    packageName: PACKAGE_NAME,
                    subscriptionId,
                    token,
                }).then(resp => {
                    const { cancelReason } = resp.data;
                    // console.log(cancelReason);
                    if (cancelReason === undefined) {
                        console.log(line);
                    }
                })
            } else {
                return Promise.resolve();
            }
        }, Promise.resolve())
    );
