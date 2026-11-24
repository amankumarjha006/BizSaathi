export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    options: { statusCode?: number; code?: string; details?: unknown } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request data", details?: unknown) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR", details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Requested resource was not found") {
    super(message, { statusCode: 404, code: "NOT_FOUND" });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Operation conflicts with current state") {
    super(message, { statusCode: 409, code: "CONFLICT" });
  }
}

export class ConfigurationError extends AppError {
  constructor(message = "Required server configuration is missing") {
    super(message, { statusCode: 503, code: "CONFIGURATION_ERROR" });
  }
}
