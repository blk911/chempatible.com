# Duh Wild brand trial

Display name: Duh Wild. Landing headline: Catch a vibe. In Duh Wild.

The trial changes visible wordmarks, app and admin copy, generated email display names and branded text, metadata, icons and social preview art. It keeps chempatible.com, hello@chempatible.com, existing legal operator references, all account and relationship data, internal identifiers, and deployment configuration. No DNS, credential, schema, question, consent or invitation behavior changes are part of the trial. The current named friend email form and confirmation-to-dashboard flow are preserved. Historical emails are unchanged.

Built from main 043b82e336d53b1920c431262bc84faa2bb0ced1; public rollback baseline d8557d64d9a1cd85647aa188a357dfd9e8993ed1. Use a normal reverting commit or the retained previous deployment to restore the presentation. No database reset is involved. Recheck branches before promotion to preserve concurrent work.

Regression fixtures were updated to the existing named friend email and shareable-link behavior; the old baseline fixtures predated those changes. The admin cookie tamper test now always changes a character instead of occasionally preserving a trailing zero. All provider and account fixtures remain synthetic. Physical-phone sharing and camera behavior are not newly claimed by this visual trial.

The social preview and touch icons are new renders of source SVG, not modifications of the previous supplied logo. Older raster assets remain in repository history and are excluded from runtime packaging. Private video remains excluded.
