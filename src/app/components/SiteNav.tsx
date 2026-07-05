"use client";

const NAV_LINKS = [
  { label: "About", active: true },
  { label: "Past Hackathons", active: false },
  { label: "FAQ", active: false },
  { label: "Contact", active: false },
];

const brandIconProps = {
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  className: "h-5 w-5",
  fill: "currentColor",
};

function LinkedInIcon() {
  return (
    <svg {...brandIconProps}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg {...brandIconProps}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.332.014 7.052.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg {...brandIconProps}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

export default function SiteNav() {
  return (
    <div
      className="glass-pill pointer-events-auto mx-auto flex w-full max-w-275 items-center justify-between rounded-full px-7.5 py-1.5 font-redhat text-white"
      aria-label="Primary"
    >
      <a href="#" className="shrink-0" aria-label="UofTHacks home">
        <img src="/nav-logo.svg" alt="UofTHacks" className="h-7 w-auto" />
      </a>

      {NAV_LINKS.map((link) => (
        <a
          key={link.label}
          href="#"
          className={`hidden whitespace-nowrap text-lg tracking-[-1px] transition-opacity hover:opacity-80 md:block ${
            link.active ? "font-bold text-glow-white" : "font-normal"
          }`}
        >
          {link.label}
        </a>
      ))}

      <span className="hidden whitespace-nowrap md:block">UofTHacks 13</span>

      <span className="hidden h-6 w-px shrink-0 bg-white/40 md:block" aria-hidden="true" />

      <div className="flex shrink-0 items-center gap-5">
        <a href="#" aria-label="LinkedIn" className="transition-opacity hover:opacity-80">
          <LinkedInIcon />
        </a>
        <a href="#" aria-label="Instagram" className="transition-opacity hover:opacity-80">
          <InstagramIcon />
        </a>
        <a href="#" aria-label="X" className="transition-opacity hover:opacity-80">
          <XIcon />
        </a>
      </div>
    </div>
  );
}
