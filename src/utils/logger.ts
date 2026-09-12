/**
 * Minimal structured logger.
 *
 * - Respects NO_COLOR env variable.
 * - When --json mode is active, all log output goes to stderr.
 * - Debug logs only appear when FATHOM_DEBUG=1.
 */

const isDebug = process.env['FATHOM_DEBUG'] === '1';

export const logger = {
  debug(message: string): void {
    if (!isDebug) return;
    process.stderr.write(`[debug] ${message}\n`);
  },
  info(message: string): void {
    process.stderr.write(`[info] ${message}\n`);
  },
  warn(message: string): void {
    process.stderr.write(`[warn] ${message}\n`);
  },
  error(message: string): void {
    process.stderr.write(`[error] ${message}\n`);
  },
};
