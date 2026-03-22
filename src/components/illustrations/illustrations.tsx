// All 25 topic SVG illustrations for VizBrief node cards
// viewBox="0 0 160 90", width="140" height="80"
// Design: dark indigo brand — transparent bg, renders on dark cards

export function GrowthIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      <line x1="20" y1="75" x2="140" y2="75" stroke="rgba(99,102,241,0.15)" strokeWidth="0.5"/>
      <line x1="20" y1="55" x2="140" y2="55" stroke="rgba(99,102,241,0.1)" strokeWidth="0.5"/>
      <line x1="20" y1="35" x2="140" y2="35" stroke="rgba(99,102,241,0.08)" strokeWidth="0.5"/>
      <path d="M25 70 Q45 68 55 60 Q65 52 75 35 Q85 18 100 12 L130 10"
            stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M25 70 Q45 68 55 60 Q65 52 75 35 Q85 18 100 12 L130 10 L130 75 L25 75 Z"
            fill="url(#growthGrad)" opacity="0.3"/>
      <circle cx="75" cy="35" r="3" fill="#818cf8"/>
      <circle cx="75" cy="35" r="6" fill="rgba(99,102,241,0.2)"/>
      <defs>
        <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LeadershipIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Root node */}
      <circle cx="80" cy="18" r="9" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.15)"/>
      {/* Connector lines */}
      <line x1="80" y1="27" x2="45" y2="55" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      <line x1="80" y1="27" x2="80" y2="55" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      <line x1="80" y1="27" x2="115" y2="55" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      {/* Level 2 nodes */}
      <circle cx="45" cy="63" r="7" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      <circle cx="80" cy="63" r="7" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      <circle cx="115" cy="63" r="7" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      {/* Level 3 connectors + small nodes */}
      <line x1="45" y1="70" x2="32" y2="82" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75"/>
      <line x1="45" y1="70" x2="58" y2="82" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75"/>
      <circle cx="32" cy="84" r="4" stroke="#a5b4fc" strokeWidth="1" fill="rgba(165,180,252,0.08)"/>
      <circle cx="58" cy="84" r="4" stroke="#a5b4fc" strokeWidth="1" fill="rgba(165,180,252,0.08)"/>
    </svg>
  );
}

export function StrategyIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Compass circle */}
      <circle cx="80" cy="45" r="30" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <circle cx="80" cy="45" r="20" stroke="rgba(99,102,241,0.15)" strokeWidth="0.5"/>
      {/* Cardinal lines */}
      <line x1="80" y1="15" x2="80" y2="75" stroke="rgba(99,102,241,0.2)" strokeWidth="0.5"/>
      <line x1="50" y1="45" x2="110" y2="45" stroke="rgba(99,102,241,0.2)" strokeWidth="0.5"/>
      {/* North needle — main direction */}
      <path d="M80 45 L74 55 L80 18 L86 55 Z" fill="url(#strategyGrad)" opacity="0.9"/>
      {/* South needle */}
      <path d="M80 45 L76 38 L80 72 L84 38 Z" fill="rgba(99,102,241,0.2)"/>
      {/* Center dot */}
      <circle cx="80" cy="45" r="3" fill="#6366f1"/>
      <defs>
        <linearGradient id="strategyGrad" x1="80" y1="18" x2="80" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#818cf8"/>
          <stop offset="100%" stopColor="#6366f1"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function DesignIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Bezier curve */}
      <path d="M25 70 C40 70 55 20 80 20 C105 20 120 70 135 70"
            stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Control point handles */}
      <line x1="25" y1="70" x2="40" y2="70" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      <line x1="55" y1="20" x2="40" y2="70" stroke="rgba(99,102,241,0.3)" strokeWidth="0.75" strokeDasharray="3 2"/>
      <line x1="105" y1="20" x2="120" y2="70" stroke="rgba(99,102,241,0.3)" strokeWidth="0.75" strokeDasharray="3 2"/>
      <line x1="135" y1="70" x2="120" y2="70" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      {/* Anchor points */}
      <rect x="22" y="67" width="6" height="6" rx="1" fill="#6366f1"/>
      <rect x="132" y="67" width="6" height="6" rx="1" fill="#6366f1"/>
      {/* Control handles */}
      <circle cx="40" cy="70" r="3.5" stroke="#818cf8" strokeWidth="1.2" fill="rgba(129,140,248,0.2)"/>
      <circle cx="120" cy="70" r="3.5" stroke="#818cf8" strokeWidth="1.2" fill="rgba(129,140,248,0.2)"/>
      {/* Mid anchor */}
      <rect x="77" y="17" width="6" height="6" rx="1" fill="#a5b4fc"/>
    </svg>
  );
}

