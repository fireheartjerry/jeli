// The NeurIPS 2026 workshop paper, in one place: the home page entry, the
// paper page, the command palette and the structured data all read from here.
export const paper = {
  title: "Verifying the Second Agent",
  subtitle: "Controlled Experiments on Recursive Delegation in Coding Agents",
  href: "/research/verifying-the-second-agent",
  year: 2026,
  venue: "NeurIPS 2026 workshops, Sydney",
  workshops: [
    { short: "Who Verifies the Agents?", full: "Who Verifies the Agents? Toward Reliable Agent Development" },
    { short: "Managing Agents that Manage Agents", full: "Managing Agents that Manage Agents" },
  ],
};

export const bibtex = `@inproceedings{li2026second,
  title     = {Verifying the Second Agent: Controlled Experiments on Recursive Delegation in Coding Agents},
  author    = {Li, Jerry},
  booktitle = {NeurIPS 2026 Workshop: Who Verifies the Agents? Toward Reliable Agent Development},
  year      = {2026},
  note      = {Also accepted at the NeurIPS 2026 Workshop: Managing Agents that Manage Agents}
}`;

/** The sections of the home page, in order; the index rail and the palette share this list. */
export const sections = [
  { id: "top", label: "Cover" },
  { id: "work", label: "Work" },
  { id: "research", label: "Research" },
  { id: "projects", label: "Projects" },
  { id: "record", label: "Record" },
  { id: "contact", label: "Contact" },
];
