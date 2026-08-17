import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { IconMenu2, IconX } from "@tabler/icons-react";

const PHONE_SMS = "sms:+16479526586";
const PHONE_TEL = "tel:+16479526586";

const CREAM = "#FAF9F6";
const INK = "#1A1A1A";
const NAVY = "#0B1D33";

const SERVICES = [
  {
    img: "/images/air-freight.png",
    alt: "Air cargo plane being loaded with packages",
    title: "Air Freight",
    desc: "Express air cargo from Canada and the USA to Nigeria, Ghana, and the UK in 3–5 business days, with customs handled on arrival.",
  },
  {
    img: "/images/ocean-freight.png",
    alt: "Shipping containers loaded onto cargo ship",
    title: "Ocean Freight",
    desc: "Cost-effective barrel and container shipping for household goods, vehicles, and commercial inventory on scheduled monthly sailings.",
  },
  {
    img: "/images/imessage-booking.png",
    alt: "Person booking a shipment via iMessage on phone",
    title: "Book by Text",
    desc: "Book, pay, and track shipments entirely over SMS or iMessage. Text us your pickup details and we handle the rest.",
  },
];

const PROCESS = [
  {
    title: "Request a quote",
    desc: "Call or text us with your route and weight for a confirmed rate.",
  },
  {
    title: "Drop off or schedule pickup",
    desc: "Bring your cargo to a hub or book a door pickup in the Toronto and Vancouver areas.",
  },
  {
    title: "We clear customs",
    desc: "Documentation, duties, and clearance are handled by our team at both ends.",
  },
  {
    title: "Track to delivery",
    desc: "Follow every milestone online until your consignee signs for the cargo.",
  },
];

const labelStyles = "text-[11px] font-medium uppercase tracking-[0.25em]";
const buttonStyles =
  "inline-block px-8 py-4 text-[11px] font-medium uppercase tracking-[0.25em] transition-colors cursor-pointer";

