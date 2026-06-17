# QGenda / Physician Scheduling Research

Date: 2026-06-17

Scope: research-only pass for a one-user prototype that helps a hospital physician group produce fair, explainable schedules across rooms/lists, call, weekends, holidays, part-time doctors, eye/dental clinics, personal preferences, and changing daily demand.

## User Notes Captured

- Number of doctors varies, but is never greater than number of rooms/lists.
- Lists/rooms are identical.
- Weekends:
  - Only people who do call do weekends.
  - Friday night is a weekend.
- Never do calls two days in a row.
- Long weekends are split between two people.
- Personal preferences matter; possible LLM-agent onboarding/custom rules.
- Need to understand how the system receives room/list counts, doctor availability, eye/dental clinic data, and similar inputs.
- It seems unacceptable to require one-day-at-a-time input.
- Choice order of doctors for lists:
  - Needs to be even through the year.
  - The person who is first always does call.
- Number of rooms changes.
- Some people do not do call:
  - Never first.
  - Never second.
  - Never last.
- Dental clinic and eye clinic count as a middle pick.
  - Eye clinic is most Wednesdays.
  - Only three people do eyes.
  - Dental has three to five eligible people.
  - Dental days are unknown.
- Day after call: doctor does not work.
- Holidays need handling.
- Some doctors are part-time and also do not do call.

## Research Workstreams

- Product landscape: QGenda and physician scheduling competitors.
- Peer-review/user pain evidence.
- Scheduling optimization/SOTA methods.
- Healthcare operations and fairness rules.
- Data intake, integrations, and UX.
- Prototype architecture and SME approach.

## Running Findings

### Executive Judgment

The highest-layer solution is not a prettier calendar UI and not a free-form LLM that "makes the schedule." It is a deterministic, auditable rostering system:

1. A typed domain model for doctors, daily demand, call, clinic/list slots, eligibility, FTE, holidays, vacations, preferences, and historical credits/debts.
2. A versioned rule/constraint layer with hard constraints, soft preferences, explicit weights, and owner-approved exceptions.
3. A solver-backed schedule generator over a rolling monthly/quarterly horizon, carrying an annual fairness ledger forward.
4. Explainable review: why each assignment happened, why alternatives were blocked, and what tradeoffs were made.
5. LLM-assisted intake and explanation only. The LLM may translate notes, emails, and spreadsheets into draft structured rules, but the approved rules and solver decide assignments.

The SME move is to turn "fairness" from a subjective complaint into an explicit, testable contract. In this use case, fairness should include at least:

- Call burden.
- Weekend burden, including Friday night as weekend.
- Holiday and long-weekend burden.
- First/second/last list position burden.
- Middle-pick clinic burden, including eye/dental credit.
- FTE-normalized workload.
- Preference fulfillment fairness, not just raw preference fulfillment.
- Fatigue/rest exposure, especially post-call recovery and clustered assignments.
- Disruption burden when published schedules are repaired.

### What QGenda Appears To Offer

QGenda publicly markets QGenda ProviderCloud as a healthcare-only workforce platform that unifies provider scheduling, credentialing, on-call, time and attendance, room/capacity management, compensation, and analytics. Its provider scheduling pages claim equitable, rules-based schedules aligned to patient demand, provider work rules, and preferences. Its platform pages now also use AI/predictive language for scheduling optimization, workforce insights, and staffing decisions.

Useful official references:

- QGenda provider scheduling: https://www.qgenda.com/physician-scheduling-software/
- QGenda workforce scheduling: https://www.qgenda.com/workforce-scheduling-software/
- QGenda ProviderCloud: https://www.qgenda.com/providercloud/
- QGenda Intelligence: https://www.qgenda.com/qgenda-intelligence/
- QGenda integrations: https://www.qgenda.com/integrated-partners/
- QGenda REST API docs: https://restapi.qgenda.com/
- Epic Showroom listing: https://showroom.epic.com/Listing?id=981

QGenda's public rule-engine blog describes prioritized scheduling rules: distributing call over time, provider-group rules, rules based on specific providers, task-pairing, preferred consecutive-day rules, and task weights. This is directionally aligned with the user's problem, but public pages do not expose enough detail to verify the exact optimization model, objective function, fairness math, infeasibility diagnostics, or repair behavior.