export function ProductManagementIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Kanban column headers */}
      <rect x="18" y="12" width="36" height="8" rx="2" fill="rgba(99,102,241,0.2)"/>
      <rect x="62" y="12" width="36" height="8" rx="2" fill="rgba(99,102,241,0.2)"/>
      <rect x="106" y="12" width="36" height="8" rx="2" fill="rgba(99,102,241,0.2)"/>
      {/* Cards in "To Do" */}
      <rect x="18" y="25" width="36" height="16" rx="2" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.08)"/>
      <rect x="18" y="45" width="36" height="16" rx="2" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.08)"/>
      <rect x="18" y="65" width="36" height="16" rx="2" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.08)"/>
      {/* Cards in "In Progress" — highlighted */}
      <rect x="62" y="25" width="36" height="16" rx="2" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.15)"/>
      <rect x="62" y="45" width="36" height="16" rx="2" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.15)"/>
      {/* Cards in "Done" */}
      <rect x="106" y="25" width="36" height="16" rx="2" stroke="rgba(99,102,241,0.4)" strokeWidth="1" fill="rgba(99,102,241,0.05)"/>
      {/* Card lines (content) */}
      <line x1="22" y1="31" x2="48" y2="31" stroke="rgba(99,102,241,0.3)" strokeWidth="0.75"/>
      <line x1="22" y1="34" x2="42" y2="34" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <line x1="66" y1="31" x2="92" y2="31" stroke="rgba(129,140,248,0.5)" strokeWidth="0.75"/>
      <line x1="66" y1="34" x2="86" y2="34" stroke="rgba(129,140,248,0.3)" strokeWidth="0.75"/>
    </svg>
  );
}

export function EngineeringIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Service boxes */}
      <rect x="15" y="35" width="30" height="20" rx="3" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.1)"/>
      <rect x="65" y="15" width="30" height="20" rx="3" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      <rect x="65" y="55" width="30" height="20" rx="3" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      <rect x="115" y="35" width="30" height="20" rx="3" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.1)"/>
      {/* Connection lines */}
      <line x1="45" y1="45" x2="65" y2="25" stroke="rgba(99,102,241,0.5)" strokeWidth="1.2"/>
      <line x1="45" y1="45" x2="65" y2="65" stroke="rgba(99,102,241,0.5)" strokeWidth="1.2"/>
      <line x1="95" y1="25" x2="115" y2="45" stroke="rgba(99,102,241,0.5)" strokeWidth="1.2"/>
      <line x1="95" y1="65" x2="115" y2="45" stroke="rgba(99,102,241,0.5)" strokeWidth="1.2"/>
      {/* Animated data dots */}
      <circle cx="55" cy="35" r="2.5" fill="#818cf8" opacity="0.8"/>
      <circle cx="105" cy="35" r="2.5" fill="#818cf8" opacity="0.8"/>
      {/* Labels */}
      <line x1="22" y1="43" x2="38" y2="43" stroke="rgba(99,102,241,0.3)" strokeWidth="0.6"/>
      <line x1="72" y1="23" x2="88" y2="23" stroke="rgba(129,140,248,0.3)" strokeWidth="0.6"/>
    </svg>
  );
}

export function StartupsIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Rocket body */}
      <path d="M80 10 C70 25 65 45 67 65 L80 70 L93 65 C95 45 90 25 80 10 Z"
            stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.12)"/>
      {/* Rocket nose */}
      <path d="M80 10 C75 18 73 22 72 28 L80 26 L88 28 C87 22 85 18 80 10 Z"
            fill="rgba(129,140,248,0.3)" stroke="#818cf8" strokeWidth="1"/>
      {/* Fins */}
      <path d="M67 65 L58 78 L72 70 Z" fill="rgba(99,102,241,0.2)" stroke="#6366f1" strokeWidth="1"/>
      <path d="M93 65 L102 78 L88 70 Z" fill="rgba(99,102,241,0.2)" stroke="#6366f1" strokeWidth="1"/>
      {/* Window */}
      <circle cx="80" cy="42" r="5" stroke="#a5b4fc" strokeWidth="1.2" fill="rgba(165,180,252,0.15)"/>
      {/* Exhaust plume */}
      <path d="M72 70 Q75 80 80 85 Q85 80 88 70"
            stroke="rgba(99,102,241,0.4)" strokeWidth="1" fill="rgba(99,102,241,0.08)"/>
      {/* Stars */}
      <circle cx="30" cy="20" r="1.5" fill="#a5b4fc" opacity="0.6"/>
      <circle cx="45" cy="35" r="1" fill="#818cf8" opacity="0.5"/>
      <circle cx="120" cy="18" r="1.5" fill="#a5b4fc" opacity="0.6"/>
      <circle cx="130" cy="40" r="1" fill="#818cf8" opacity="0.4"/>
    </svg>
  );
}

