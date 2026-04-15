import 'source-map-support/register';
import zlib from 'zlib';
import { Upload } from '@aws-sdk/lib-storage';
import {
	SQSClient,
	ReceiveMessageCommand,
	DeleteMessageBatchCommand,
	GetQueueAttributesCommand,
	type Message,
} from '@aws-sdk/client-sqs';
import { Stage } from '../utils/appIdentity';
import { s3, sqs } from '../utils/aws';
import { plusDays } from '../utils/dates';

async function recursivelyFetchSqsMessages(
	sqsUrl: string,
	remainingMessagesToFetch: number,
	handleMsg: (message: Message) => void,
): Promise<void> {
	if (remainingMessagesToFetch > 0) {
		const command = new ReceiveMessageCommand({
			QueueUrl: sqsUrl,
			MaxNumberOfMessages: 10,
			WaitTimeSeconds: 3,
			VisibilityTimeout: 600,
		});
		const sqsResp = await sqs.send(command);
		if (sqsResp.Messages && sqsResp.Messages.length > 0) {
			sqsResp.Messages.forEach(handleMsg);
			return await recursivelyFetchSqsMessages(
				sqsUrl,
				remainingMessagesToFetch - sqsResp.Messages.length,
				handleMsg,
			);
		}
	} else {
		console.log(
			"Terminating processing early as we've reached the limit of messages to fetch",
		);
	}
}

function group<A>(arrayToGroup: A[], groupSize: number): A[][] {
	if (arrayToGroup.length > 10) {
		const copiedArray = arrayToGroup.slice(0);
		const firstGroup = copiedArray.splice(0, groupSize);
		return [firstGroup].concat(group(copiedArray, groupSize));
	} else {
		return [arrayToGroup.slice(0)];
	}
}

async function deleteAllSqsMessages(
	sqsUrl: string,
	receiptHandleToDelete: string[],
): Promise<void> {
	if (receiptHandleToDelete.length > 0) {
		const batches = group(receiptHandleToDelete, 10);

		const deletions = batches.map((batch) => {
			const entries = batch.map((receiptHandle, index) => {
				return { Id: (index + 1).toString(), ReceiptHandle: receiptHandle };
			});
			const command = new DeleteMessageBatchCommand({
				QueueUrl: sqsUrl,
				Entries: entries,
			});
			return sqs.send(command);
		});

		await Promise.all(deletions);
	}
}

async function getNumberOfMessagesNotVisible(sqsUrl: string): Promise<number> {
	const command = new GetQueueAttributesCommand({
		QueueUrl: sqsUrl,
		AttributeNames: ['ApproximateNumberOfMessagesNotVisible'],
	});
	const sqsResponse = await sqs.send(command);
	if (sqsResponse.Attributes) {
		return parseInt(
			sqsResponse.Attributes.ApproximateNumberOfMessagesNotVisible!,
		);
	} else {
		throw new Error(
			`Failed to retrieve number of messages not visible for ${sqsUrl}`,
		);
	}
}

interface HandlerOutput {
	date: string;
	recordCount: number;
	processedCount: number;
}

export async function handler(params: {
	date: string;
	maxMessagesToFetch?: number;
}): Promise<HandlerOutput> {
	const bucket = process.env['ExportBucket'];
	if (!bucket) throw new Error('Variable ExportBucket must be set');

	const sqsUrl = process.env['SqsUrl'];
	if (!sqsUrl) throw new Error('Variable SqsUrl must be set');

	const numberOfMessagesNotVisible =
		await getNumberOfMessagesNotVisible(sqsUrl);
	if (numberOfMessagesNotVisible > 1) {
		throw new Error(
			`Approximately ${numberOfMessagesNotVisible} messages are unavailable for processing. Something else is currently consuming messages from ${sqsUrl}`,
		);
	}

	const zippedStream = zlib.createGzip();

	const maxMessagesToFetch = params.maxMessagesToFetch ?? Number.MAX_VALUE;

	const yesterday =
		params.date ?? plusDays(new Date(), -1).toISOString().substr(0, 10);
	console.log(`[4a949499] yesterday: ${yesterday}`);

	const prefix = Stage === 'PROD' ? 'data' : 'code-data';
	const randomString = Math.random().toString(36).substring(10);
	const filename = `${prefix}/date=${yesterday}/${yesterday}-${randomString}.json.gz`;
	console.log(`[b3e0e9c1] filename: ${filename}`);

	const upload = new Upload({
		client: s3,
		params: {
			Bucket: bucket,
			Key: filename,
			Body: zippedStream,
			ACL: 'bucket-owner-full-control',
		},
	});

	const msgToDelete: string[] = [];
	let totalMsgCount = 0;
	let processedMsgCount = 0;

	function handleOneMessage(sqsMessage: Message): void {
		totalMsgCount++;
		const parsedMessage = JSON.parse(sqsMessage.Body ?? '');
		const messageDate = parsedMessage.snapshotDate.substr(0, 10);
		if (messageDate == yesterday) {
			processedMsgCount++;
			const message = JSON.stringify(parsedMessage) + '\n';
			zippedStream.write(message);
			if (sqsMessage.ReceiptHandle) msgToDelete.push(sqsMessage.ReceiptHandle);
		}
	}

	await recursivelyFetchSqsMessages(
		sqsUrl,
		maxMessagesToFetch,
		handleOneMessage,
	);

	zippedStream.end();
	await upload.done();

	console.log(
		`[bd9ba1a3] export succeeded, read ${totalMsgCount} records, processed ${processedMsgCount}`,
	);

	await deleteAllSqsMessages(sqsUrl, msgToDelete);
	console.log(
		`[fe786204] deleted ${msgToDelete.length} messages from the SQS queue`,
	);

	return {
		date: yesterday,
		recordCount: totalMsgCount,
		processedCount: processedMsgCount,
	};
}
