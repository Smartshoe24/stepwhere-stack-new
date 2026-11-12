import type { LogEntry } from "../simulation/simulator-state";

type SimulatorLogProps = {
  logs: LogEntry[];
};

export function SimulatorLog({ logs }: SimulatorLogProps) {
  return (
    <section className="panel">
      <div className="panel__heading">
        <h2>Send log</h2>
        <span className="panel__meta">{logs.length} entries</span>
      </div>
      <div className="log-list">
        {logs.length === 0 ? (
          <p className="empty-state">No telemetry samples have been sent yet.</p>
        ) : (
          logs.map((entry) => (
            <article className="log-entry" key={entry.id}>
              <div className="log-entry__header">
                <strong>{entry.state}</strong>
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
              <p>{entry.message}</p>
              <small>{entry.payloadSummary}</small>
              <small>{entry.responseStatus ? `HTTP ${entry.responseStatus}` : "No HTTP response"}</small>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
