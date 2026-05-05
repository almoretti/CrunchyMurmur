const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Bundled note-templates ported verbatim from Mac NoteTemplates.swift —
// these are the source of truth. User edits live as JSON overrides at
// %APPDATA%\CrunchyMurmur\Templates\<id>.json; the loader merges them on top.
//
// Keep the wording and formatting in sync with the Mac copy when one changes.

const BUNDLED = [
  {
    id: 'generic',
    name: 'Generic Summary',
    description: 'Default. Works for any meeting.',
    instructions:
`Produce:
## TL;DR
Two or three sentences capturing the meeting's outcome and most important point.

## Key points
Bullet list of the main topics discussed, in the order they came up.

## Action items
Each formatted as: - [ ] @owner: action (due date if mentioned)
If no owner was named, put @unassigned.`,
  },
  {
    id: 'one_on_one',
    name: '1:1 / Coaching',
    description: 'Manager-report check-ins, mentorship.',
    instructions:
`Produce:
## Mood / energy
One short paragraph on the report's apparent state — engaged, frustrated, anxious, energized, etc. Cite specific moments.

## Wins
What's going well or what they're proud of.

## Blockers / concerns
What's stuck or worrying them. Be specific.

## Growth & development
Career topics, feedback given/received, skills they're working on.

## Follow-ups
Things the manager committed to, plus things the report should chase. Format: - [ ] @manager / @report: action.`,
  },
  {
    id: 'sales_discovery',
    name: 'Sales Discovery',
    description: 'Prospect calls, qualification.',
    instructions:
`Produce:
## Pain points
Problems the prospect described, ideally with their own words.

## Budget signals
Anything indicating money or willingness to spend.

## Decision criteria
How they'll evaluate vendors / solutions.

## Decision makers & process
Who's involved, what the process looks like.

## Objections
Concerns raised. Capture them precisely.

## Next steps
Format: - [ ] @owner: action (date if committed)

## Opportunity assessment
One paragraph: qualitative read on fit, urgency, and momentum.`,
  },
  {
    id: 'customer_interview',
    name: 'Customer Interview',
    description: 'User research, UX discovery.',
    instructions:
`Produce:
## Top insights
The 3–5 most important things the user revealed.

## Direct quotes
Verbatim statements worth preserving. Use blockquote (>). Attribute to [OTHERS] if multiple participants.

## Themes
Patterns across the conversation — what kept coming up?

## Surprises
Things that contradicted prior assumptions or were unexpected.

## Hypotheses to test
What follow-up research / experiments would validate or extend these findings.`,
  },
  {
    id: 'standup',
    name: 'Standup / Status',
    description: 'Daily syncs, project updates.',
    instructions:
`Produce one section per person who spoke, formatted as:

## <Person name or [YOU] / [OTHERS] if no name>
**Yesterday**: completed work
**Today**: planned work
**Blockers**: anything stuck

Then a short final section:

## Team-level notes
Cross-cutting issues, decisions, or risks affecting the whole team.`,
  },
  {
    id: 'product_review',
    name: 'Product / Eng Review',
    description: 'Spec walkthrough, design review.',
    instructions:
`Produce:
## Decisions made
Concrete choices, with the reasoning behind each.

## Open questions
Unresolved items needing follow-up. Note who might answer.

## Risks
Technical, timeline, or scope risks surfaced.

## Action items
Format: - [ ] @owner: action (date if committed)`,
  },
  {
    id: 'hiring_interview',
    name: 'Hiring Interview',
    description: 'Candidate calls.',
    instructions:
`Produce:
## Signals (positive)
Specific evidence of skills, judgment, or fit. Cite moments.

## Concerns
Areas of doubt or weakness. Cite moments.

## Skills evidence
Concrete examples the candidate gave (projects, decisions, technical depth).

## Recommendation
One of: **Strong yes**, **Yes**, **No**, **Strong no**.
Followed by a one-paragraph rationale.`,
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm / Ideation',
    description: 'Open exploration sessions.',
    instructions:
`Produce:
## Ideas (grouped by theme)
Bullet lists, organized into themed subsections (### theme).

## Top picks
The 3–5 ideas the group seemed most excited about. Note who championed each.

## Parking lot
Ideas worth revisiting but not prioritized now.

## Next steps
Who's exploring what, by when.`,
  },
  {
    id: 'strategy',
    name: 'Strategy / Planning',
    description: 'Roadmap, OKR, planning sessions.',
    instructions:
`Produce:
## Decisions
What was decided. Be precise.

## Options considered
Alternatives that were discussed but not chosen, with the reasoning.

## Owners and timeline
Who is doing what, by when.

## Risks
Things that could derail the plan.

## Open questions
What still needs to be answered before execution can start.`,
  },
  {
    id: 'exec_briefing',
    name: 'Exec Briefing',
    description: 'One-page brief for leadership.',
    instructions:
`Produce a tight, one-page brief:

## Headline
A single sentence: what is this, and why does it matter?

## Three things to know
Exactly three bullets.

## Asks
What you need from leadership (resources, decisions, support). Be specific.

## Decisions needed
List of decisions waiting on this audience. Each one phrased as a yes/no or a multiple-choice.`,
  },
];

function templatesDir() {
  const dir = path.join(app.getPath('userData'), 'Templates');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileFor(id) {
  return path.join(templatesDir(), `${id}.json`);
}

function readOverride(id) {
  try {
    const raw = fs.readFileSync(fileFor(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applyOverride(bundled) {
  const stored = readOverride(bundled.id);
  if (!stored) return { ...bundled, customized: false };
  return {
    id: bundled.id,
    name: stored.name ?? bundled.name,
    description: stored.description ?? bundled.description,
    instructions: stored.instructions ?? bundled.instructions,
    customized: true,
  };
}

function list() {
  return BUNDLED.map(applyOverride);
}

function find(id) {
  const b = BUNDLED.find((t) => t.id === id);
  return b ? applyOverride(b) : null;
}

function save(template) {
  if (!template || !template.id) throw new Error('save: missing id');
  const bundled = BUNDLED.find((t) => t.id === template.id);
  if (!bundled) throw new Error('save: unknown template id ' + template.id);
  const payload = {
    id: template.id,
    name: template.name,
    description: template.description,
    instructions: template.instructions,
  };
  fs.writeFileSync(fileFor(template.id), JSON.stringify(payload, null, 2), 'utf8');
  return find(template.id);
}

function revert(id) {
  const f = fileFor(id);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  return find(id);
}

module.exports = { list, find, save, revert, templatesDir };
