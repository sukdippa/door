"use client";

const NAV_LINKS = [
  { label: "About", active: true },
  { label: "Past Hackathons", active: false },
  { label: "FAQ", active: false },
  { label: "Contact", active: false },
];

const strokeIconProps = {
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  className: "h-6 w-6",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function LinkedInIcon() {
  return (
    <svg {...strokeIconProps}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg {...strokeIconProps}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg {...strokeIconProps}>
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}

export default function SiteNav() {
  return (
    <div
      className="glass-pill pointer-events-auto mx-auto flex w-full max-w-[1100px] items-center justify-between rounded-full px-[30px] py-[10px] font-redhat text-white"
      aria-label="Primary"
    >
      <a href="#" className="shrink-0" aria-label="UofTHacks home">
        <img src="/nav-logo.svg" alt="UofTHacks" className="h-11 w-auto" />
      </a>

      {NAV_LINKS.map((link) => (
        <a
          key={link.label}
          href="#"
          className={`hidden whitespace-nowrap text-xl tracking-[-1px] transition-opacity hover:opacity-80 md:block ${
            link.active ? "font-bold text-glow-white" : "font-normal"
          }`}
        >
          {link.label}
        </a>
      ))}

      <span className="hidden whitespace-nowrap text-xl md:block">UofTHacks 13</span>

      <span className="hidden h-[27px] w-px shrink-0 bg-white/40 md:block" aria-hidden="true" />

      <div className="flex shrink-0 items-center gap-[26px]">
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