Reference:

- QGenda prioritized rules blog: https://www.qgenda.com/blog/qgenda-prioritizes-rules-automated-physician-scheduling/

Public training material from health systems suggests that manual administrative workflows still matter. Northwestern Medicine's schedule-owner guide shows drag-and-drop assignment, pop-up assignment, copy mode, split shifts, status/publish controls, bulk publish/delete, task skilling, Excel report download, and custom reports through support. Vocera integration documentation says QGenda schedules are generally entered in QGenda by physician-group administrative staff and then retrieved by REST API.

References:

- Northwestern schedule-owner guide: https://physicianforum.nm.org/uploads/1/1/9/4/119404942/scheduling-process_steps.pdf
- Vocera QGenda adapter overview: https://pubs.vocera.com/adapters/qgenda/1.0.0/help/qgenda_ref_help/adapters/qgenda/1.0.0/topics/adapt_qgenda_integration.html
- QGenda calendar subscription example: https://www.kansashealthsystem.com/-/media/project/website/pdfs-for-download/covid19/share-a-qgenda-schedule.pdf
- Northwestern provider skilling guide: https://physicianforum.nm.org/uploads/1/1/9/4/119404942/skill_providers_in_qgenda_settings.pdf

### Likely QGenda Gaps For This Prototype

These are not claims that QGenda cannot do something; they are the gaps not proven by public evidence and likely pain points for the user's father's complaint.

- Formal fairness is opaque. QGenda says equitable/balanced, but public materials do not expose a fairness ledger, Gini/variance metrics, FTE normalization, explicit burden weights, or annual carryover math.
- Explainability is unclear. Public pages do not show "why Dr. X was first," "why Dr. Y was excluded," or "what rule made this cluster necessary."
- Rule ownership may require implementation/support services. Reviews and training docs imply some functions need support, custom reports, or multi-step admin configuration.
- One-day-at-a-time workflows can still leak through. QGenda has bulk and copy tools, but public hospital docs still show grid-cell operations and special holiday/day exceptions.
- Write automation and rule configuration via API are not clearly public. The REST API is public as documentation, but rule-engine mutation, schedule generation, and approval workflow APIs need direct validation.
- Data intake quality is decisive. If room counts, eligibility, eye/dental days, FTE, and call history are incomplete or entered late, even a strong engine will generate schedules that feel unfair.

### Competitor Landscape

The market clusters into three groups:

1. Physician-specific schedulers:
   - QGenda.
   - PerfectServe Lightning Bolt.
   - AMiON.
   - TigerConnect Physician Scheduling.
   - UKG EZCall.
   - Intrigma.
   - Shift Admin, now a QGenda company.
   - symplr Physician Scheduling.

2. Enterprise workforce/staff scheduling:
   - UKG/Kronos workforce products.
   - symplr Workforce / Smart Square.
   - ANSOS and related nurse/staff systems.

3. Smaller/newer/managed/modern entrants:
   - Mesh AI.
   - Thrawn.
   - ScheduleForward.
   - SaniShift.
   - ShiftMedix.
   - PipShift.
   - Petal, especially Canada-oriented.

Notable public claims:

- PerfectServe Lightning Bolt explicitly markets combinatorial optimization for physician scheduling, positioning itself as choosing the best schedule from many possibilities rather than merely digitizing manual work.
- AMiON markets automated templates, advanced rules, day-after rules, requests/swaps, and on-call publishing.
- TigerConnect markets automated fair/balanced schedules with custom rules, time-off requests, preferences, holidays, and integrated clinical communication.
- UKG EZCall markets automated call rotations, shift assignments, OR coverage, and fair/flexible schedules.
- Intrigma markets physician/nurse scheduling, shift coverage, staff satisfaction, and workload/fairness tracking.
- symplr is stronger as an enterprise healthcare operations platform, with physician scheduling plus workforce/timekeeping modules.

References:

