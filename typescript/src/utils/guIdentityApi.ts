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
    } catch (error) {
        // The REST client used here throws on 403s, so we have to try...catch
        // instead of handling this case in the response object above
        // https://github.com/microsoft/typed-rest-client#rest
        if (error.statusCode === 403) {
            console.warn('Identity API returned 403');
            return null;
        } else {
            throw error;
        }
    }
}
