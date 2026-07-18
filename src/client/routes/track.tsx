import { Form } from "@react-spectrum/s2";
import { ListBox, ListBoxItem } from "../components/ListBox";
import { Button } from "../components/Button";
import { PlacesTextField } from "../components/PlacesTextField";
import { FormEvent, useRef, useState } from "react";
import { newHttpBatchRpcSession, RpcStub } from "capnweb";
import { useNavigate, useParams } from "react-router";
import { db } from "../../instant";
import {
  IconCircleFilled,
  IconHistory,
  IconMapPin,
  IconSquareFilled,
} from "@tabler/icons-react";

interface PlaceSuggestion {
  description: string;
  placeId: string;
  structuredFormatting: {
    mainText: string;
    secondaryText: string;
    mainTextMatchedSubstrings: { length: number; offset: number }[];
  };
  type?: "recent" | "place";
}

interface Package {
  weight: number;
  length: number;
  width: number;
  height: number;
}

interface ShippingProduct {
  id: string;
  name: string;
  provider: string;
  amount: number;
  currency: string;
  estimatedDays?: number;
  distanceText?: string;
  durationText?: string;
  providerImage75?: string;
  providerImage200?: string;
}

interface API {
  submit(formData: any): Promise<string>;
  getPlaceSuggestions(input: string): Promise<PlaceSuggestion[]>;
  getProducts(
    place: PlaceSuggestion,
    office: PlaceSuggestion,
    packages: Package[],
  ): Promise<ShippingProduct[]>;
}

