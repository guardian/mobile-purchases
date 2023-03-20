import { DynamoDBRecord } from "aws-lambda";
import { getCancellationRecords } from "../../src/soft-opt-ins/cancelSubscription";


describe("getCancellationRecords", () => {
	it("should return filtered cancellation records from event", async () => {
		const dynamoDbEvent = { Records: [cancellationRecord, insertDynamoRecord, updateDynamoRecord] };
		const filteredRecords = getCancellationRecords(dynamoDbEvent);
		expect(filteredRecords.length).toEqual(1);
	});

	it("should return empty array when no cancellation records in event", () => {
		const dynamoDbEvent = { Records: [insertDynamoRecord, updateDynamoRecord] };
		const filteredRecords = getCancellationRecords(dynamoDbEvent);
		expect(filteredRecords.length).toEqual(0);
	})
});

const expectedSoftOptInMessage = {
	identityId: "42",
	eventType: "Cancellation",
	productName: "InAppPurchase"
};

const updateDynamoRecord: DynamoDBRecord = {
	eventID: "1",
	eventVersion: "1.0",
	dynamodb: {
		Keys: {
			subscriptionId: {
				S: "1",
			},
		},
		NewImage: {
			subscriptionId: {
				S: "1",
			}
		},
		StreamViewType: "NEW_IMAGE",
		SequenceNumber: "111",
		SizeBytes: 26,
	},
	awsRegion: "",
	eventName: "MODIFY",
	eventSourceARN: "",
	eventSource: "aws:dynamodb",
}


const insertDynamoRecord: DynamoDBRecord = {
	eventID: "1",
	eventVersion: "1.0",
	dynamodb: {
		Keys: {
			subscriptionId: {
				S: "1",
			},
		},
		NewImage: {
			subscriptionId: {
				S: "1",
			},
		},
		StreamViewType: "NEW_IMAGE",
		SequenceNumber: "111",
		SizeBytes: 26,
	},
	awsRegion: "",
	eventName: "INSERT",
	eventSourceARN: "",
	eventSource: "aws:dynamodb",
}

const cancellationRecord: DynamoDBRecord = {
	eventID: "1",
	eventVersion: "1.0",
	dynamodb: {
		Keys: {
			subscriptionId: {
				S: "1",
			},
		},
		NewImage: {
			subscriptionId: {
				S: "1",
			},
			cancellationTimestamp: {
				N: "1",
			},
		},
		StreamViewType: "NEW_IMAGE",
		SequenceNumber: "111",
		SizeBytes: 26,
	},
	awsRegion: "",
	eventName: "MODIFY",
	eventSourceARN: "",
	eventSource: "aws:dynamodb",
};