- PerfectServe Lightning Bolt: https://www.lightning-bolt.com/provider-scheduling/
- PerfectServe physician scheduling: https://www.perfectserve.com/physician-scheduling-software/
- AMiON: https://doximity.hospitalsolutions.com/amion
- AMiON getting started: https://www.whoison.net/cgi-bin/ocs?Page=Help%3A113
- TigerConnect physician scheduling: https://tigerconnect.com/products/physician-scheduling/
- TigerConnect clinics: https://tigerconnect.com/products/physician-scheduling/physician-scheduling-clinics/
- UKG EZCall: https://www.ukg.com/products/ukg-ezcall
- Intrigma: https://www.intrigma.com/
- symplr physician scheduling: https://www.symplr.com/products/symplr-physician-scheduling
- symplr platform: https://www.symplr.com/
- KLAS physician scheduling comparison: https://klasresearch.com/compare/scheduling-physician/324

### Review And Anecdotal Evidence

Directional public review themes:

- Broad QGenda review signal is positive, but not pain-free. G2 shows strong aggregate ratings and praise for customization, access, and support, while recurring negatives include difficult navigation, time-consuming setup, learning curve, and inefficient workflows.
- Fairness/call distribution is a real selling point when configured well. Reviewers praise tracking equality and assigning shifts more equally, but complex practices still report automation/rule hiccups and manual adjustment.
- Schedule-building time improves, but setup is the tax. Public reviews and physician-forum anecdotes repeatedly suggest QGenda can get a schedule most of the way there, then humans fine-tune edge cases.
- Data entry/admin UX are recurring pain points: too many clicks, hard-to-understand request states, cryptic errors, difficult task/person setup, and limited change tracking.
- Swaps are mixed. Vendor/app listings advertise mobile trades and reviews praise simplified swaps in some settings, but other reviews mention week-long swaps requiring day-by-day handling and mobile limitations for urgent call changes.
- Mobile is contradictory: app-store aggregate ratings are strong, but visible reviews complain about SSO/2FA friction, reloads, notifications, month-view issues, calendar comparison friction, and bugs.
- Reporting is a strength with gaps. Users like tracking shifts, request limits, vacation, and equality; complaints ask for better print/calendar views and clearer audit/history.
- "Clusters" are not commonly named in public reviews. The same pain appears as sequencing, nights/weekends/holidays, recovery after heavy shifts, and post-swap fairness drift.
- QGenda positives: centralized schedule visibility, support responsiveness, ability to handle varied shifts/FTEs/sites, complex anesthesia or hospitalist scheduling, reporting/history.
- QGenda negatives: difficult navigation, complex setup, slow or unintuitive workflows, multi-area changes required for one functional outcome, mobile limitations, tedious reporting/export formatting, support escalation friction.
- Student Doctor Network anecdotes include both praise and realism: one scheduler says QGenda's automation gets roughly 90 percent of the way there, then humans review/fill gaps; another says large anesthesia groups use QGenda for monthly schedules and daily drag-and-drop assignments integrated with OR scheduling.
- App-store snippets suggest mobile can be adequate for viewing but may frustrate providers when swaps/urgent changes need richer desktop functionality.

References:

- G2 QGenda reviews/pros-cons: https://www.g2.com/products/qgenda-advanced-scheduling-for-providers/reviews?qs=pros-and-cons
- Software Advice reviews: https://www.softwareadvice.com/project-management/qgenda-profile/reviews/
- Capterra QGenda: https://www.capterra.com/p/90628/QGenda/reviews/
- QGenda App Store: https://apps.apple.com/us/app/qgenda/id657634288
- QGenda Google Play: https://play.google.com/store/apps/details?id=com.qgenda.mobile
- Dalhousie QGenda case study: https://www.qgenda.com/case-study/dalhousie-scheduling-payroll/
- QGenda Forrester TEI report: https://www.qgenda.com/report/the-total-economic-impact-of-the-qgenda-healthcare-workforce-management-platform/
- Student Doctor Network scheduling thread: https://forums.studentdoctor.net/threads/scheduling-software.1474919/
- Student Doctor Network AI/scheduling thread: https://forums.studentdoctor.net/threads/scheduling-software-ai-app.1507901/
- Student Doctor Network QGenda questions: https://forums.studentdoctor.net/threads/qgenda-questions.1488510/
- Student Doctor Network anesthesia scheduling software: https://forums.studentdoctor.net/threads/anesthesia-scheduling-software.1382234/
- PerfectServe 2026 Best in KLAS announcement: https://www.perfectserve.com/news/2026-best-in-klas-clinical-communication-physician-scheduling/
- Lightning Bolt KLAS comments page: https://klasresearch.com/comments/perfectserve-lightning-bolt-scheduling/2867