export const Track = () => {
  const navigate = useNavigate();
  const params = useParams();

  const [addressInput, setAddressInput] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<
    PlaceSuggestion[]
  >([]);
  const [deliveryAddress, setDeliveryAddress] =
    useState<PlaceSuggestion | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingProduct[]>([]);
  const [selectedOption, setSelectedOption] = useState<ShippingProduct | null>(
    null,
  );
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isLoading, error, data } = db.useQuery({
    orders: {
      $: { where: { id: params.orderId } },
    },
  });

  const order = data?.orders?.[0];

  const handleAddressChange = (value: string) => {
    setAddressInput(value);
    setDeliveryAddress(null);
    setShippingOptions([]);
    setSelectedOption(null);
    setIsLoadingProducts(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setAddressSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const api: RpcStub<API> = newHttpBatchRpcSession(
          "https://api.smtncargo.com/rpc",
        );
        setAddressSuggestions(await api.getPlaceSuggestions(value));
        console.log(addressSuggestions);
      } catch (error) {
        console.error("API error:", error);
        setAddressSuggestions([]);
      }
    }, 50);
  };

  const handleSelectAddress = async (key: React.Key) => {
    const selected = addressSuggestions.find((s) => s.placeId === key);
    if (!selected) return;

    setDeliveryAddress(selected);
    setAddressInput(
      selected.structuredFormatting?.mainText ?? selected.description,
    );
    setAddressSuggestions([]);
    setIsLoadingProducts(true);

    try {
      const api: RpcStub<API> = newHttpBatchRpcSession(
        "https://api.smtncargo.com/rpc",
      );
      const results = await api.getProducts(
        {
          description:
            "SMTN International Inc., Bath Road, Mississauga, ON, Canada",
          placeId: "ChIJR3npTgU7K4gRruYu9q9H9oY",
          structuredFormatting: {
            mainText: "SMTN International Inc.",
            secondaryText: "Bath Road, Mississauga, ON, Canada",
            mainTextMatchedSubstrings: [{ length: 10, offset: 0 }],
          },
        },
        selected,
        [
          { length: 16, width: 24, height: 33, weight: 20 },
          { length: 16, width: 24, height: 33, weight: 20 },
          { length: 16, width: 24, height: 33, weight: 20 },
        ],
      );
      console.log(results);
      setShippingOptions(results ?? []);
      setSelectedOption(results?.[0] ?? null);
    } catch (error) {
      console.error("API error:", error);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = Object.fromEntries(
      new FormData(event.target as HTMLFormElement) as any,
    );
    try {
      const api: RpcStub<API> = newHttpBatchRpcSession(
        "https://api.smtncargo.com/rpc",
      );
      const checkoutLink = await api.submit(formData);
      // navigate(checkoutLink);
    } catch (error) {
      console.error("API error:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="w-8 h-8 border-4 border-spinner border-t-transparent rounded-full animate-spin my-auto" />
    );
  }

  if (error) {
    return (
      <div className="text-primary">
        An error occurred, please try again later
      </div>
    );
  }

  return (
    <Form
      UNSAFE_className="w-[min(95vw,750px)] mx-auto flex flex-col gap-4 items-center"
      onSubmit={onSubmit}
    >
      <img
        src="https://public.smtncargo.com/logo.png"
        className="w-24 h-24 object-contain object-top"
      />

      <PlacesTextField
        name="from"
        className="w-full"
        label="From"
        icon={<IconCircleFilled className="text-primary" />}
        isDisabled
      />

      <PlacesTextField
        name="to"
        label="Deliver To"
        icon={<IconSquareFilled className="text-primary" />}
        className="w-full"
        value={addressInput}
        onChange={handleAddressChange}
        autoFocus
      />

      <input
        type="hidden"
        name="address"
        value={JSON.stringify(deliveryAddress)}
      />

      {addressSuggestions.length > 0 && (
        <ListBox
          aria-label="Address suggestions"
          selectionMode="single"
          items={addressSuggestions.map((s) => ({ ...s, id: s.placeId }))}
          onAction={handleSelectAddress}
        >
          {(suggestion) => (
            <ListBoxItem
              id={suggestion.id}
              textValue={suggestion.structuredFormatting?.mainText}
            >
              <div className="w-full px-6 flex flex-row items-center justify-start gap-3">
                {suggestion.type === "recent" ? (
                  <IconHistory />
                ) : (
                  <IconMapPin />
                )}
                <div className="flex flex-col items-start">
                  <span className="font-semibold text-text-primary text-sm md:text-base">
                    {suggestion.structuredFormatting.mainText}
                  </span>
                  <span className="text-text-muted text-sm md:text-md">
                    {suggestion.structuredFormatting.secondaryText}
                  </span>
                </div>
              </div>
            </ListBoxItem>
          )}
        </ListBox>
      )}

      <input
        type="hidden"
        name="product"
        value={JSON.stringify(selectedOption)}
      />

      {isLoadingProducts && (
        <div className="w-full flex flex-col gap-2 py-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-full h-13 rounded-lg bg-surface-alt animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoadingProducts &&
        deliveryAddress &&
        shippingOptions.length === 0 && (
          <p className="text-primary">No couriers found</p>
        )}

      {!isLoadingProducts && shippingOptions.length > 0 && (
        <ListBox
          aria-label="Shipping products"
          selectionMode="single"
          disallowEmptySelection
          items={shippingOptions}
          selectedKeys={
            selectedOption ? new Set([selectedOption.id]) : new Set()
          }
          onSelectionChange={(keys) => {
            if (keys === "all") return;
            const key = [...keys][0];
            if (key == null) return; // belt-and-suspenders
            setSelectedOption(
              shippingOptions.find((p) => p.id === String(key)) ?? null,
            );
          }}
        >
          {(product) => (
            <ListBoxItem id={product.id} textValue={product.name}>
              <div className="w-full px-2 flex flex-row items-center justify-start gap-3">
                <img
                  src={product.providerImage200}
                  className="w-8 h-8 object-contain"
                />
                <div className="flex flex-col items-start flex-1">
                  <span className="font-semibold text-text-primary text-sm md:text-md">
                    {`${product.provider} ${product.name}`}
                  </span>
                  <span className="text-text-muted text-sm md:text-md">
                    {product.estimatedDays != null
                      ? `${product.estimatedDays} day${
                          product.estimatedDays !== 1 ? "s" : ""
                        }`
                      : product.durationText}
                  </span>
                </div>
                <span className="font-semibold text-text-primary ml-auto text-sm md:text-md">
                  {(product.amount / 100).toFixed(2)} {product.currency}
                </span>
              </div>
            </ListBoxItem>
          )}
        </ListBox>
      )}

      {shippingOptions.length > 0 && deliveryAddress && (
        <div className="sticky bottom-0 z-50 bg-surface p-4 w-full">
          <Button
            type="submit"
            className="w-full text-white min-h-15 font-bold"
            variant="primary"
          >
            {`${selectedOption?.provider} ${selectedOption?.name}`}
          </Button>
        </div>
      )}
    </Form>
  );
};

export default Track;
