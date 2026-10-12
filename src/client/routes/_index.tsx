import { SignIn, useAuth } from "@clerk/clerk-react";
import { Link } from "react-router";
import LandingUpload from "../components/LandingUpload";

export const Index = () => {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f6f2] font-sans text-[#282724]">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-sm font-semibold tracking-tight"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[#d97757]" />
          SMTN
        </Link>
        {isSignedIn && (
          <Link
            to="/shipments"
            className="rounded-full px-4 py-2 text-sm text-[#686761] transition hover:bg-black/5 hover:text-[#282724]"
          >
            Open shipments
          </Link>
        )}
      </header>

      <section className="flex flex-1 flex-col items-center px-4 pb-8 pt-[4vh] sm:px-8 sm:pt-[5vh]">
        <div className="flex w-full max-w-6xl flex-1 flex-col items-center text-center">
          <p className="text-sm text-[#77756e] [@media(max-height:700px)]:text-xs">
            A calmer way to keep customers updated
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.035em] sm:text-[2.65rem] [@media(max-height:700px)]:text-2xl sm:[@media(max-height:700px)]:text-[2.35rem]">
            What are we shipping today?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#77756e] sm:text-base [@media(max-height:700px)]:text-xs [@media(max-height:700px)]:leading-5 sm:[@media(max-height:700px)]:text-sm">
            {isSignedIn
              ? "Upload a shipment file to organize packages and start customer updates."
              : "Sign in to upload shipment files, organize packages, and keep customers updated."}
          </p>

          <div className="mt-8 flex w-full flex-1 items-center justify-center text-left">
            {isLoaded
              ? isSignedIn
                ? <LandingUpload />
                : (
                  <div className="w-full max-w-md">
                    <SignIn
                      routing="hash"
                      forceRedirectUrl="/shipments"
                      signUpForceRedirectUrl="/shipments"
                    />
                  </div>
                )
              : <div className="h-64 w-full max-w-md animate-pulse rounded-3xl bg-white/70" />}
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-center gap-5 px-5 py-5 text-xs text-[#929087]">
        <span>Smtn © 2026</span>
      </footer>
    </main>
  );
};

export default Index;
