import { InMemorySessionStore } from './sessionStore';
import { CsvSessionData, ISessionStore } from '../types';

/**
 * Singleton session store instance for CSV upload sessions.
 *
 * Using a concrete instance here — to swap for Redis, replace this file
 * with a Redis-backed implementation of ISessionStore<CsvSessionData>.
 */
export const csvSessionStore: ISessionStore<CsvSessionData> =
  new InMemorySessionStore<CsvSessionData>();
