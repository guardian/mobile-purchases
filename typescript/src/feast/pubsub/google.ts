import type {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import { HTTPResponses } from "../../models/apiGatewayHttp";

export function buildHandler(): (request: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
    return async (request: APIGatewayProxyEvent) => {
        const secret = process.env.Secret;

        if (secret === undefined) {
            console.error("PubSub secret in env is 'undefined'");
            return HTTPResponses.INTERNAL_ERROR
        }

        if (request.queryStringParameters?.secret === secret) {
            // placeholder for new lambda
            console.log(`${JSON.stringify(request)}`)
            return HTTPResponses.OK;
        } else {
            return HTTPResponses.UNAUTHORISED;
        }
    }
}

export const handler = buildHandler();