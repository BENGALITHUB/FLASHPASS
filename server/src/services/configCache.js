import { AdminSettings } from '../models/AdminSettings.js';
import { Event } from '../models/Event.js';

/*
 * Short-lived cache of event configuration for the gate scan path.
 *
 * Every scan needs the global settings and the pass's event, which almost never
 * change. Reading them from MongoDB on every scan doubled the database work at
 * busy gates. They are kept for a few seconds, and any admin save clears the
 * cache at once (clearConfigCache), so lockdowns and rule changes apply immediately.
 * Callers must treat the returned documents as read-only.
 */
const TTL_MS = 3000;
let settingsEntry = null;
const eventEntries = new Map();

export async function getCachedSettings() {
  if (settingsEntry && settingsEntry.expires > Date.now()) return settingsEntry.value;
  const value = await AdminSettings.getSettings();
  settingsEntry = { value, expires: Date.now() + TTL_MS };
  return value;
}

export async function getCachedEvent(eventId) {
  const key = eventId || 'comics-carnival';
  const hit = eventEntries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await Event.findOne({ eventId: key });
  eventEntries.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function clearConfigCache() {
  settingsEntry = null;
  eventEntries.clear();
}
