import {
  IconChevronDown,
  IconClipboardList,
  IconCreditCard,
  IconDots,
  IconEdit,
  IconFileImport,
  IconHelp,
  IconInbox,
  IconMapPin,
  IconPackage,
  IconSearch,
  IconTruck,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { ThemeToggle } from "./ThemeToggle";

type IconType = ComponentType<{ className?: string; stroke?: number }>;

function IconButton(
  { icon: Icon, label, onClick }: {
    icon: IconType;
    label: string;
    onClick?: () => void;
  },
) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-hover hover:text-text-primary"
    >
      <Icon className="h-4 w-4" stroke={1.75} />
    </button>
  );
}

function NavItem(
  { icon: Icon, label, active = false, indent = false, onClick }: {
    icon: IconType;
    label: string;
    active?: boolean;
    indent?: boolean;
    onClick?: () => void;
  },
) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-7 w-full items-center gap-2 rounded-md text-sm transition-colors",
        indent ? "pl-8 pr-2" : "px-2",
        active
          ? "bg-hover font-medium text-text-primary"
          : "text-text-secondary hover:bg-hover",
      ].join(" ")}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-text-muted"}`}
        stroke={1.75}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-0.5 mt-5 flex items-center gap-1 px-2 text-xs font-medium text-text-muted">
      <span>{label}</span>
      <IconChevronDown className="h-3 w-3" />
    </div>
  );
}

export function Sidebar({ onNewShipment }: { onNewShipment?: () => void }) {
  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col border-r border-border bg-surface-alt md:flex">
      {/* Workspace header */}
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-white">
          SM
        </div>
        <span className="truncate text-sm font-semibold text-text-primary">
          smtn
        </span>
        <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton icon={IconSearch} label="Search" />
          <IconButton
            icon={IconEdit}
            label="New shipment"
            onClick={onNewShipment}
          />
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <NavItem icon={IconInbox} label="Inbox" active />
        <NavItem icon={IconTruck} label="My shipments" />

        <SectionHeader label="Workspace" />
        <NavItem icon={IconClipboardList} label="Orders" />
        <NavItem icon={IconMapPin} label="Tracking" />
        <NavItem icon={IconDots} label="More" />

        <SectionHeader label="Your teams" />
        <button
          type="button"
          className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-text-secondary transition-colors hover:bg-hover"
        >
          <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/15 text-[9px] font-semibold text-primary">
            SM
          </span>
          <span className="truncate font-medium text-text-primary">
            SMTN Cargo
          </span>
        </button>
        <NavItem icon={IconPackage} label="Shipments" indent />
        <NavItem icon={IconClipboardList} label="Orders" indent />
        <NavItem icon={IconUsers} label="Customers" indent />

        <SectionHeader label="Try" />
        <NavItem icon={IconFileImport} label="Import data" />
        <NavItem icon={IconUserPlus} label="Invite people" />
        <NavItem icon={IconCreditCard} label="Connect Stripe" />
      </nav>

      {/* Footer */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border px-3">
        <IconButton icon={IconHelp} label="Help" />
        <span className="text-xs text-text-muted">Free plan</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
