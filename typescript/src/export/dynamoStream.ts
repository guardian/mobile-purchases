// @ts-nocheck

import { Readable, ReadableOptions } from "stream";
import { ScanIterator } from "@aws/dynamodb-data-mapper";

export class DynamoStream<T> extends Readable {
  iterator: ScanIterator<T>;
  transformItem: (t: T) => any;

  constructor(
    iterator: ScanIterator<T>,
    transformItem?: (t: T) => any,
    opts?: ReadableOptions,
  ) {
    super(opts);
    this.iterator = iterator;
    if (transformItem) {
      this.transformItem = transformItem;
    } else {
      this.transformItem = (t) => t;
    }
  }

  readNext() {
    this.iterator.next().then((iteratorResult) => {
      if (!iteratorResult.done) {
        const value = this.transformItem(iteratorResult.value);
        const pushResult = this.push(JSON.stringify(value) + "\n");
        if (pushResult) {
          this.readNext();
        }
      } else {
        this.push(null);
      }
    });
  }

  _read(size: number): void {
    this.readNext();
  }

  recordCount(): number {
    return this.iterator.scannedCount;
  }
}
