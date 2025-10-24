import { LayoutDashboard, Server, Activity, Settings, Plus } from "lucide-react";
import { Button } from "./ui/button";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onCreateInstance: () => void;
}

export function Sidebar({ activeView, onViewChange, onCreateInstance }: SidebarProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "instances", label: "Instances", icon: Server },
    { id: "monitoring", label: "Monitoring", icon: Activity },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="w-64 h-screen bg-[#0a0a0a] border-r border-[#1f1f1f] flex flex-col">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#0066cc] to-[#00aaff] rounded-lg flex items-center justify-center">
            <Server className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-white" style={{ fontFamily: 'monospace' }}>Robotics Sim Lab</div>
            <div className="text-[#666]" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>Container Manager</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? "bg-[#0066cc] text-white"
                    : "text-[#999] hover:bg-[#1a1a1a] hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Quick Action Button */}
      <div className="p-4 border-t border-[#1f1f1f]">
        <Button
          onClick={onCreateInstance}
          className="w-full bg-[#0066cc] hover:bg-[#0052a3] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Instance
        </Button>
      </div>
    </div>
  );
}
