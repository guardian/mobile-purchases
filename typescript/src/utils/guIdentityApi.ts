import {HttpRequestHeaders} from "../models/apiGatewayHttp";
import {Option} from "./option";
import {restClient} from "./restClient";

interface UserId {
    id: string
}

interface IdentityResponse {
    status: string,
    user: UserId
}

export function getAuthToken(headers: HttpRequestHeaders): string {
    return (headers["Authorization"] ?? headers["authorization"]).replace("Bearer ", "");
}

export async function getUserId(headers: HttpRequestHeaders): Promise<Option<string>> {
    const url = "https://id.guardianapis.com/user/me";
    const identityToken = getAuthToken(headers);

    try {
        const response = await restClient.get<IdentityResponse>(url, {additionalHeaders: {Authorization: `Bearer ${identityToken}`}})
        if(response.result) {
            return response.result.user.id
        } else {
            return null;
        }
    } catch (e) {
      console.error(`Unable to identify user with token ${identityToken}`, e);
      throw e;
    }
}
