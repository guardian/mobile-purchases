import { handler } from "../../src/pubsub/pubsub";
import {HTTPResponse, HTTPResponseHeaders} from "../../src/apigateway/types";

test("Should return HTTP 200", () => {
    process.env['Secret'] = "MYSECRET";
    handler({queryStringParameters: {secret: "MYSECRET"}, body: "body" }).then(result =>
        expect(result).toBe(new HTTPResponse(200, new HTTPResponseHeaders(), "OK"))
    )
});