export function CareerIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Ascending steps */}
      <rect x="20" y="68" width="22" height="12" rx="1" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.08)"/>
      <rect x="42" y="56" width="22" height="24" rx="1" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.1)"/>
      <rect x="64" y="44" width="22" height="36" rx="1" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      <rect x="86" y="32" width="22" height="48" rx="1" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.14)"/>
      <rect x="108" y="18" width="22" height="62" rx="1" stroke="#a5b4fc" strokeWidth="1.5" fill="rgba(165,180,252,0.15)"/>
      {/* Ascending arrow */}
      <path d="M23 62 L45 50 L67 38 L89 26 L111 14"
            stroke="#6366f1" strokeWidth="1.5" fill="none" strokeDasharray="4 2" strokeLinecap="round"/>
      {/* Arrow head */}
      <path d="M108 12 L115 14 L111 20" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function AiIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Input layer nodes */}
      <circle cx="25" cy="25" r="5" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.15)"/>
      <circle cx="25" cy="45" r="5" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.15)"/>
      <circle cx="25" cy="65" r="5" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.15)"/>
      {/* Hidden layer nodes */}
      <circle cx="65" cy="20" r="5" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.15)"/>
      <circle cx="65" cy="37" r="5" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.15)"/>
      <circle cx="65" cy="54" r="5" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.15)"/>
      <circle cx="65" cy="71" r="5" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.15)"/>
      {/* Hidden layer 2 nodes */}
      <circle cx="105" cy="30" r="5" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      <circle cx="105" cy="50" r="5" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      <circle cx="105" cy="70" r="5" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.12)"/>
      {/* Output node */}
      <circle cx="140" cy="45" r="6" stroke="#a5b4fc" strokeWidth="2" fill="rgba(165,180,252,0.2)"/>
      {/* Connections l1->l2 */}
      <line x1="30" y1="25" x2="60" y2="20" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75"/>
      <line x1="30" y1="25" x2="60" y2="37" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <line x1="30" y1="45" x2="60" y2="37" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75"/>
      <line x1="30" y1="45" x2="60" y2="54" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <line x1="30" y1="65" x2="60" y2="54" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75"/>
      <line x1="30" y1="65" x2="60" y2="71" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      {/* Connections l2->l3 */}
      <line x1="70" y1="20" x2="100" y2="30" stroke="rgba(129,140,248,0.2)" strokeWidth="0.75"/>
      <line x1="70" y1="37" x2="100" y2="30" stroke="rgba(129,140,248,0.2)" strokeWidth="0.75"/>
      <line x1="70" y1="54" x2="100" y2="50" stroke="rgba(129,140,248,0.2)" strokeWidth="0.75"/>
      <line x1="70" y1="71" x2="100" y2="70" stroke="rgba(129,140,248,0.2)" strokeWidth="0.75"/>
      {/* Connections l3->output */}
      <line x1="110" y1="30" x2="134" y2="45" stroke="rgba(165,180,252,0.35)" strokeWidth="1"/>
      <line x1="110" y1="50" x2="134" y2="45" stroke="rgba(165,180,252,0.35)" strokeWidth="1"/>
      <line x1="110" y1="70" x2="134" y2="45" stroke="rgba(165,180,252,0.25)" strokeWidth="1"/>
    </svg>
  );
}

