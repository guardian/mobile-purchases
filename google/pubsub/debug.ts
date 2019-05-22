import { handler } from "./pubsub";

let result = handler({queryStringParameters: {secret: "MYSECRET"}, body: "body" });

result.then(JSON.stringify).then(console.log);