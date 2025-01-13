export class GracefulProcessingError extends Error {
  message: string;

  constructor(message: string, shouldRetry?: boolean) {
    super(message);
    this.message = message;
  }
}
