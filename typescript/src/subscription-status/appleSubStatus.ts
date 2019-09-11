import 'source-map-support/register'
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Platform} from "../models/platform";
import {AppleValidationResponse, validateReceipt} from "../services/appleValidateReceipts";
import {HTTPResponses} from "../models/apiGatewayHttp";
import {plusDays} from "../utils/dates";

interface AppleSubscription {
    receipt: string
    originalTransactionId: string
}

interface AppleLinkPayload {
    platform: Platform.DailyEdition | Platform.Ios
    subscriptions: AppleSubscription[]
}

interface AppleSubscriptionStatusResponse {
    originalTransactionId: string
    valid: boolean
    gracePeriod: boolean
    start: string
    end: string
    product: string
    latestReceipt: string
}

function toResponse(validationResponse: AppleValidationResponse): AppleSubscriptionStatusResponse {
    const now = new Date();

    const receiptInfo = validationResponse.latestReceiptInfo;
    const end = receiptInfo.expiresDate;
    const endWithGracePeriod = plusDays(end, 30);
    const valid: boolean = now.getTime() <= endWithGracePeriod.getTime();
    const gracePeriod: boolean = now.getTime() > end.getTime() && valid;

    return {
        originalTransactionId: receiptInfo.originalTransactionId,
        valid: valid,
        gracePeriod: gracePeriod,
        start: receiptInfo.originalPurchaseDate.toISOString(),
        end: end.toISOString(),
        product: receiptInfo.productId,
        latestReceipt: validationResponse.latestReceipt
    }
}

export async function handler(httpRequest: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const payload = JSON.parse(httpRequest.body || "") as AppleLinkPayload;

    try {
        const validationResults = await Promise.all(payload.subscriptions.map(sub => validateReceipt(sub.receipt)));
        const responsePayload = JSON.stringify(validationResults.map(toResponse));
        return {statusCode: 200, body: responsePayload};
    } catch (e) {
        console.log(`Unable to validate receipt(s)`, e);
        return HTTPResponses.INTERNAL_ERROR;
    }
}