export function AnalyticsIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Grid */}
      <line x1="22" y1="75" x2="145" y2="75" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <line x1="22" y1="57" x2="145" y2="57" stroke="rgba(99,102,241,0.1)" strokeWidth="0.5"/>
      <line x1="22" y1="39" x2="145" y2="39" stroke="rgba(99,102,241,0.1)" strokeWidth="0.5"/>
      <line x1="22" y1="21" x2="145" y2="21" stroke="rgba(99,102,241,0.08)" strokeWidth="0.5"/>
      <line x1="22" y1="15" x2="22" y2="75" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      {/* Bars */}
      <rect x="32" y="50" width="14" height="25" rx="1.5" fill="rgba(99,102,241,0.25)" stroke="rgba(99,102,241,0.4)" strokeWidth="0.75"/>
      <rect x="54" y="40" width="14" height="35" rx="1.5" fill="rgba(99,102,241,0.3)" stroke="rgba(99,102,241,0.5)" strokeWidth="0.75"/>
      <rect x="76" y="30" width="14" height="45" rx="1.5" fill="rgba(99,102,241,0.35)" stroke="#6366f1" strokeWidth="0.75"/>
      <rect x="98" y="22" width="14" height="53" rx="1.5" fill="rgba(99,102,241,0.4)" stroke="#6366f1" strokeWidth="0.75"/>
      <rect x="120" y="32" width="14" height="43" rx="1.5" fill="rgba(99,102,241,0.3)" stroke="#6366f1" strokeWidth="0.75"/>
      {/* Trend line overlay */}
      <path d="M39 55 L61 47 L83 38 L105 26 L127 34"
            stroke="#06b6d4" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="0"/>
      {/* Trend dots */}
      <circle cx="39" cy="55" r="2.5" fill="#06b6d4"/>
      <circle cx="105" cy="26" r="2.5" fill="#06b6d4"/>
      <circle cx="127" cy="34" r="2.5" fill="#06b6d4"/>
    </svg>
  );
}

export function GoToMarketIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Funnel shape */}
      <path d="M25 15 L135 15 L100 48 L100 75 L60 75 L60 48 Z"
            stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.08)"/>
      {/* Funnel layers */}
      <line x1="35" y1="29" x2="125" y2="29" stroke="rgba(99,102,241,0.3)" strokeWidth="1"/>
      <line x1="50" y1="43" x2="110" y2="43" stroke="rgba(99,102,241,0.25)" strokeWidth="1"/>
      {/* Fill layers with gradient opacity */}
      <path d="M25 15 L135 15 L125 29 L35 29 Z" fill="rgba(99,102,241,0.18)"/>
      <path d="M35 29 L125 29 L110 43 L50 43 Z" fill="rgba(99,102,241,0.12)"/>
      <path d="M50 43 L110 43 L100 48 L60 48 Z" fill="rgba(99,102,241,0.08)"/>
      <path d="M60 48 L100 48 L100 75 L60 75 Z" fill="rgba(129,140,248,0.12)"/>
      {/* Arrow out the bottom */}
      <path d="M80 76 L80 86 M75 82 L80 87 L85 82"
            stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function PricingIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Three tier blocks */}
      <rect x="18" y="55" width="36" height="26" rx="3" stroke="rgba(99,102,241,0.4)" strokeWidth="1.2" fill="rgba(99,102,241,0.06)"/>
      <rect x="62" y="38" width="36" height="43" rx="3" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.1)"/>
      <rect x="106" y="22" width="36" height="59" rx="3" stroke="#818cf8" strokeWidth="2" fill="rgba(129,140,248,0.15)"/>
      {/* Tier labels */}
      <line x1="24" y1="63" x2="48" y2="63" stroke="rgba(99,102,241,0.35)" strokeWidth="1"/>
      <line x1="24" y1="68" x2="44" y2="68" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <line x1="68" y1="47" x2="92" y2="47" stroke="rgba(99,102,241,0.5)" strokeWidth="1"/>
      <line x1="68" y1="52" x2="88" y2="52" stroke="rgba(99,102,241,0.3)" strokeWidth="0.75"/>
      <line x1="112" y1="32" x2="136" y2="32" stroke="rgba(129,140,248,0.6)" strokeWidth="1"/>
      <line x1="112" y1="37" x2="132" y2="37" stroke="rgba(129,140,248,0.4)" strokeWidth="0.75"/>
      {/* Star badge on top tier */}
      <circle cx="124" cy="17" r="6" fill="rgba(129,140,248,0.2)" stroke="#818cf8" strokeWidth="1"/>
      <path d="M124 13 L125.2 16.4 L128.8 16.4 L125.9 18.4 L127.1 21.8 L124 19.8 L120.9 21.8 L122.1 18.4 L119.2 16.4 L122.8 16.4 Z"
            fill="#a5b4fc" opacity="0.9"/>
    </svg>
  );
}

