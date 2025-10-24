import { Server, Activity, HardDrive, Cpu } from "lucide-react";
import { Card } from "./ui/card";
import { InstanceCard, Instance } from "./InstanceCard";

interface DashboardViewProps {
  instances: Instance[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DashboardView({ instances, onStart, onStop, onRestart, onDelete }: DashboardViewProps) {
  const runningInstances = instances.filter(i => i.status === "running").length;
  const totalCpuUsage = instances.reduce((sum, i) => sum + i.cpuUsage, 0) / instances.length;
  const totalRamUsage = instances.reduce((sum, i) => sum + i.ramUsage, 0);
  const totalRamCapacity = instances.reduce((sum, i) => sum + i.ramTotal, 0);

  const stats = [
    {
      label: "Total Instances",
      value: instances.length,
      icon: Server,
      color: "#0066cc",
      subtitle: `${runningInstances} running`,
    },
    {
      label: "Avg CPU Usage",
      value: `${totalCpuUsage.toFixed(1)}%`,
      icon: Cpu,
      color: "#00aaff",
      subtitle: "Across all instances",
    },
    {
      label: "Total RAM Usage",
      value: `${(totalRamUsage / 1024).toFixed(1)} GB`,
      icon: HardDrive,
      color: "#00ccff",
      subtitle: `of ${(totalRamCapacity / 1024).toFixed(1)} GB`,
    },
    {
      label: "System Health",
      value: "Healthy",
      icon: Activity,
      color: "#22c55e",
      subtitle: "All systems operational",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="bg-[#141414] border-[#2a2a2a] p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="text-[#999] text-sm">{stat.label}</div>
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}20` }}
                >
                  <Icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
              </div>
              <div className="text-white text-2xl mb-1" style={{ fontFamily: 'monospace' }}>
                {stat.value}
              </div>
              <div className="text-[#666] text-xs">{stat.subtitle}</div>
            </Card>
          );
        })}
      </div>

      {/* Active Instances Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white">Active Instances</h2>
            <p className="text-[#666] text-sm">Currently running simulation containers</p>
          </div>
          <div className="text-[#0066cc] text-sm" style={{ fontFamily: 'monospace' }}>
            {runningInstances} / {instances.length} running
          </div>
        </div>

        {/* Instance Cards Grid */}
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
      </div>

      {/* System Status */}
      <Card className="bg-[#141414] border-[#2a2a2a] p-6">
        <h3 className="text-white mb-4">Platform Status</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-white">Docker Engine</span>
            </div>
            <span className="text-[#666]" style={{ fontFamily: 'monospace' }}>v24.0.6</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-white">Traefik Load Balancer</span>
            </div>
            <span className="text-[#666]" style={{ fontFamily: 'monospace' }}>v2.10.4</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-white">cAdvisor Monitoring</span>
            </div>
            <span className="text-[#666]" style={{ fontFamily: 'monospace' }}>Active</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-white">Chrome Remote Desktop</span>
            </div>
            <span className="text-[#666]" style={{ fontFamily: 'monospace' }}>Enabled</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
