import { InstanceCard, Instance } from "./InstanceCard";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";

interface InstancesViewProps {
  instances: Instance[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
}

export function InstancesView({ instances, onStart, onStop, onRestart, onDelete }: InstancesViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const runningCount = instances.filter(i => i.status === "running").length;
  const stoppedCount = instances.filter(i => i.status === "stopped").length;
  const errorCount = instances.filter(i => i.status === "error").length;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white">All Instances</h2>
          <div className="flex gap-4 mt-2">
            <span className="text-green-400 text-sm">
              <span style={{ fontFamily: 'monospace' }}>{runningCount}</span> Running
            </span>
            <span className="text-gray-400 text-sm">
              <span style={{ fontFamily: 'monospace' }}>{stoppedCount}</span> Stopped
            </span>
            {errorCount > 0 && (
              <span className="text-red-400 text-sm">
                <span style={{ fontFamily: 'monospace' }}>{errorCount}</span> Error
              </span>
            )}
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("grid")}
            className={`${
              viewMode === "grid"
                ? "bg-[#0066cc] text-white border-[#0066cc]"
                : "bg-[#0a0a0a] text-[#999] border-[#2a2a2a] hover:bg-[#1a1a1a]"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("list")}
            className={`${
              viewMode === "list"
                ? "bg-[#0066cc] text-white border-[#0066cc]"
                : "bg-[#0a0a0a] text-[#999] border-[#2a2a2a] hover:bg-[#1a1a1a]"
            }`}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Instance Grid/List */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              onStart={onStart}
              onStop={onStop}
              onRestart={onRestart}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              onStart={onStart}
              onStop={onStop}
              onRestart={onRestart}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
