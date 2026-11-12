import { LocateFixed } from "lucide-react";

type RecenterButtonProps = {
  onClick: () => void;
};

export function RecenterButton({ onClick }: RecenterButtonProps) {
  return (
    <button className="recenter-button" onClick={onClick} type="button">
      <LocateFixed size={18} strokeWidth={2.2} />
      <span>Recenter</span>
    </button>
  );
}