export function B2BIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Left building */}
      <rect x="20" y="30" width="40" height="50" rx="2" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.08)"/>
      <rect x="20" y="20" width="40" height="12" rx="2" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.12)"/>
      <rect x="27" y="38" width="8" height="10" rx="1" fill="rgba(99,102,241,0.2)"/>
      <rect x="43" y="38" width="8" height="10" rx="1" fill="rgba(99,102,241,0.2)"/>
      <rect x="27" y="54" width="8" height="10" rx="1" fill="rgba(99,102,241,0.15)"/>
      <rect x="43" y="54" width="8" height="10" rx="1" fill="rgba(99,102,241,0.15)"/>
      {/* Right building */}
      <rect x="100" y="30" width="40" height="50" rx="2" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.08)"/>
      <rect x="100" y="20" width="40" height="12" rx="2" stroke="#818cf8" strokeWidth="1.2" fill="rgba(129,140,248,0.12)"/>
      <rect x="107" y="38" width="8" height="10" rx="1" fill="rgba(129,140,248,0.2)"/>
      <rect x="123" y="38" width="8" height="10" rx="1" fill="rgba(129,140,248,0.2)"/>
      {/* Bidirectional arrow */}
      <line x1="62" y1="52" x2="98" y2="52" stroke="#6366f1" strokeWidth="1.5"/>
      <path d="M65 48 L60 52 L65 56" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M95 48 L100 52 L95 56" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function B2CIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Building */}
      <rect x="20" y="28" width="44" height="52" rx="2" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.08)"/>
      <rect x="20" y="18" width="44" height="12" rx="2" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.12)"/>
      <rect x="28" y="36" width="8" height="10" rx="1" fill="rgba(99,102,241,0.2)"/>
      <rect x="42" y="36" width="8" height="10" rx="1" fill="rgba(99,102,241,0.2)"/>
      <rect x="28" y="52" width="8" height="10" rx="1" fill="rgba(99,102,241,0.15)"/>
      {/* Person silhouette */}
      <circle cx="120" cy="35" r="10" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.1)"/>
      <path d="M105 70 C105 58 113 52 120 52 C127 52 135 58 135 70"
            stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.08)"/>
      {/* Arrow from building to person */}
      <path d="M65 52 Q92 52 108 45"
            stroke="#6366f1" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M106 42 L110 46 L105 48" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function HiringIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Person silhouette */}
      <circle cx="65" cy="28" r="14" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.1)"/>
      <path d="M40 75 C40 58 52 50 65 50 C78 50 90 58 90 75"
            stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.08)"/>
      {/* Plus sign */}
      <circle cx="110" cy="42" r="18" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.08)"/>
      <line x1="110" y1="32" x2="110" y2="52" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"/>
      <line x1="100" y1="42" x2="120" y2="42" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function OrganizationIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Root box */}
      <rect x="60" y="10" width="40" height="18" rx="2" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.12)"/>
      {/* Level 1 connectors */}
      <line x1="80" y1="28" x2="80" y2="38" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      <line x1="32" y1="38" x2="128" y2="38" stroke="rgba(99,102,241,0.35)" strokeWidth="1"/>
      <line x1="32" y1="38" x2="32" y2="45" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      <line x1="80" y1="38" x2="80" y2="45" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      <line x1="128" y1="38" x2="128" y2="45" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      {/* Level 1 boxes */}
      <rect x="12" y="45" width="40" height="16" rx="2" stroke="#818cf8" strokeWidth="1.2" fill="rgba(129,140,248,0.1)"/>
      <rect x="60" y="45" width="40" height="16" rx="2" stroke="#818cf8" strokeWidth="1.2" fill="rgba(129,140,248,0.1)"/>
      <rect x="108" y="45" width="40" height="16" rx="2" stroke="#818cf8" strokeWidth="1.2" fill="rgba(129,140,248,0.1)"/>
      {/* Level 2 connectors + boxes */}
      <line x1="20" y1="61" x2="20" y2="68" stroke="rgba(99,102,241,0.3)" strokeWidth="0.75"/>
      <line x1="44" y1="61" x2="44" y2="68" stroke="rgba(99,102,241,0.3)" strokeWidth="0.75"/>
      <rect x="10" y="68" width="20" height="12" rx="1.5" stroke="rgba(129,140,248,0.5)" strokeWidth="1" fill="rgba(99,102,241,0.06)"/>
      <rect x="34" y="68" width="20" height="12" rx="1.5" stroke="rgba(129,140,248,0.5)" strokeWidth="1" fill="rgba(99,102,241,0.06)"/>
    </svg>
  );
}

