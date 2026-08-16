"use client";

import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Notification = {
  id: number;
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
};

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    title: "Nueva cita agendada",
    description: "Juan García agendó una cita para el 3 de abril a las 09:00",
    read: false,
    createdAt: "Hace 5 minutos",
  },
  {
    id: 2,
    title: "Nueva cita agendada",
    description: "María López agendó una cita para el 4 de abril a las 10:00",
    read: false,
    createdAt: "Hace 1 hora",
  },
  {
    id: 3,
    title: "Nueva cita agendada",
    description: "Carlos Ruiz agendó una cita para el 5 de abril a las 11:00",
    read: true,
    createdAt: "Ayer",
  },
];

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] =
    useState<Notification[]>(MOCK_NOTIFICATIONS);
  const ref = useRef<HTMLDivElement>(null);

  // Order notifications by created date
  const unreadCount = notifications.filter((n) => !n.read).length;

  // TODO: Have a count of unread notifications

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markAsRead(id: number) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  return (
    <div ref={ref} className="relative mb-4 justify-self-end">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Bell className="h-5 w-5 text-brand-gray" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-teal text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="font-semibold text-brand-ink">Notificaciones</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-brand-teal hover:underline"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-brand-gray">
                No tienes notificaciones
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    !n.read ? "bg-brand-teal/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-brand-ink">
                      {n.title}
                    </span>
                    {!n.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-brand-teal" />
                    )}
                  </div>
                  <span className="text-xs text-brand-gray">{n.description}</span>
                  <span className="text-xs text-brand-gray">{n.createdAt}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
