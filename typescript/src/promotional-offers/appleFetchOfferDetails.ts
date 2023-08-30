import 'source-map-support/register'
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import { HTTPResponses } from '../models/apiGatewayHttp';

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {
    return Promise.resolve(HTTPResponses.INTERNAL_ERROR);
}
