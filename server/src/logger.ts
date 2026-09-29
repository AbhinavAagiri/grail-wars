import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? config.LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});
