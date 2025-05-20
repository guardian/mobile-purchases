export class ProcessingError extends Error {
    message: string;
    shouldRetry?: boolean;

    constructor(message: string, shouldRetry?: boolean) {
        super(message);
        this.message = message;
        this.shouldRetry = shouldRetry;
    }
}
