export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "DOMAIN" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" = "DOMAIN",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
