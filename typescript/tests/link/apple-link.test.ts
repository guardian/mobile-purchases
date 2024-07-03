import { APIGatewayProxyEvent } from "aws-lambda";
import { parseAppleLinkPayload } from "../../src/link/apple-utils"

describe("The apple link service", () => {
  it("deduplicates originalTransactionIds", () => {
    const raw = `{
      "platform":"ios-puzzles",
      "subscriptions":[
        {"originalTransactionId":"12345","receipt":"duplicate-receipt"},
        {"originalTransactionId":"12345","receipt":"duplicate-receipt"}
      ]
    }`

    const parsed = parseAppleLinkPayload({ body: raw } as APIGatewayProxyEvent)

    expect(parsed.subscriptions.length).toStrictEqual(1)
  });

  it("handles the case where subscriptions is an array", () => {
    const raw = `{
      "platform":"ios",
      "subscriptions":[
        {
          "originalTransactionId":"12345",
          "receipt":"example-receipt"
        }
      ]
    }`

    const parsed = parseAppleLinkPayload({ body: raw } as APIGatewayProxyEvent)

    expect(parsed).toEqual({
      platform: "ios",
      subscriptions: [
        {
          "originalTransactionId": "12345",
          "receipt": "example-receipt"
        }
      ]
    });
  })

  it("handles the case where subscriptions is an object", () => {
    const raw = `{
      "platform":"ios-feast",
      "subscriptions":{
        "originalTransactionId":"12345",
        "receipt":"example-receipt"
      }
    }`

    const parsed = parseAppleLinkPayload({ body: raw } as APIGatewayProxyEvent)

    expect(parsed).toEqual({
      platform: "ios-feast",
      subscriptions: [
        {
          "originalTransactionId": "12345",
          "receipt": "example-receipt"
        }
      ]
    });
  })
});
