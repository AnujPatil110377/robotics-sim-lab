import { Bell, User, Search } from "lucide-react";
import { Badge } from "./ui/badge";

interface HeaderProps {
  viewTitle: string;
}

export function Header({ viewTitle }: HeaderProps) {
  return (
    <header className="h-16 bg-[#0a0a0a] border-b border-[#1f1f1f] px-8 flex items-center justify-between">
      <div>
        <h1 className="text-white">{viewTitle}</h1>
        <p className="text-[#666] text-sm">Manage your robotics simulation containers</p>
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
          <input
            type="text"
            placeholder="Search instances..."
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg pl-10 pr-4 py-2 text-white text-sm w-64 focus:outline-none focus:border-[#0066cc]"
            style={{ fontFamily: 'monospace' }}
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <Bell className="w-5 h-5 text-[#999]" />
          <Badge className="absolute -top-1 -right-1 bg-[#0066cc] text-white px-1.5 py-0.5 text-xs rounded-full border-0">
            3
          </Badge>
        </button>

        {/* User Profile */}
        <button className="flex items-center gap-3 hover:bg-[#1a1a1a] rounded-lg px-3 py-2 transition-colors">
          <div className="w-8 h-8 bg-gradient-to-br from-[#0066cc] to-[#00aaff] rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="text-white text-sm">Admin User</div>
            <div className="text-[#666] text-xs">admin@roboticslab.io</div>
          </div>
        </button>
      </div>
    </header>
  );
}