export function MarketingIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Megaphone body */}
      <path d="M35 38 L35 58 L70 68 L70 28 Z"
            stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.12)"/>
      {/* Megaphone bell */}
      <path d="M70 28 C85 25 100 22 110 20 L110 76 C100 74 85 71 70 68 Z"
            stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.08)"/>
      {/* Handle */}
      <rect x="25" y="43" width="12" height="12" rx="2" stroke="#818cf8" strokeWidth="1.2" fill="rgba(129,140,248,0.12)"/>
      {/* Sound waves */}
      <path d="M118 35 Q126 45 118 55" stroke="#818cf8" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M123 28 Q135 45 123 62" stroke="rgba(129,140,248,0.5)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M129 22 Q145 45 129 68" stroke="rgba(99,102,241,0.25)" strokeWidth="1" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

export function FundraisingIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Grid */}
      <line x1="22" y1="75" x2="145" y2="75" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <line x1="22" y1="15" x2="22" y2="75" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      {/* Growing bars */}
      <rect x="32" y="60" width="16" height="15" rx="1.5" fill="rgba(99,102,241,0.2)" stroke="rgba(99,102,241,0.4)" strokeWidth="0.75"/>
      <rect x="56" y="48" width="16" height="27" rx="1.5" fill="rgba(99,102,241,0.28)" stroke="#6366f1" strokeWidth="0.75"/>
      <rect x="80" y="36" width="16" height="39" rx="1.5" fill="rgba(99,102,241,0.35)" stroke="#6366f1" strokeWidth="1"/>
      <rect x="104" y="24" width="16" height="51" rx="1.5" fill="rgba(129,140,248,0.38)" stroke="#818cf8" strokeWidth="1.2"/>
      <rect x="128" y="16" width="16" height="59" rx="1.5" fill="rgba(129,140,248,0.45)" stroke="#818cf8" strokeWidth="1.5"/>
      {/* Dollar symbol */}
      <text x="132" y="13" fontSize="9" fill="#a5b4fc" fontFamily="monospace" fontWeight="bold">$</text>
      {/* Upward arrow */}
      <path d="M22 70 L40 62 L56 52 L80 38 L104 26 L136 18"
            stroke="#06b6d4" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <circle cx="136" cy="18" r="2.5" fill="#06b6d4"/>
    </svg>
  );
}

export function CultureIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Three overlapping circles — Venn diagram */}
      <circle cx="62" cy="38" r="28" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.08)"/>
      <circle cx="98" cy="38" r="28" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.08)"/>
      <circle cx="80" cy="62" r="28" stroke="#a5b4fc" strokeWidth="1.5" fill="rgba(165,180,252,0.08)"/>
      {/* Intersection highlights */}
      <path d="M80 18 Q95 28 98 38 Q95 50 80 58 Q65 50 62 38 Q65 28 80 18 Z"
            fill="rgba(99,102,241,0.12)" stroke="none"/>
      {/* Center overlap dot */}
      <circle cx="80" cy="47" r="6" fill="rgba(129,140,248,0.25)" stroke="#818cf8" strokeWidth="1"/>
    </svg>
  );
}

