import { handler } from "./pubsub";

handler({queryStringParameters: {secret: "MYSECRET"}, body: "body" });