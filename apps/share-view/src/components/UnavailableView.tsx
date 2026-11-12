type UnavailableViewProps = {
  message?: string;
  title?: string;
};

export function UnavailableView({
  message = "This location link is unavailable.",
  title = "Link unavailable",
}: UnavailableViewProps) {
  return (
    <div className="state-screen">
      <div className="state-card">
        <p className="eyebrow">Stepwhere</p>
        <h1>{title}</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}
