import { handler } from "../../src/pubsub/pubsub";
import {HTTPResponse, HTTPResponseHeaders} from "../../src/apigateway/types";

test("Should return HTTP 200", () => {
    process.env['Secret'] = "MYSECRET";
    expect.assertions(1);
    const input = {queryStringParameters: {secret: "MYSECRET"}, body: "body" };
    const expected = new HTTPResponse(200, new HTTPResponseHeaders(), "OK");

    return handler(input).then(result => expect(result).toStrictEqual(expected));
});
