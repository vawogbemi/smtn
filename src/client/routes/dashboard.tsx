import { Button } from "../components/Button";
import { IconBell, IconInbox, IconPackage } from "@tabler/icons-react";
import { DialogTrigger } from "@react-spectrum/s2";
import { Popover } from "@react-spectrum/s2";
import { ThemeToggle } from "../components/ThemeToggle";
import { Outlet, useNavigate } from "react-router";
import { OrganizationSwitcher, UserButton } from "@clerk/clerk-react";
import type { ReactNode } from "react";

export const Dashboard = ({
  hideHeader = false,
  children,
}: {
  hideHeader?: boolean;
  children?: ReactNode;
}) => {
  const navigate = useNavigate();

  return (
    <div
      className={`flex h-full w-full flex-col ${
        hideHeader ? "" : "gap-2 bg-surface px-3 pb-3 pt-3"
      }`}
    >
      {!hideHeader && <div className="flex items-center justify-between w-full shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="https://public.smtncargo.com/smtnlogo.jpg"
            className="w-9 h-9 object-contain object-top shrink-0"
          />
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/shipments"
            afterCreateOrganizationUrl="/shipments"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="quiet"
            aria-label="Shipments"
            onPress={() => navigate("/shipments")}
          >
            <IconPackage className="h-5 w-5" />
          </Button>
          <Button
            variant="quiet"
            aria-label="Orders"
            onPress={() => navigate("/dashboard/orders")}
          >
            <IconInbox className="h-5 w-5" />
          </Button>
          <ThemeToggle />
          <DialogTrigger>
            <Button variant="quiet" aria-label="Notifications">
              <IconBell className="h-5 w-5 cursor-pointer text-primary hover:text-secondary transition-opacity" />
            </Button>
            <Popover UNSAFE_className="w-48 p-4 flex flex-col gap-4 bg-surface"></Popover>
          </DialogTrigger>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>}

      <div className="w-full flex-1 min-h-0">
        {children ?? <Outlet />}
      </div>
    </div>
  );
};

export default Dashboard;