export function OpsIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Gear / cog */}
      <circle cx="80" cy="45" r="16" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.1)"/>
      <circle cx="80" cy="45" r="7" stroke="#818cf8" strokeWidth="1.2" fill="rgba(129,140,248,0.15)"/>
      {/* Gear teeth */}
      <rect x="77" y="24" width="6" height="8" rx="1.5" fill="rgba(99,102,241,0.3)" stroke="#6366f1" strokeWidth="1"/>
      <rect x="77" y="58" width="6" height="8" rx="1.5" fill="rgba(99,102,241,0.3)" stroke="#6366f1" strokeWidth="1"/>
      <rect x="59" y="42" width="8" height="6" rx="1.5" fill="rgba(99,102,241,0.3)" stroke="#6366f1" strokeWidth="1"/>
      <rect x="93" y="42" width="8" height="6" rx="1.5" fill="rgba(99,102,241,0.3)" stroke="#6366f1" strokeWidth="1"/>
      <rect x="63" y="28" width="8" height="6" rx="1.5" transform="rotate(-45 67 31)" fill="rgba(99,102,241,0.25)" stroke="#6366f1" strokeWidth="0.75"/>
      <rect x="89" y="28" width="8" height="6" rx="1.5" transform="rotate(45 93 31)" fill="rgba(99,102,241,0.25)" stroke="#6366f1" strokeWidth="0.75"/>
      <rect x="63" y="56" width="8" height="6" rx="1.5" transform="rotate(45 67 59)" fill="rgba(99,102,241,0.25)" stroke="#6366f1" strokeWidth="0.75"/>
      <rect x="89" y="56" width="8" height="6" rx="1.5" transform="rotate(-45 93 59)" fill="rgba(99,102,241,0.25)" stroke="#6366f1" strokeWidth="0.75"/>
      {/* Circular arrows */}
      <path d="M40 45 A40 40 0 0 1 80 8" stroke="rgba(99,102,241,0.3)" strokeWidth="1.2" fill="none" strokeDasharray="4 3"/>
      <path d="M120 45 A40 40 0 0 1 80 82" stroke="rgba(99,102,241,0.3)" strokeWidth="1.2" fill="none" strokeDasharray="4 3"/>
    </svg>
  );
}

export function SalesIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Pipeline funnel stages */}
      <rect x="15" y="20" width="22" height="50" rx="2" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.15)"/>
      <rect x="42" y="26" width="22" height="38" rx="2" stroke="#6366f1" strokeWidth="1.2" fill="rgba(99,102,241,0.2)"/>
      <rect x="69" y="32" width="22" height="26" rx="2" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.22)"/>
      <rect x="96" y="36" width="22" height="18" rx="2" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.28)"/>
      <rect x="123" y="39" width="22" height="12" rx="2" stroke="#a5b4fc" strokeWidth="1.5" fill="rgba(165,180,252,0.3)"/>
      {/* Stage labels */}
      <line x1="19" y1="27" x2="33" y2="27" stroke="rgba(99,102,241,0.4)" strokeWidth="0.75"/>
      <line x1="46" y1="33" x2="60" y2="33" stroke="rgba(99,102,241,0.4)" strokeWidth="0.75"/>
      {/* Forward arrow */}
      <path d="M26 80 L136 80" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75" strokeDasharray="3 2"/>
      <path d="M132 77 L137 80 L132 83" stroke="rgba(99,102,241,0.4)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function RetentionIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Circular arrow loop */}
      <path d="M80 15 A35 35 0 1 1 45 72" stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Arrowhead */}
      <path d="M42 65 L44 74 L52 69" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* User icon in center */}
      <circle cx="80" cy="38" r="8" stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.15)"/>
      <path d="M66 60 C66 52 73 47 80 47 C87 47 94 52 94 60"
            stroke="#818cf8" strokeWidth="1.5" fill="rgba(129,140,248,0.1)"/>
      {/* Check mark */}
      <circle cx="104" cy="22" r="8" fill="rgba(99,102,241,0.2)" stroke="#6366f1" strokeWidth="1.2"/>
      <path d="M100 22 L103 25 L109 18" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function MetricsIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Dashboard border */}
      <rect x="15" y="12" width="130" height="68" rx="4" stroke="rgba(99,102,241,0.35)" strokeWidth="1.2" fill="rgba(99,102,241,0.04)"/>
      {/* Gauge arc */}
      <path d="M50 62 A25 25 0 0 1 100 62"
            stroke="rgba(99,102,241,0.2)" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <path d="M50 62 A25 25 0 0 1 85 40"
            stroke="#6366f1" strokeWidth="6" fill="none" strokeLinecap="round"/>
      {/* Gauge needle */}
      <line x1="75" y1="62" x2="85" y2="40" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="75" cy="62" r="3.5" fill="#6366f1"/>
      {/* KPI boxes */}
      <rect x="112" y="20" width="25" height="16" rx="2" stroke="rgba(99,102,241,0.3)" strokeWidth="1" fill="rgba(99,102,241,0.08)"/>
      <line x1="115" y1="26" x2="134" y2="26" stroke="rgba(99,102,241,0.4)" strokeWidth="0.75"/>
      <line x1="115" y1="30" x2="130" y2="30" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75"/>
      <rect x="112" y="42" width="25" height="16" rx="2" stroke="rgba(129,140,248,0.3)" strokeWidth="1" fill="rgba(129,140,248,0.08)"/>
      <line x1="115" y1="48" x2="134" y2="48" stroke="rgba(129,140,248,0.4)" strokeWidth="0.75"/>
      <line x1="115" y1="52" x2="130" y2="52" stroke="rgba(129,140,248,0.25)" strokeWidth="0.75"/>
      {/* Trend mini-chart */}
      <path d="M22 72 L32 66 L42 68 L52 60"
            stroke="#06b6d4" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <circle cx="52" cy="60" r="2" fill="#06b6d4"/>
    </svg>
  );
}

