import fs from 'fs';

/**
 * See `./testPriceRise.csv` for an example of the expected format.
 */

export type Refund = {
    token: string;
    subscriptionId: string;
}

export const parseRefundCsv = (filePath: string): Refund[] => {
    const data = fs.readFileSync(filePath, 'utf8');

    const lines = data.split('\n');

    const refunds: Refund[] = [];

    lines.forEach((line) => {
        if (line.trim() === '') {
            return;
        }
        const [subscriptionId, token] = line.split(',');
        if (subscriptionId && token) {
            refunds.push({
                subscriptionId,
                token,
            });
        } else {
            console.log(`Invalid refund line: ${line}`);
        }
    });

    return refunds;
};