export const Index = () => {
  const navigate = useNavigate();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingNumber.trim()) return;
    const cleanId = trackingNumber.trim();
    if (cleanId.startsWith("ord-") || cleanId.length > 3) {
      navigate(`/track/${cleanId}`);
    } else {
      navigate("/dashboard");
    }
  };

  const scrollToSection = (id: string) => {
    setMobileNavOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const navLinks = [
    { id: "services", label: "Services" },
    { id: "process", label: "Process" },
    { id: "contact", label: "Contact" },
  ];

  return (
    <div
      className="min-h-screen w-full bg-white font-sans flex flex-col scroll-smooth"
      style={{ color: INK }}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-6 flex items-center justify-between gap-6">
          <Link to="/" className="text-base font-medium uppercase tracking-[0.3em] shrink-0">
            SMTN Cargo
          </Link>

          <nav className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollToSection(link.id)}
                className="text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-500 hover:text-[#0057B8] transition-colors cursor-pointer"
              >
                {link.label}
              </button>
            ))}
            <Link
              to="/orders"
              className="text-[11px] font-medium uppercase tracking-[0.25em] border border-[#0057B8] text-[#0057B8] px-5 py-2.5 hover:bg-[#0057B8] hover:text-white transition-colors"
            >
              Client Portal
            </Link>
          </nav>

          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden p-2 text-neutral-600 cursor-pointer"
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <IconX className="w-5 h-5" /> : <IconMenu2 className="w-5 h-5" />}
          </button>
        </div>

        {mobileNavOpen && (
          <nav className="md:hidden border-t border-neutral-200 bg-white px-6 py-4 flex flex-col">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollToSection(link.id)}
                className="py-3 text-left text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-600 border-b border-neutral-100 last:border-0"
              >
                {link.label}
              </button>
            ))}
            <Link
              to="/orders"
              className="py-3 text-[11px] font-medium uppercase tracking-[0.25em] text-[#0057B8]"
            >
              Client Portal
            </Link>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className="relative text-white">
        <img
          src="/images/hero-cargo.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative max-w-4xl mx-auto px-6 py-32 lg:py-44 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/70 mb-8">
            Canada · USA · UK · West Africa
          </p>
          <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.08] mb-8">
            Freight, forwarded with care.
          </h1>
          <p className="text-base sm:text-lg text-white/80 font-light max-w-xl mx-auto leading-relaxed mb-12">
            Air and ocean cargo between North America and West Africa — customs
            clearance, door-to-door delivery, and tracking on every shipment.
          </p>

          <form onSubmit={handleTrackSubmit} className="flex max-w-md mx-auto">
            <input
              type="text"
              placeholder="TRACKING NUMBER"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="flex-1 min-w-0 bg-white/95 px-5 py-4 text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-900 placeholder:text-neutral-400 outline-none"
            />
            <button
              type="submit"
              className={`${buttonStyles} bg-[#0057B8] text-white hover:bg-[#004A9E] shrink-0`}
            >
              Track
            </button>
          </form>
          <p className="mt-5 text-xs tracking-wider text-white/50">
            Sample:{" "}
            <button
              type="button"
              onClick={() => setTrackingNumber("ord-98241")}
              className="underline underline-offset-4 cursor-pointer hover:text-white transition-colors"
            >
              ord-98241
            </button>
          </p>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="py-24 lg:py-32">
        <div className="max-w-6xl mx-auto px-6 lg:px-10">
          <div className="text-center mb-16 lg:mb-20">
            <p className={`${labelStyles} text-[#0057B8] mb-5`}>Services</p>
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight">
              What we move
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14">
            {SERVICES.map((service) => (
              <div key={service.title} className="text-center">
                <img
                  src={service.img}
                  alt={service.alt}
                  className="w-full aspect-[4/3] object-cover mb-8"
                />
                <h3 className="font-serif text-2xl mb-4">{service.title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed font-light">
                  {service.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section id="process" className="py-24 lg:py-32" style={{ backgroundColor: CREAM }}>
        <div className="max-w-6xl mx-auto px-6 lg:px-10">
          <div className="text-center mb-16 lg:mb-20">
            <p className={`${labelStyles} text-[#0057B8] mb-5`}>Process</p>
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight">
              How it works
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-10">
            {PROCESS.map((step, i) => (
              <div key={step.title} className="text-center">
                <p className="font-serif text-3xl text-neutral-300 mb-5">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="text-[13px] font-medium uppercase tracking-[0.2em] mb-4">
                  {step.title}
                </h3>
                <p className="text-sm text-neutral-500 leading-relaxed font-light">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-24 lg:py-32 text-white" style={{ backgroundColor: NAVY }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-white/50 mb-5">
            Contact
          </p>
          <h2 className="font-serif text-4xl sm:text-5xl leading-tight mb-6">
            Ready to ship?
          </h2>
          <p className="text-base text-white/70 font-light leading-relaxed mb-12">
            Call or text us and get a confirmed booking in minutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a
              href={PHONE_TEL}
              className={`${buttonStyles} border border-white/40 text-white hover:bg-white hover:text-neutral-900`}
            >
              +1 (647) 952-6586
            </a>
            <a
              href={PHONE_SMS}
              className={`${buttonStyles} bg-[#0057B8] text-white hover:bg-[#004A9E]`}
            >
              Text Us
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-14 border-t border-neutral-200">
        <div className="max-w-6xl mx-auto px-6 flex flex-col items-center gap-6 text-center">
          <span className="text-sm font-medium uppercase tracking-[0.3em]">SMTN Cargo</span>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <button
              onClick={() => scrollToSection("services")}
              className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-500 hover:text-[#0057B8] transition-colors cursor-pointer"
            >
              Services
            </button>
            <button
              onClick={() => scrollToSection("process")}
              className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-500 hover:text-[#0057B8] transition-colors cursor-pointer"
            >
              Process
            </button>
            <Link
              to="/orders"
              className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-500 hover:text-[#0057B8] transition-colors"
            >
              Client Portal
            </Link>
            <a
              href={PHONE_TEL}
              className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-500 hover:text-[#0057B8] transition-colors"
            >
              +1 (647) 952-6586
            </a>
          </div>
          <p className="text-xs text-neutral-400 tracking-wide">
            © {new Date().getFullYear()} SMTN Cargo Express · Toronto · Vancouver · Lagos · London
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
