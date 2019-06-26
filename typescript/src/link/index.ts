import {HTTPRequest, HTTPResponse, HTTPResponses} from "../models/apiGatewayHttp";
import {Platform} from "../models/platform";

type LinkPayload = AppleLinkPayload | GoogleLinkPayload

type AppleLinkPayload = {
    platform: Platform.DailyEdition | Platform.Ios,
    receipts: [string]
}

type GoogleLinkPayload = {
    platform: Platform.Android
    purchaseTokens: [string]
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {
    return new Promise((success, failure) => {
        const payload = JSON.parse(request.body || "") as LinkPayload;
        switch (payload.platform) {
            case Platform.Ios:
            case Platform.DailyEdition:
                console.log(`ios payload ${payload}`);
                break;
            case Platform.Android:
                console.log(`android payload ${payload}`);
                break;
        }
        success(HTTPResponses.OK)
    });
}