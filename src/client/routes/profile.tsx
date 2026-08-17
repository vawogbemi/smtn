import { Form } from "@react-spectrum/s2";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ListBox, ListBoxItem } from "../components/ListBox";
import { Button } from "../components/Button";
import { PlacesTextField } from "../components/PlacesTextField";
import { publicApi } from "../data";
import { IconCircleCheck, IconMapPin } from "@tabler/icons-react";
import type { CustomerProfileView, PlaceView } from "../../tenant";
import type { PlaceSuggestion } from "../../rpc";

// The profile form: how a customer with no account fills in the details Dara
// or an operator can't get from an SMS alone -- name, email, a delivery
// address. Reached only through a signed link (see profile.ts); no session.

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "form"; profile: CustomerProfileView }
  | { status: "submitted"; profile: CustomerProfileView };

const ProfileForm = ({
  customerId,
  token,
}: {
  customerId: string;
  token: string;
}) => {
  const [state, setState] = useState<State>({ status: "loading" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [address, setAddress] = useState<PlaceView | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    publicApi()
      .getProfile(customerId, token)
      .then((profile) => {
        if (cancelled) return;
        setName(profile.name ?? "");
        setEmail(profile.email ?? "");
        setAddress(profile.address);
        setAddressInput(profile.address?.description ?? "");
        // Already onboarded: show the thank-you screen instead of an empty
        // form -- a customer who taps the link twice shouldn't have to
        // wonder whether they need to fill it in again.
        setState(
          profile.onboardedAt
            ? { status: "submitted", profile }
            : { status: "form", profile },
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, token]);

  const handleAddressChange = (value: string) => {
    setAddressInput(value);
    setAddress(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setSuggestions(await publicApi().getPlaceSuggestions(value));
      } catch {
        setSuggestions([]);
      }
    }, 200);
  };

  const handleSelectAddress = (key: React.Key) => {
    const selected = suggestions.find((s) => s.placeId === key);
    if (!selected) return;
    setAddress({ description: selected.description, placeId: selected.placeId });
    setAddressInput(
      selected.structuredFormatting?.mainText ?? selected.description,
    );
    setSuggestions([]);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const profile = await publicApi().submitProfile(customerId, token, {
        name: name.trim(),
        email: email.trim() || null,
        address,
      });
      setState({ status: "submitted", profile });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === "loading") {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex w-full h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <p className="font-semibold text-text-primary">Can't open this form</p>
          <p className="text-sm text-text-secondary">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === "submitted") {
    const firstName = state.profile.name?.split(" ")[0];
    return (
      <div className="flex w-full h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <IconCircleCheck className="text-primary" size={28} />
          </div>
          <p className="font-semibold text-lg text-text-primary">
            Thanks{firstName ? `, ${firstName}` : ""}!
          </p>
          <p className="text-sm text-text-secondary">
            Your details are saved.
            {state.profile.phone
              ? ` We'll text you at ${state.profile.phone} with updates.`
              : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Form
      UNSAFE_className="w-[min(95vw,480px)] mx-auto flex flex-col gap-4 items-center py-10"
      onSubmit={onSubmit}
    >
      <img
        src="https://public.smtncargo.com/logo.png"
        className="w-20 h-20 object-contain object-top"
      />
      <div className="text-center">
        <h1 className="text-lg font-semibold text-text-primary">
          A few details for us
        </h1>
        <p className="text-sm text-text-secondary">
          So we can reach you and clear your shipment faster.
        </p>
      </div>

      <PlacesTextField
        label="Full name"
        className="w-full"
        value={name}
        onChange={setName}
        isRequired
        autoFocus
      />

      <PlacesTextField
        label="Email (optional)"
        type="email"
        className="w-full"
        value={email}
        onChange={setEmail}
      />

      <PlacesTextField
        label="Phone"
        className="w-full"
        value={state.profile.phone ?? ""}
        isDisabled
      />

      <PlacesTextField
        label="Delivery address (optional)"
        icon={<IconMapPin className="text-primary" />}
        className="w-full"
        value={addressInput}
        onChange={handleAddressChange}
      />

      {suggestions.length > 0 && (
        <ListBox
          aria-label="Address suggestions"
          selectionMode="single"
          items={suggestions.map((s) => ({ ...s, id: s.placeId }))}
          onAction={handleSelectAddress}
        >
          {(suggestion) => (
            <ListBoxItem
              id={suggestion.id}
              textValue={suggestion.structuredFormatting?.mainText}
            >
              <div className="w-full px-6 flex flex-row items-center justify-start gap-3">
                <IconMapPin />
                <div className="flex flex-col items-start">
                  <span className="font-semibold text-text-primary text-sm">
                    {suggestion.structuredFormatting.mainText}
                  </span>
                  <span className="text-text-muted text-sm">
                    {suggestion.structuredFormatting.secondaryText}
                  </span>
                </div>
              </div>
            </ListBoxItem>
          )}
        </ListBox>
      )}

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button
        type="submit"
        variant="primary"
        className="w-full min-h-11 font-bold"
        isDisabled={submitting || !name.trim()}
      >
        {submitting ? "Saving..." : "Save my details"}
      </Button>
    </Form>
  );
};

// The route's entry point. c (customerId) and t (token) both come from the
// link Dara or an operator sent -- missing either means a broken/incomplete
// link rather than an in-app state to recover from.
export const Profile = () => {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("c");
  const token = searchParams.get("t");

  if (!customerId || !token) {
    return (
      <div className="flex w-full h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-text-secondary">
          This link is missing its id or token.
        </p>
      </div>
    );
  }

  return <ProfileForm customerId={customerId} token={token} />;
};

export default Profile;
