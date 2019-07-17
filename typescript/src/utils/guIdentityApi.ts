import {HttpRequestHeaders} from "../models/apiGatewayHttp";
import * as restm from "typed-rest-client/RestClient";

const restClient = new restm.RestClient('guardian-mobile-purchases');

interface UserId {
    id: string
}

interface IdentityResponse {
    status: string,
    user: UserId
}

export function getIdentityToken(headers: HttpRequestHeaders): string {
    return headers["Gu-Identity-Token"] || headers["gu-identity-token"]
}

export function getUserId(headers: HttpRequestHeaders): Promise<string> {
    const url = "https://id.guardianapis.com/user/me"
    const identityToken = getIdentityToken(headers)
    console.log(`Identity token: *${identityToken}*`)

    return restClient.get<IdentityResponse>(url, {additionalHeaders: {Authorization: `Bearer ${identityToken}`}})
        .then( res => {
            if(res.result) {
                return res.result.user.id
            } else {
                throw Error("No user id found")
            }
        })
}
