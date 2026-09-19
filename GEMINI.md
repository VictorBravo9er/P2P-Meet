# Repository Guidelines & Invariants

## Application Documentation Dossier Maintenance
- **Dossier Location**: `docs/` directory at repository root.
- **Invariant**: The application documentation dossier in `docs/` must remain completely self-contained and descriptive enough to understand the entire system without inspecting raw source code.
- **Trigger**: Whenever implementing new features, refactoring architecture, adjusting WebRTC protocols, modifying state handling, altering UI workflows, or changing settings:
  1. Update the corresponding document(s) in `docs/` as an integral part of the task.
  2. Keep all flow diagrams, state transition tables, and protocol descriptions synchronized and accurate.
  3. Ensure that no implementation details (such as media constraints, signaling message shapes, or event flows) diverge from the documentation.
