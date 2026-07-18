import { db } from "../../instant";
import { Button } from "../components/Button";
import {
  IconBell,
  IconInbox,
  IconPackage,
  IconUser,
} from "@tabler/icons-react";
import { DialogTrigger } from "@react-spectrum/s2";
import { Popover } from "@react-spectrum/s2";
import { ThemeToggle } from "../components/ThemeToggle";
import { Outlet, useNavigate } from "react-router";
import { Tree, TreeItem } from "../components/Tree";

export const Dashboard = () => {
  const navigate = useNavigate();

  const { isLoading, error, data } = db.useQuery({
    shipments: {
      $: {
        order: {
          serverCreatedAt: "desc",
        },
      },
    },
  });

  if (isLoading) {
    return (
      <div className="w-8 h-8 border-4 border-spinner border-t-transparent rounded-full animate-spin my-auto"></div>
    );
  }

  if (error) {
    return (
      <div className="text-primary">
        An error occurred, please try again later
      </div>
    );
  }

  const { shipments } = data;

  return (
    <div className="flex flex-col md:flex-row w-full h-full bg-surface pt-3 pb-3 md:pb-8 px-3 md:pl-1 md:pr-3 gap-2 md:gap-0">
      {/* Mobile top bar */}
      <div className="flex md:hidden items-center justify-between w-full shrink-0">
        <img
          src="https://public.smtncargo.com/smtnlogo.jpg"
          className="w-9 h-9 object-contain object-top"
        />
        <div className="flex items-center gap-1">
          <Button
            variant="quiet"
            aria-label="Shipments"
            onPress={() => navigate("shipments")}
          >
            <IconPackage className="h-5 w-5" />
          </Button>
          <Button variant="quiet" aria-label="Inbox">
            <IconInbox className="h-5 w-5" />
          </Button>
          <Button variant="quiet" aria-label="Customers">
            <IconUser className="h-5 w-5" />
          </Button>
          <ThemeToggle />
          <DialogTrigger>
            <Button variant="quiet" aria-label="Notifications">
              <IconBell className="h-5 w-5 cursor-pointer text-primary hover:text-secondary transition-opacity" />
            </Button>
            <Popover UNSAFE_className="w-48 p-4 flex flex-col gap-4 bg-surface"></Popover>
          </DialogTrigger>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col h-full w-[max(15%,300px)] py-2 pr-1 gap-y-4">
        <div className="flex justify-between gap-4 min-h-11 w-full">
          <img
            src="https://public.smtncargo.com/smtnlogo.jpg"
            className="w-10 h-10 object-contain object-top ml-5"
          />
          <div className="flex gap-1 ">
            <ThemeToggle />
            <DialogTrigger>
              <Button variant="quiet">
                <IconBell className="h-5 w-5 cursor-pointer text-primary hover:text-secondary transition-opacity" />
              </Button>
              <Popover UNSAFE_className="w-48 p-4 flex flex-col gap-4 bg-surface"></Popover>
            </DialogTrigger>
          </div>
        </div>
        <div className="flex flex-col w-full">
          <Tree
            aria-label="Workspace"
            selectionMode="single"
            disallowEmptySelection
            defaultExpandedKeys={["shipments", "air"]}
            className="flex gap-y-1"
          >
            <TreeItem
              id="shipments"
              title="Shipments"
              icon={<IconPackage />}
              onPress={() => navigate("shipments")}
            />
            <TreeItem id="inbox" title="Inbox" icon={<IconInbox />} />
            <TreeItem id="customers" title="Customers" icon={<IconUser />} />
          </Tree>
        </div>
      </div>

      <div className="bg-border w-full md:w-[85%] flex-1 min-h-0 rounded-lg">
        <Outlet />
      </div>
    </div>
  );
};

export default Dashboard;
