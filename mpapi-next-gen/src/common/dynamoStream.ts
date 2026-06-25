import type { ReadableOptions } from 'stream';
import { Readable } from 'stream';
import {
	DynamoDBClient,
	ScanCommandInput,
	ScanCommand,
	AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

export interface DynamoStreamOptions<T> extends ReadableOptions {
	client: DynamoDBClient;
	params: Omit<ScanCommandInput, 'ExclusiveStartKey'>;
	transformItem?: (item: T) => unknown;
	pageSize?: number;
}

export class DynamoStream<T> extends Readable {
	private client: DynamoDBClient;
	private params: Omit<ScanCommandInput, 'ExclusiveStartKey'>;
	private transformItem: (item: T) => unknown;
	private lastEvaluatedKey: Record<string, AttributeValue> | undefined; // Changed
	private isComplete: boolean = false;
	private currentPage: T[] = [];
	private currentIndex: number = 0;
	private scannedCount: number = 0;
	private pageSize: number;

	constructor(options: DynamoStreamOptions<T>) {
		super(options);
		this.client = options.client;
		this.params = options.params;
		this.transformItem = options.transformItem || ((item: T) => item);
		this.pageSize = options.pageSize || 1000;

		if ('ExclusiveStartKey' in this.params) {
			delete (this.params as Record<string, unknown>).ExclusiveStartKey;
		}
	}

	private async fetchNextPage(): Promise<void> {
		try {
			const command = new ScanCommand({
				...this.params,
				ExclusiveStartKey: this.lastEvaluatedKey,
				Limit: this.pageSize,
			});

			const response = await this.client.send(command);

			const items = (response.Items || []).map((item) => unmarshall(item) as T);
			this.currentPage = items;
			this.currentIndex = 0;
			this.scannedCount += response.ScannedCount || 0;
			this.lastEvaluatedKey = response.LastEvaluatedKey;

			if (!this.lastEvaluatedKey) {
				this.isComplete = true;
			}
		} catch (error) {
			this.destroy(error as Error);
		}
	}

	private async readNext(): Promise<void> {
		if (this.isComplete && this.currentIndex >= this.currentPage.length) {
			this.push(null);
			return;
		}

		if (this.currentIndex >= this.currentPage.length) {
			await this.fetchNextPage();

			if (this.currentPage.length === 0 && this.isComplete) {
				this.push(null);
				return;
			}
		}

		if (this.currentIndex < this.currentPage.length) {
			const item = this.currentPage[this.currentIndex++];
			const transformed = this.transformItem(item);
			const pushResult = this.push(JSON.stringify(transformed) + '\n');

			if (pushResult) {
				setImmediate(() => this.readNext());
			}
		}
	}

	_read(_size: number): void {
		if (!this.isComplete || this.currentIndex < this.currentPage.length) {
			this.readNext();
		} else {
			this.push(null);
		}
	}

	recordCount(): number {
		return this.scannedCount;
	}

	async getTotalCount(): Promise<number> {
		const command = new ScanCommand({
			...this.params,
			Select: 'COUNT',
			Limit: 1,
		});

		const response = await this.client.send(command);
		return response.ScannedCount || 0;
	}
}