Interpretation: existing software can be good, but the pain is rarely solved by "automation" alone. The unsolved edge is the local rulebook: partial FTEs, call exemptions, post-call relief, holiday customs, clinic eligibility, annual list-order balancing, and whether providers trust the result.

### SOTA / Research View

The academic and operations-research framing is physician rostering / personnel scheduling / nurse rostering, usually with mixed-integer programming, constraint programming, CP-SAT, branch-and-price, large-neighborhood search, tabu search, simulated annealing, or matheuristics.

The gold-standard model uses binary assignment variables such as:

`assign[doctor, day, slot] = 1`

Then it derives:

- Worked day.
- Call day.
- Weekend block.
- Holiday assignment.
- First/second/middle/last pick.
- Eye/dental assignment.
- Post-call rest.
- Consecutive-day cluster.
- FTE-normalized workload.
- Fairness deviation.
- Preference satisfaction.
- Repair delta from a prior published schedule.

Hard constraints should be reserved for impossibilities:

- Required coverage.
- One assignment per doctor per conflicting time window.
- Vacation/unavailability.
- Eligibility/credential/skill.
- No consecutive calls.
- Day after call off.
- Only call-eligible doctors cover weekend/call.
- Non-call doctors never first/second/last if that is truly policy.
- Long weekends split if that is true hard policy.

Soft constraints should carry visible penalties:

- Preference satisfaction.
- Avoid clusters.
- Avoid consecutive weekends.
- Equalize first/list-order burden.
- Equalize call/weekend/holiday burden.
- Equalize eye/dental middle-credit burden.
- Preserve published schedules during repair.
- Minimize unpopular sequences.

Recommended objective structure is lexicographic/hierarchical:

1. No hard violations.
2. No critical coverage gaps.
3. Minimize fatigue/rest risk.
4. Balance high-burden work.
5. Maximize preferences fairly.
6. Minimize schedule disruption.
7. Improve aesthetics/continuity.

References:

- OR-Tools employee scheduling guide: https://developers.google.com/optimization/scheduling/employee_scheduling
- OR-Tools CP-SAT solver: https://developers.google.com/optimization/cp/cp_solver
- INRC-II nurse rostering competition: https://mobiz.vives.be/inrc2/
- INRC-II paper: https://link.springer.com/article/10.1007/s10479-018-2816-0
- Physician scheduling review: https://eprints.lancs.ac.uk/id/eprint/207813/
- Physician rostering MIP/matheuristic paper: https://link.springer.com/article/10.1007/s10479-020-03552-5
- Physician online rescheduling paper: https://link.springer.com/content/pdf/10.1007/s10696-016-9274-2.pdf
- Fairness and collaborative shift scheduling: https://dl.acm.org/doi/fullHtml/10.1145/3313831.3376656
- arXiv copy of fairness paper: https://arxiv.org/abs/2001.09755

### Human Fairness / SME Lens

SMEs will not accept "we equalized counts" as fairness. They will ask:

- Equal among whom? All doctors, only full-time doctors, only call-eligible doctors, or FTE-weighted pools?
- Equal over what period? Month, quarter, calendar year, rolling 12 months, multi-year holiday cycle?
- Equal by raw count or burden weight?
- Does one Friday night equal one Saturday? Does a long weekend count as one or multiple duties?
- Does eye/dental count as "middle pick" or its own skill-constrained burden?
- Does a post-call off day create a hidden workload credit/debit?
- Are part-time doctors excluded from call but still part of list-order fairness?
- Are preferences granted evenly, or do some doctors consistently win?
- Does the system prevent clusters, or does it merely balance totals by December?

The important product mechanism is a fairness ledger:

| Ledger | Who Is In Pool | Weighting | Horizon | Notes |
| --- | --- | --- | --- | --- |
| Call | call-eligible doctors | raw or burden-weighted | annual / rolling | never consecutive; post-call relief |
| Weekend | call-eligible doctors | Fri night + Sat/Sun + holiday weights | annual / rolling | long weekends split |
| Holiday | call-eligible doctors | major/minor class | multi-year ideal | carry prior-year history |
| First pick | call-eligible doctors | count + cluster penalty | annual | first always does call |
| Middle pick | eligible doctors | room/list, eye/dental credit | annual | non-call doctors may live here |
| Last pick | call-eligible only if policy | count | annual | non-call never last |
| Eye | eye-eligible doctors | count/burden | annual | only three eligible |
| Dental | dental-eligible doctors | count/burden | annual | days unknown |
| Preference grants | all doctors | priority-weighted | annual | fairness of yes/no |
| Disruption | affected doctors | changed assignments | per repair + annual | avoids same people always absorbing changes |

### Data Intake And UX

The worst product choice would be requiring daily hand entry for room counts and lists. The safe design is a canonical model with multiple input paths:

1. Spreadsheet workbook import as the power-user backbone:
   - `Providers`
   - `Contracts/FTE`
   - `Eligibility`
   - `Demand`
   - `Recurring Clinics`
   - `Vacations`
   - `Preferences`
   - `Call History`
   - `Holidays`
   - `Overrides`

2. Recurring rules for room/list demand:
   - Example: "Eye clinic most Wednesdays, 1 middle-pick slot, eligible pool EYE."
   - Example: "Weekdays usually N rooms; exceptions supplied by date."
   - Example: "Friday night is weekend call."

3. Calendar feeds as availability signals:
   - Google/Microsoft free-busy.
   - ICS feeds.
   - PTO calendars.
   - Manual holds.
   - Human confirmation before import becomes authoritative.

4. Natural-language onboarding as draft extraction:
   - Paste notes or emails.
   - LLM converts to typed draft rules.
   - UI asks specific ambiguity questions.
   - User approves rules before they affect solving.

5. Validation wizard before solving:
   - Missing provider IDs.
   - Duplicate names.
   - Unknown clinic.
   - No eligible eye doctor on a required eye day.
   - FTE overload.
   - Impossible holiday/call split.
   - Demand exceeds available eligible doctors.
   - Policy contradiction, e.g. long weekend must be split but only one eligible doctor available.

References:

- Microsoft Shifts Excel import: https://support.microsoft.com/en-us/office/import-a-schedule-from-excel-to-shifts-cf3923e4-c5f5-457f-9c98-d344684dc0b0
- Connecteam import workflow: https://help.connecteam.com/en/articles/6518011-job-scheduling-learn-how-to-import-shifts-from-excel
- Google Calendar recurring events: https://developers.google.com/workspace/calendar/api/guides/recurringevents
- Google Calendar free/busy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Microsoft Graph getSchedule: https://learn.microsoft.com/en-us/graph/api/calendar-getschedule
- iCalendar RRULE reference: https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html
- Timefold input validation: https://docs.timefold.ai/employee-shift-scheduling/latest/user-guide/input-validation

### Prototype Architecture

Recommended one-user but production-quality architecture:

- Typed app model:
  - `Doctor`
  - `DemandDay`
  - `ServiceSlot`
  - `Eligibility`
  - `Rule`
  - `FairnessLedger`
  - `Scenario`
  - `ScheduleRevision`
  - `Assignment`
  - `Explanation`
  - `AuditEvent`

- Solver:
  - Default: OR-Tools CP-SAT for boolean/integer constraint optimization.
  - Alternative/spike: Timefold for score explanation and real-time planning patterns.
  - Optional diagnostic layer: Z3/solver assumptions for unsat-core-like conflict explanations.

- Rule DSL:
  - `id`
  - `severity`
  - `scope`
  - `predicate`
  - `weight`
  - `effective_range`
  - `source`
  - `owner_approval`
  - `exception_policy`
  - `explanation_template`

