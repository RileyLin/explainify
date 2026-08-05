# Session Explanation Context-Blind Gate

Give the reviewer only `index.html`. After five minutes, ask:

1. What was the session objective?
2. What outcome did the session reach?
3. What files or system behavior changed?
4. Why did the session choose this approach?
5. How does the relevant workflow or code path work now?
6. What verification ran, and what passed or failed?
7. What should a reviewer inspect first?
8. What remains unknown or unfinished?

Score one point per evidence-consistent answer. The gate passes at 7.2/8
(90%); round only after aggregating multiple reviewers.

Run separately for:

- `featureFixture()` (`fixture-feature-waitlist`);
- `debuggingFixture()` (`fixture-debug-navigation`).

Do not reveal the fixture bundle, package JSON, or source code until scoring is
complete. Use the package and raw source escape only to adjudicate answers.
