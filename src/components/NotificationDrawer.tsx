import React from 'react';
import { 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  ClipboardList, 
  Bell, 
  Trash2
} from 'lucide-react';
import { NotificationPush } from '../types';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationPush[];
  onMarkAllAsRead: () => void;
  onClearNotifications: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onClearNotifications,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-base">Notifikasi &amp; Peringatan Tim</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">
            {notifications.length} Pesan Masuk
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllAsRead}
              className="text-sky-400 hover:text-sky-300 font-semibold"
            >
              Tandai Dibaca
            </button>
            <span className="text-slate-600">•</span>
            <button
              onClick={onClearNotifications}
              className="text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus</span>
            </button>
          </div>
        </div>

        {/* List of Notifications */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Tidak ada notifikasi saat ini.
            </div>
          ) : (
            notifications.map((n) => {
              let Icon = Bell;
              let iconColor = 'text-sky-400 bg-sky-950/80 border-sky-500/30';

              if (n.type === 'alert') {
                Icon = AlertTriangle;
                iconColor = 'text-rose-400 bg-rose-950/80 border-rose-500/30';
              } else if (n.type === 'sync') {
                Icon = RefreshCw;
                iconColor = 'text-emerald-400 bg-emerald-950/80 border-emerald-500/30';
              } else if (n.type === 'task') {
                Icon = ClipboardList;
                iconColor = 'text-amber-400 bg-amber-950/80 border-amber-500/30';
              }

              return (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-xl border transition ${
                    n.read
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-80'
                      : 'bg-slate-800/90 border-slate-700 shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg border shrink-0 ${iconColor}`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-white leading-tight truncate">
                          {n.title}
                        </h4>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {n.message}
                      </p>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>{new Date(n.timestamp).toLocaleTimeString('id-ID')} WIB</span>
                        {n.sta && <span className="text-amber-400">{n.sta}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
