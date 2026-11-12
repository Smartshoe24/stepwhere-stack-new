import type { SimulatorRunState } from "../simulation/simulator-state";

type StatusControlsProps = {
  currentStateLabel: string;
  onSendExplicitOffline: () => void;
  onSendSleep: () => void;
  onSetActive: () => void;
  onStopSending: () => void;
  runState: SimulatorRunState;
};

export function StatusControls({
  currentStateLabel,
  onSendExplicitOffline,
  onSendSleep,
  onSetActive,
  onStopSending,
  runState,
}: StatusControlsProps) {
  return (
    <section className="panel">
      <div className="panel__heading">
        <h2>State controls</h2>
      </div>
      <p className="panel__hint">Current state: {currentStateLabel}</p>
      <div className="button-grid button-grid--two">
        <button className="button button--soft" onClick={onSetActive} type="button">
          Set Active
        </button>
        <button className="button button--soft" onClick={onSendSleep} type="button">
          Send Sleep
        </button>
        <button className="button button--danger" onClick={onSendExplicitOffline} type="button">
          Send Explicit Offline
        </button>
        <button
          className="button button--outline"
          disabled={runState === "stopped"}
          onClick={onStopSending}
          type="button">
          Stop Sending
        </button>
      </div>
    </section>
  );
}
