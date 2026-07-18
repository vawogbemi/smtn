import { Form, TextArea } from "@react-spectrum/s2";
import {
    IconCircleFilled,
    IconSquareFilled,
} from "@tabler/icons-react";
import { newHttpBatchRpcSession, RpcStub } from "capnweb";
import { useState } from "react";
import {
    useNavigate,
    useParams,
} from "react-router";
import { db } from "../../instant";
import { Button } from "../components/Button";
import { PackageField } from "../components/PackageField";
import { PlacesTextField } from "../components/PlacesTextField";
import { Tab, TabList, Tabs } from "../components/Tabs";
import { Spinner } from "../components/misc";

interface API {
  submit(data: any): Promise<string>;
}

export const Index = () => {
  const navigate = useNavigate();

  const [product, setProduct] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    from: "",
    to: "",
    description: "",
    package: "",
    product: "",
  });

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  return (
    <Form
      UNSAFE_className="h-full w-full flex flex-col items-center py-8 px-4 bg-surface"
      onSubmit={async (event) => {
        event.preventDefault();
        /*const formData = new FormData(event.target as HTMLFormElement);
        const data = Object.fromEntries(formData.entries());
        console.log(data);*/
        return;
        try {
          const api: RpcStub<API> = newHttpBatchRpcSession(
            "https://api.smtncargo.com/rpc",
          );
          const checkoutLink = await api.submit(formData);
          navigate(checkoutLink);
        } catch (error) {
          console.error("API error:", error);
        }
      }}
    >
      <img
        src="https://public.smtncargo.com/logo.png"
        className="w-24 h-24 object-contain object-top"
      />
      {
        /*<TextField
        label="Name (Optional)"
        value={formData.name}
        onChange={(v) => update("name", v)}
        className="w-full"
      />*/
      }
      <PlacesTextField
        label="From"
        icon={<IconCircleFilled className="text-primary" />}
        onChange={(v) => update("from", v)}
        value={formData.from}
        className="w-full"
      />
      <PlacesTextField
        label="To"
        icon={<IconSquareFilled className="text-primary" />}
        value={formData.to}
        onChange={(v) => update("to", v)}
        className="w-full"
      />

      <TextArea
        label="Description"
        name="description"
        value={formData.description}
        onChange={(v) => update("description", v)}
      />
      <PackageField />
      <Tabs
        selectedKey={product}
        onSelectionChange={(key) => setProduct(String(key))}
        orientation="vertical"
      >
        <TabList aria-label="Product">
          <Tab id="air">
            <div className="flex flex-row items-center justify-center gap-3">
              <img
                src="https://public.airtoronto.ca/air.png"
                alt="airplane-front-view"
                className="w-10 h-10 shrink-0"
              />
              <div className="flex flex-col items-start">
                <span className="font-semibold text-text-primary text-md">
                  Air
                </span>
                <span className="text-text-muted">5-10 days</span>
              </div>
            </div>
          </Tab>
          <Tab id="freight">
            <div className="flex flex-row items-center gap-3">
              <img
                src="https://public.airtoronto.ca/freight.png"
                alt="water-transportation"
                className="w-10 h-10 shrink-0"
              />
              <div className="flex flex-col items-start">
                <span className="font-semibold text-text-primary text-md">
                  Freight
                </span>
                <span className="text-text-muted">2 months</span>
              </div>
            </div>
          </Tab>
          <Tab id="x">
            <div className="flex flex-row items-center gap-3">
              <img
                src="https://public.airtoronto.ca/x.png"
                alt="tesla-front-view"
                className="w-9 h-9 shrink-0"
              />
              <div className="flex flex-col items-start">
                <span className="font-semibold text-text-primary text-md">
                  X
                </span>
                <span className="text-text-muted">1-2 days</span>
              </div>
            </div>
          </Tab>
        </TabList>
      </Tabs>
      <Button
        type="submit"
        variant="primary"
        className="w-full text-white min-h-15"
      >
        Submit
      </Button>
    </Form>
  );
};

export default Index;