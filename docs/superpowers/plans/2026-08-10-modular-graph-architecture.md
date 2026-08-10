# Modular Graph Architecture Implementation Plan

1. Add one failing architecture test for the root graph and its onboarding and leave subgraphs.
2. Introduce stable runtime enums and migrate repeated workflow action and route values.
3. Extract state schemas and pure routing functions.
4. Extract shared, onboarding, and leave node factories from the current workflow files.
5. Build graph-only onboarding, leave, and root HCM graph factories using static subgraphs.
6. Move deterministic review and leave proposal calculations into services.
7. Migrate the service, Studio, tests, and imports; remove the obsolete workflows directory.
8. Update README and architecture documentation.
9. Run generation, tests, type checking, linting, formatting, build, and Studio topology verification.
10. Review the complete diff, open a PR to `release`, merge it, update tracking, and clean the feature branch.