- LLM boundaries:
  - Allowed: extract structured draft facts/rules, summarize solver explanations, generate question checklists, draft import mappings.
  - Not allowed: directly mutate approved rules, waive constraints, decide final assignments, invent why an assignment happened.

- Provenance/audit:
  - Append-only events for imports, edits, LLM extractions, approvals, solver runs, overrides, exports.
  - Every schedule can be reproduced from inputs, rule versions, solver version, random seed, and objective weights.

- Exports:
  - XLSX/CSV for spreadsheet review.
  - ICS for individual calendars.
  - PDF for human distribution.
  - JSON schedule package for reproducibility.

References:

- Timefold constraint scoring: https://docs.timefold.ai/timefold-solver/latest/constraints-and-score/overview
- Timefold score analysis: https://docs.timefold.ai/employee-shift-scheduling/latest/user-guide/score-analysis
- Timefold real-time planning: https://docs.timefold.ai/employee-shift-scheduling/latest/real-time-planning
- MiniZinc handbook: https://docs.minizinc.dev/en/stable/index.html
- W3C PROV-O: https://www.w3.org/TR/prov-o/
- OpenTelemetry docs: https://opentelemetry.io/docs/
- RFC 5545 iCalendar: https://datatracker.ietf.org/doc/html/rfc5545

### Compliance / Enterprise Posture

For a one-user prototype, avoid PHI by design:

- No patient names.
- No case names.
- No MRNs.
- No procedure details unless absolutely necessary.
- No full calendar event text sent to LLMs.
- Store provider preferences and scheduling constraints as sensitive operational data.

Important nuance: "doctor schedule" data is not automatically PHI, but scheduling data can become PHI when it identifies a patient or care context: appointment reason, room tied to a patient, procedure details, patient identifiers, visit dates, or payment context. The prototype should be explicitly non-PHI/non-clinical unless and until it is operated as a business-associate system with appropriate BAAs, policies, controls, and customer approval.

Professional controls:

- Strong auth, ideally passkey/MFA.
- Encryption at rest and in transit.
- Audit log for every rule/schedule change.
- Role separation eventually: scheduler, approver, viewer.
- Data retention and deletion policy.
- Backups and restore tests.
- Secrets management.
- Export watermarking/versioning.
- Least-privilege access to calendars and QGenda APIs.
- If any PHI enters scope, require HIPAA/BAA posture from cloud and AI vendors.

References:

- QGenda Trust Center: https://trust.qgenda.com/
- QGenda SOC 2 announcement: https://www.qgenda.com/newsroom/qgenda-achieves-soc-2-compliance/
- HHS HIPAA Privacy Rule summary: https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/index.html
- HHS HIPAA Security Rule summary: https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html
- HHS online tracking guidance: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html
- HHS HIPAA cloud guidance: https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html
- HHS minimum necessary guidance: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html
- HHS business associates guidance: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html
- HHS misleading HIPAA certification guidance: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/be-aware-misleading-marketing-claims/index.html
- Google Workspace HIPAA guidance: https://knowledge.workspace.google.com/admin/compliance/hipaa-compliance-with-google-workspace-and-cloud-identity
- Microsoft HIPAA/HITECH guidance: https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech
- NIST SP 800-66r2: https://csrc.nist.gov/pubs/sp/800/66/r2/final
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/

Future enterprise integration requirements:

- Calendars: Google Calendar, Microsoft 365/Exchange, iCalendar; default to free/busy only.
- HRIS/workforce: staff identity, department, role, FTE, employment status, PTO, cost center, termination; SCIM/OIDC/SAML where appropriate.
- Credentialing/privileging: NPI, state license, site privileges, specialty/procedure eligibility, expiration and verification source.
- EHR/OR/clinic templates: provider templates, visit types, rooms, service lines, resource pools, clinic sessions, OR blocks, holds, effective dates.
- Standards: FHIR `Schedule`, `Slot`, and `Appointment`; SMART App Launch for embedded workflows; HL7 v2 SIU for legacy scheduling interfaces.
- On-call/paging: current role lookup, escalation, message routing, acknowledgements, failover, and auditability.

References for interoperability:

