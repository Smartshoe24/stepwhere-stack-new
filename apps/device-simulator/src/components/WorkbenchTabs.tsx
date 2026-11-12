type WorkbenchTabsProps = {
  activeTab: "simulator" | "route";
  onTabChange: (tab: "simulator" | "route") => void;
};

export function WorkbenchTabs({ activeTab, onTabChange }: WorkbenchTabsProps) {
  return (
    <div className="workbench-tabs" role="tablist" aria-label="Simulator workspace panels">
      <button
        aria-selected={activeTab === "simulator"}
        className={`workbench-tab${activeTab === "simulator" ? " workbench-tab--active" : ""}`}
        onClick={() => onTabChange("simulator")}
        role="tab"
        type="button">
        Simulator
      </button>
      <button
        aria-selected={activeTab === "route"}
        className={`workbench-tab${activeTab === "route" ? " workbench-tab--active" : ""}`}
        onClick={() => onTabChange("route")}
        role="tab"
        type="button">
        Route
      </button>
    </div>
  );
}
