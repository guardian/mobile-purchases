import {AppleReceiptInfo} from "../models/appleReceiptInfo";

interface DecodedReceipt {
    signature: string,
    purchase_info: string,
    pod: string,
    signing_status: string
}

function normaliseKeyName(key: string): string {
    return key.replace(/-/g, "_")
}

export function parseStrangeAppleJson(strangeJson: string): any {
    const keyValueRegexp = /"([\w-]*)"\s*=\s*"([^"]*)";*/gm;
    let match = keyValueRegexp.exec(strangeJson);

    const keyValues: any = {};

    while (match != null) {
        const key = normaliseKeyName(match[1]);
        const value = match[2];
        keyValues[key] = value;

        match = keyValueRegexp.exec(strangeJson);
    }

    return keyValues;
}

export function parseReceipt(encodedReceipt: string): AppleReceiptInfo {
    const decodedReceiptString = Buffer.from(encodedReceipt, 'base64').toString();
    const decodedReceipt = parseStrangeAppleJson(decodedReceiptString) as DecodedReceipt;

    const decodedPurchaseInfoString = Buffer.from(decodedReceipt.purchase_info, 'base64').toString();
    const decodedPurchaseInfo = parseStrangeAppleJson(decodedPurchaseInfoString) as AppleReceiptInfo;

    return decodedPurchaseInfo;
}