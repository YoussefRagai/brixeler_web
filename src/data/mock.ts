export const overviewMetrics = [
  { label: "Verified agents", value: "1,247", trend: "+12%", tone: "up" },
  { label: "Active deals", value: "389", trend: "+8%", tone: "up" },
  { label: "Pending approvals", value: "42", trend: "0%", tone: "flat" },
  { label: "Revenue (EGP)", value: "12.5M", trend: "+15%", tone: "up" },
];

export const recentActivity = [
  {
    id: "activity-1",
    title: "Deal BRX-2025-00045 moved to Negotiating",
    meta: "Youssef Hassan • 6 min ago",
  },
  {
    id: "activity-2",
    title: "New property listing awaiting review",
    meta: "Eastown Residence • 18 min ago",
  },
  {
    id: "activity-3",
    title: "Commission batch #188 released",
    meta: "26 payouts • 45 min ago",
  },
];

export const agentRows = [
  {
    id: "agent-1",
    name: "Lina Magdy",
    phone: "+20 111 234 8844",
    deals: 14,
    earnings: "820K EGP",
    status: "Verified",
    commission: "2.75%",
  },
  {
    id: "agent-2",
    name: "Karim Fouad",
    phone: "+20 100 555 9911",
    deals: 9,
    earnings: "512K EGP",
    status: "Pending docs",
    commission: "2.50%",
  },
  {
    id: "agent-3",
    name: "Omar Badr",
    phone: "+20 122 444 2233",
    deals: 22,
    earnings: "1.4M EGP",
    status: "Suspended",
    commission: "2.60%",
  },
];

export const dealRows = [
  {
    id: "BRX-2025-00045",
    agent: "Youssef Hassan",
    property: "Riverside Heights",
    amount: "3.8M EGP",
    status: "Negotiating",
    updated: "2h ago",
  },
  {
    id: "BRX-2025-00044",
    agent: "Sara Amin",
    property: "Palm Gardens Villa 16B",
    amount: "5.2M EGP",
    status: "Awaiting payment",
    updated: "5h ago",
  },
  {
    id: "BRX-2025-00043",
    agent: "Karim Fouad",
    property: "North Edge Residences 10F",
    amount: "2.45M EGP",
    status: "Paid",
    updated: "Yesterday",
  },
];

export const propertyRows = [
  {
    id: "prop-001",
    name: "Eastown Residence",
    area: "New Cairo",
    price: "2.95M EGP",
    status: "Pending approval",
    agent: "Youssef Hassan",
    date: "Nov 18",
  },
  {
    id: "prop-002",
    name: "Marassi Bay Villa",
    area: "North Coast",
    price: "8.7M EGP",
    status: "Approved",
    agent: "Admin",
    date: "Nov 16",
  },
  {
    id: "prop-003",
    name: "New Giza Courtyards",
    area: "6th of October",
    price: "4.1M EGP",
    status: "Rejected",
    agent: "Karim Fouad",
    date: "Nov 14",
  },
];

export const analyticsSummary = [
  {
    title: "Agent funnel",
    points: [
      "2,084 signups",
      "1,872 verified (89%)",
      "1,122 active (54%)",
      "Avg time to verify: 32h",
    ],
  },
  {
    title: "Deal pipeline",
    points: [
      "1,045 submitted",
      "665 approved (64%)",
      "412 confirmed (39%)",
      "Avg review time: 18h",
    ],
  },
  {
    title: "Revenue run rate",
    points: [
      "Monthly deals: 152",
      "Avg sale: 2.8M EGP",
      "Avg commission: 2.9%",
      "Brixeler share: 0.25%",
    ],
  },
];

export const verificationQueue = [
  {
    id: "agent-9",
    name: "Nour El Sayed",
    submitted: "Nov 19, 09:42",
    docs: ["National ID", "Tax ID", "Bank proof"],
    status: "Waiting review",
    priority: "High",
    notes: "ID front uploaded via OCR, needs manual check",
  },
  {
    id: "agent-10",
    name: "Omar Khalil",
    submitted: "Nov 18, 20:08",
    docs: ["National ID", "Bank proof"],
    status: "Need bank letter",
    priority: "Medium",
    notes: "Uploaded bank screenshot, request PDF letter",
  },
  {
    id: "agent-11",
    name: "Sarah Abdallah",
    submitted: "Nov 18, 15:55",
    docs: ["National ID", "Tax ID", "Bank proof"],
    status: "In review",
    priority: "Low",
    notes: "Everything clear, assign to compliance",
  },
];
