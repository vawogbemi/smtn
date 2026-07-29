import {
  IconMessageCircleFilled,
} from "@tabler/icons-react";
import { Link } from "react-router";

const PHONE_SMS = "sms:+16479526586";


export const Index = () => (
  <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0b0b0c]">
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-amber-700/20 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
    </div>

    <header className="relative z-10 flex items-center justify-between px-6 pt-6 md:px-10 md:pt-8">
      <div className="flex items-center gap-2">
        <img
          src="https://public.smtncargo.com/smtnlogo.jpg"
          alt="SMTN Cargo"
          className="h-8 w-8 rounded-lg object-contain object-top"
        />
        <span className="text-lg font-extrabold tracking-tight text-white">
          SMTN
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
        >
          Login
        </Link>
        <a
          href={PHONE_SMS}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
        >
          Get Started
        </a>
      </div>
    </header>

    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-6 py-8 md:flex-row md:justify-between md:gap-6 md:px-16">
      <div className="max-w-md text-center md:text-left">
        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
          Ship your cargo
          <br className="hidden md:block" /> on iMessage.
        </h1>
      </div>


      <div className="flex flex-col items-center gap-3 text-center md:items-end md:text-right">
        <a
          href={PHONE_SMS}
          className="flex items-center gap-2 rounded-full bg-[#34c759] px-5 py-3 font-semibold text-white shadow-lg shadow-black/30 transition-transform hover:scale-[1.02]"
        >
          <IconMessageCircleFilled className="h-5 w-5" />
          Ready to ship?
        </a>
      </div>
    </div>
  </div>
);

export default Index;
