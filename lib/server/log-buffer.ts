/**
 * In-memory ring buffer for scheduler log entries.
 *
 * Logs live only in the container's memory and are lost on restart.
 * This is intentional — the Logs tab fetches them live via the API.
 */

export type LogEntry = {
  level: "info" | "warn" | "error";
  message: string;
  details?: string;
  totalRuns?: number;
  driftAlerts?: number;
  errors?: number;
  elapsedSeconds?: number;
};

const MAX_LOGS = 200;
const buffer: (LogEntry & { id: string; timestamp: string })[] = [];

let idCounter = 0;

export function pushLog(entry: LogEntry): void {
  idCounter++;
  buffer.unshift({
    ...entry,
    id: `log-${Date.now()}-${idCounter}`,
    timestamp: new Date().toISOString(),
  });
  // Trim to max size
  if (buffer.length > MAX_LOGS) {
    buffer.length = MAX_LOGS;
  }
}

export function getLogs(): (LogEntry & { id: string; timestamp: string })[] {
  return buffer;
}

export function clearLogs(): void {
  buffer.length = 0;
}