- SCIM RFC 7644: https://datatracker.ietf.org/doc/html/rfc7644
- OpenID Connect Core: https://openid.net/specs/openid-connect-core-1_0-final.html
- SAML 2.0 overview: https://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html
- FHIR Schedule: https://build.fhir.org/schedule.html
- FHIR Appointment: https://build.fhir.org/appointment.html
- IHE FHIR Scheduling: https://profiles.ihe.net/ITI/Scheduling/index.html
- SMART App Launch: https://build.fhir.org/ig/HL7/smart-app-launch/app-launch.html
- HL7 v2 scheduling chapter: https://www.hl7.eu/HL7v2x/v24/std24/ch10.htm
- NPI Registry API: https://npiregistry.cms.hhs.gov/api-page
- NPDB hospitals guidance: https://www.npdb.hrsa.gov/orgs/hospitals.jsp
- ONC EHI export criterion: https://healthit.gov/test-method/electronic-health-information-export/

### Subject Matter Expert Discovery Questions

Before implementation, ask these in order.

#### Coverage

- What exactly is being assigned: daily list order, rooms, call, weekend call, holiday call, eye clinic, dental clinic, backup?
- Are all lists truly identical, or do any differ by acuity, location, staffing, equipment, duration, or admin burden?
- Is "number of doctors never greater than rooms/lists" a hard fact or an observed fact?
- Can a doctor cover more than one slot in a day?

#### Eligibility

- Who is call-eligible?
- Who is eye-eligible?
- Who is dental-eligible?
- Which doctors are part-time, and what is their exact FTE or session target?
- Are part-time and non-call doctors excluded from first/second/last by contract or by custom?

#### Rest / Fatigue

- What exactly counts as call?
- Does every call create the next day off, or only night/weekend call?
- Can a post-call day include admin, dental, eye, telehealth, or nothing at all?
- Are consecutive non-call workdays capped?
- Are consecutive weekends capped?

#### Fairness

- Is fairness measured over month, quarter, year, rolling year, or multi-year holiday cycle?
- Does Friday night carry the same weight as Saturday/Sunday?
- How should long weekends be split and credited?
- Does eye/dental replace a middle pick, add extra burden, or both?
- Do preferences have priority levels?
- Do denied preferences create future credit?

#### Demand Intake

- Where do room/list counts come from today?
- How far in advance are counts known?
- Which changes are recurring, which are forecasted, and which are late exceptions?
- Where do dental days come from if unknown?
- Where are holidays and observed holidays defined?

#### Governance

- Who owns the rulebook?
- Who can approve an exception?
- What does "good enough to publish" mean?
- How are disputes resolved?
- What reports would make doctors trust the schedule?

### Proposed MVP For This Specific Use Case

MVP 0: Shadow-mode evaluator.

- Import a year or quarter of historical schedules.
- Compute fairness ledgers and cluster metrics.
- Show why the current schedule feels unfair.
- No generation yet.

MVP 1: Rulebook and validator.

- Providers, FTE, eligibility, recurring demand, holidays, vacations.
- Detect impossible or ambiguous rules.
- Generate fairness targets before assignment.

MVP 2: Solver-generated monthly schedule.

- Hard constraints for coverage, eligibility, no consecutive call, post-call off.
- Soft objectives for fairness, no clusters, preferences.
- Annual ledger carry-forward.

MVP 3: Explainability and repair.

- Why assigned / why not assigned.
- What-if: doctor vacation, extra room, dental day appears, sick call.
- Minimize changes from published schedule.

MVP 4: Integrations.

- Spreadsheet import/export.
- ICS export.
- Read-only calendar availability.
- Optional QGenda API read to compare or bootstrap history.

### Success Metrics

- Zero hard rule violations.
- Coverage completeness.
- Max/min and variance of call, weekend, holiday, first-pick, middle-pick, last-pick counts.
- FTE-normalized fairness spread.
- Cluster metrics: consecutive calls, consecutive weekends, bad sequences, post-call violations.
- Preference fulfillment rate and distribution.
- Number of manual edits after generation.
- Number of provider objections by category.
- Repair disruption count.
- Time to produce schedule.
- Reproducibility: same inputs produce same result and explanation.
