import {Readable, ReadableOptions} from "stream";
import {ScanIterator} from "@aws/dynamodb-data-mapper";

export class DynamoStream<T> extends Readable {

    iterator: ScanIterator<T>;

    constructor(iterator: ScanIterator<T>, opts?: ReadableOptions) {
        super(opts);
        this.iterator = iterator;
    }

    readNext() {
        this.iterator.next().then(iteratorResult => {
            if (!iteratorResult.done) {
                const pushResult = this.push(JSON.stringify(iteratorResult.value) + '\n');
                if (pushResult) {
                    this.readNext()
                }
            } else {
                this.push(null);
            }
        });
    }

    _read(size: number): void {
        this.readNext()
    }

    recordCount(): number {
        return this.iterator.scannedCount;
    }

}