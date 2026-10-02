# Reviewed transparent product photographs

Twelve original local product images, including Weihenstephaner Hefeweißbier Dunkel, were processed on 2026-10-02 with alpha-only masks. The original files and the full-size cutout RGB pixels are preserved. Card and map WebP derivatives scale the complete source canvas proportionally.

The source image and derivative SHA-256 values, exact beer IDs, contour parameters, framing and review status are recorded in [catalog-cutouts.json](catalog-cutouts.json). Source URLs, author credits and license fields remain in the complete beer catalogue and original source notices. Derivation does not grant new rights in the product photographs.

Reproduction: `scripts/cutout-existing-products.py`. Integration: `scripts/apply-catalog-image-cutouts.mjs`; it rejects changed source identities, changed bytes, unreviewed records and unknown beer IDs.

Blest Scotch (exact UID 457181): the complete bottle was extracted from the original bottle-and-can studio photo using `scripts/cutout-blest-scotch.py --approve-reviewed`. The can, white backdrop and cast shadow are transparent in the derivative; bottle RGB and the original photograph remain unchanged. Visually reviewed on light and dark backgrounds.

Tui Na uses the retained full original JPEG from `imageOriginal`, normalized by its EXIF orientation before alpha masking. The previous display card and original are retained separately. RGB values are unchanged after orientation; no label is repainted.
