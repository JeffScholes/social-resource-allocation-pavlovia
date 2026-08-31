# Pavlovia PsychoJS version

This folder is a separate browser implementation of the Social Resource
Allocation Task. It does not alter the PsychoPy files in `../experiment`.

## Before you upload

1. Replace the ethics-debrief contact placeholders in `experiment.js` with the
   wording approved for your study.
2. Create a new **PsychoJS** project in Pavlovia, then upload/push the entire
   contents of this folder (including `assets`). The experiment entry point is
   `index.html`.
3. Run Pavlovia's pilot mode and download a data file to check both the media
   and the column names before recruiting.

The first page has a **Start experiment** button. It is deliberately required
before the experiment starts, so narrated instruction audio is permitted by
modern browser autoplay rules. The narration for each screen starts from the
participant's click to enter that screen; a replay button is available.

## Important implementation notes

- The experiment uses PsychoJS for Pavlovia session handling and data saving,
  with a hand-coded browser interface.
- Trial and pilot-check values are written as normal PsychoJS data rows. The
  pilot checks are stored as a final row with `record_type = pilot_checks`.
- The feedback mechanism, including its threshold structure, is simulated as
  in the desktop version. Do not change this without updating the debrief and
  ethics documentation.
