import type { LocationTelemetryInput } from "@stepwhere/types";

type PayloadPreviewProps = {
  error?: string | null;
  payload: LocationTelemetryInput | null;
};

export function PayloadPreview({ error, payload }: PayloadPreviewProps) {
  return (
    <section className="panel">
      <div className="panel__heading">
        <h2>Next payload</h2>
      </div>
      <pre className="payload-preview">
        {payload
          ? JSON.stringify(payload, null, 2)
          : error ?? "Build a route to preview the next telemetry sample."}
      </pre>
    </section>
  );
}
