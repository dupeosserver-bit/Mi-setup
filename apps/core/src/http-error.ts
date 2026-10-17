/** Error con código HTTP y mensaje en español que se devuelve tal cual al cliente. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly codigo?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function missingConfig(variable: string): HttpError {
  return new HttpError(503, `Falta configurar: ${variable}`, "falta_configuracion", { variable });
}
