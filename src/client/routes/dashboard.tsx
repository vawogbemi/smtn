import { Button } from "../components/Button";
import { IconBell, IconInbox } from "@tabler/icons-react";
import { DialogTrigger } from "@react-spectrum/s2";
import { Popover } from "@react-spectrum/s2";
import { ThemeToggle } from "../components/ThemeToggle";
import { Outlet, useNavigate } from "react-router";
import { OrganizationSwitcher, UserButton } from "@clerk/clerk-react";

export const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col w-full h-full bg-surface pt-3 pb-3 px-3 gap-2">
      <div className="flex items-center justify-between w-full shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="https://public.smtncargo.com/smtnlogo.jpg"
            className="w-9 h-9 object-contain object-top shrink-0"
          />
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="quiet"
            aria-label="Orders"
            onPress={() => navigate("/orders")}
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
      </div>

      <div className="w-full flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
};

export default Dashboard;
