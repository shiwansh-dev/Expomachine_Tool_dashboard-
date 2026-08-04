"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navigationItems = [
  { href: "/", label: "Live Status" },
  { href: "/reports", label: "Reports" },
  { href: "/compute-shift", label: "Compute Shift" },
  { href: "/sql-docs", label: "SQL Docs" },
  { href: "/thresholds", label: "Thresholds" },
  { href: "/status", label: "Status & Logs" },
  { href: "/settings", label: "Settings" }
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/mqtt/start", { method: "POST" }).catch(() => {
      // Status and logs expose startup errors; this keeps navigation non-blocking.
    });
    fetch("/api/shift-compute/start", { method: "POST" }).catch(() => {
      // Compute Shift page exposes worker errors; this keeps navigation non-blocking.
    });
  }, []);

  return (
    <>
      <button
        type="button"
        className="burger-button"
        aria-label="Open navigation"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>

      {isOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <aside className={`app-sidebar${isOpen ? " is-open" : ""}`} aria-hidden={!isOpen}>
        <div className="sidebar-header">
          <div>
            <span className="sidebar-eyebrow">Factory Genie</span>
            <h2>Pages</h2>
          </div>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={() => setIsOpen(false)}
          >
            ×
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigationItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" || pathname === "/live-status" : pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? "sidebar-link is-active" : "sidebar-link"}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {children}
    </>
  );
}
