interface PgLikeError {
  code?: string;
  message?: string;
}

/**
 * Plain-language text for a failed inspection RPC. Raw database messages are not passed through;
 * only the fixed text below reaches the user.
 */
export function mapInspectionError(error: PgLikeError | null | undefined): string {
  switch (error?.code) {
    case '42501':
      return 'You are not allowed to do this.';
    case 'P0002':
      return 'That inspection visit could not be found.';
    case '22023':
      return 'The request was not accepted. Check the details and try again.';
    default:
      return 'The change could not be completed. Please try again.';
  }
}

/** Failure bodies the RPCs return as `{ ok: false, code, message }` for expected business states. */
export function rpcFailureMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'ok' in body && (body as { ok: unknown }).ok === false) {
    const m = (body as { message?: unknown }).message;
    return typeof m === 'string' ? m : 'The change could not be completed.';
  }
  return null;
}

export type InspectionActionResult = { ok: true } | { ok: false; error: string };

/** Explicit guard: the project builds with strict off, where `ok` alone does not narrow. */
export function isInspectionFailure(r: InspectionActionResult): r is { ok: false; error: string } {
  return r.ok === false;
}
