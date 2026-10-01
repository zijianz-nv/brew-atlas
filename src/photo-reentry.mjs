// Hidden photographs may refill a safe gap after the coast/overlap delay.
// Eligibility belongs to each photograph, not to the number of siblings that
// remain visible at its brewery. Visible photographs never move to refill gaps.
export function photoReentryIds(photos, now, delay = 700) {
  return new Set(photos.filter(photo => !photo.visible && Number.isFinite(photo.hiddenSince)
    && now - photo.hiddenSince >= delay).map(photo => photo.id));
}
