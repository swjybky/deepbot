# DeepBot Linux text raster patch

Source: `longbridge/nsh`, commit `e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3`,
crate `nsh-platform-linux` 0.4.0, Apache-2.0.

The engine measures with `HintStyle::None`. The drawing thread must load its
fonts with the same options; `HintStyle::Slight` produces clipped CJK strokes
at intermediate sizes (notably 14 and 15) on GTK 4.22.4. The regression compares
the actual NSH render node against the original Pango layout at all seven
DeepBot text sizes. GPU rendering matches pixel for pixel. Cairo may differ
on a few faint antialias fringe pixels, so the assertion compares visible ink
(alpha >= 128); it still fails on the missing strokes before the fix.

Native GTK inputs use a separate Pango context. GTK 4.16+ automatic font
rendering also selects `HintStyle::Slight` with unhinted metrics, independently
of `src/text.rs`. `src/app.rs` configures the standalone host's process-local
GTK settings for manual, unhinted rendering before creating its window. The
enum is resolved dynamically to retain compatibility with GTK 4.14. This does
not write GNOME settings or change the policy of apps embedding `AppView`.
`src/text_input.rs` adds a native regression covering GtkText, GtkTextView and
placeholder GtkLabel at sizes 14, 15 and 16. Before the patch, the size-15 line
input differs from the unhinted reference by 687 visible ink pixels and its
placeholder by 533. After the patch all nine cases match under GL, Vulkan and
Cairo, and every input context has unhinted fonts and metrics.

Production changes are in `src/text.rs` and `src/app.rs`; regressions are in
`src/text.rs` and `src/text_input.rs`. The upstream font test
asset and its OFL license are included locally so the crate's tests compile
outside the NSH monorepo. `.cargo/config.toml`
applies this patch to both the app and NSH's generated host workspace. Remove
the override when an upgraded NSH release includes the equivalent fix.

Run from the repository root on Linux with a display:

```sh
CARGO_TARGET_DIR="$PWD/apps/desktop/target" cargo test --manifest-path vendor/nsh-platform-linux/Cargo.toml cjk_raster_matches_measured_layout -- --nocapture
CARGO_TARGET_DIR="$PWD/apps/desktop/target" cargo test --manifest-path vendor/nsh-platform-linux/Cargo.toml native_inputs_match_unhinted_reference -- --nocapture
```

Set `GSK_RENDERER` to `gl`, `vulkan` or `cairo` to check each renderer. DeepBot's
`InputTypographyFixture.tsx` exercises its actual TextField and MessageInput,
including entered text, placeholders, typing, clearing and submitting.
