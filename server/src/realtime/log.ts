import type { FastifyBaseLogger } from 'fastify';

let logger: FastifyBaseLogger | null = null;
export function setLogger(l: FastifyBaseLogger) {
  logger = l;
}
export function log(): Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'> {
  return logger ?? console;
}