export function StorytellingIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Open book */}
      <path d="M80 20 L80 72" stroke="rgba(99,102,241,0.4)" strokeWidth="1"/>
      <path d="M20 25 Q50 20 80 20 L80 72 Q50 68 20 72 Z"
            stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.08)"/>
      <path d="M80 20 Q110 20 140 25 L140 72 Q110 68 80 72 Z"
            stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.08)"/>
      {/* Book lines (text) */}
      <line x1="28" y1="34" x2="72" y2="31" stroke="rgba(99,102,241,0.3)" strokeWidth="0.75"/>
      <line x1="28" y1="40" x2="72" y2="37" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75"/>
      <line x1="28" y1="46" x2="72" y2="43" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <line x1="28" y1="52" x2="65" y2="49" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      <line x1="88" y1="31" x2="132" y2="34" stroke="rgba(99,102,241,0.3)" strokeWidth="0.75"/>
      <line x1="88" y1="37" x2="132" y2="40" stroke="rgba(99,102,241,0.25)" strokeWidth="0.75"/>
      <line x1="88" y1="43" x2="132" y2="46" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75"/>
      {/* Speech bubble */}
      <path d="M108 12 Q118 12 118 20 Q118 26 112 27 L110 31 L108 27 Q102 26 102 20 Q102 12 108 12 Z"
            stroke="#818cf8" strokeWidth="1" fill="rgba(129,140,248,0.12)"/>
    </svg>
  );
}

export function DefaultIllustration() {
  return (
    <svg viewBox="0 0 160 90" fill="none" width="140" height="80">
      {/* Abstract geometric pattern */}
      <circle cx="80" cy="45" r="35" stroke="rgba(99,102,241,0.15)" strokeWidth="0.75"/>
      <circle cx="80" cy="45" r="22" stroke="rgba(99,102,241,0.12)" strokeWidth="0.75"/>
      <circle cx="80" cy="45" r="10" stroke="rgba(99,102,241,0.2)" strokeWidth="1"/>
      {/* Diagonal lines */}
      <line x1="45" y1="10" x2="115" y2="80" stroke="rgba(99,102,241,0.12)" strokeWidth="0.75"/>
      <line x1="115" y1="10" x2="45" y2="80" stroke="rgba(99,102,241,0.12)" strokeWidth="0.75"/>
      <line x1="20" y1="45" x2="140" y2="45" stroke="rgba(99,102,241,0.1)" strokeWidth="0.5"/>
      <line x1="80" y1="5" x2="80" y2="85" stroke="rgba(99,102,241,0.1)" strokeWidth="0.5"/>
      {/* Corner accents */}
      <path d="M20 20 L32 20 L32 32" stroke="rgba(99,102,241,0.25)" strokeWidth="1" fill="none" strokeLinecap="round"/>
      <path d="M140 20 L128 20 L128 32" stroke="rgba(99,102,241,0.25)" strokeWidth="1" fill="none" strokeLinecap="round"/>
      <path d="M20 70 L32 70 L32 58" stroke="rgba(99,102,241,0.25)" strokeWidth="1" fill="none" strokeLinecap="round"/>
      <path d="M140 70 L128 70 L128 58" stroke="rgba(99,102,241,0.25)" strokeWidth="1" fill="none" strokeLinecap="round"/>
      {/* Center star-like shape */}
      <circle cx="80" cy="45" r="3" fill="#6366f1" opacity="0.6"/>
      <circle cx="80" cy="45" r="7" fill="rgba(99,102,241,0.12)"/>
    </svg>
  );
}
