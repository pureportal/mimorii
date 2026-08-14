export class InvalidNotificationEndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotificationEndpointError";
  }
}

export class PermanentNotificationDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentNotificationDeliveryError";
  }
}

export class RetryableNotificationDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = "RetryableNotificationDeliveryError";
  }
}
