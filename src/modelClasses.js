export const MODEL_CLASSES = Object.freeze(["Ice", "Fire", "Thunder", "Stone"]);
export const MIN_CAST_CONFIDENCE = 95;

export function canonicalClass(value) {
  const candidate = String(value ?? "").trim().toLowerCase();
  return MODEL_CLASSES.find((name) => name.toLowerCase() === candidate) || null;
}

export function isAudioAuxiliaryClass(value) {
  const candidate = String(value ?? "").trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
  return candidate === "background noise" || candidate === "unknown";
}

export function validateModelLabels(labels, { allowAudioAuxiliary = false } = {}) {
  const supplied = Array.isArray(labels) ? labels : [];
  const gameplayLabels = allowAudioAuxiliary
    ? supplied.filter((label) => !isAudioAuxiliaryClass(label))
    : supplied;
  const normalized = gameplayLabels.map(canonicalClass);
  const valid = gameplayLabels.length === MODEL_CLASSES.length
    && normalized.every(Boolean)
    && new Set(normalized).size === MODEL_CLASSES.length;

  if (!valid) {
    const found = supplied.length ? supplied.join(", ") : "none";
    throw new Error(`Model classes must be exactly ${MODEL_CLASSES.join(", ")}. Found: ${found}`);
  }

  return normalized;
}

export function emptyProbabilityMap(initial = 0) {
  return Object.fromEntries(MODEL_CLASSES.map((name) => [name, initial]));
}

export function randomModelClass(currentClass = null, random = Math.random) {
  const choices = currentClass
    ? MODEL_CLASSES.filter((name) => name !== currentClass)
    : MODEL_CLASSES;
  return choices[Math.floor(random() * choices.length)];
}

export function canCastDetectedClass(detectedClass, requiredClass, confidence) {
  const detected = canonicalClass(detectedClass);
  const required = canonicalClass(requiredClass);
  const score = Number(confidence);
  return Boolean(detected && required && detected === required && score >= MIN_CAST_CONFIDENCE && score <= 100);
}
