export class GracefulProcessingError extends Error {
	message: string;

	constructor(message: string, _shouldRetry?: boolean) {
		super(message);
		this.message = message;
	}
}
