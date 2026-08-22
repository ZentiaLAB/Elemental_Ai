import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_CLASSES, canCastDetectedClass, canonicalClass, emptyProbabilityMap, isAudioAuxiliaryClass, randomModelClass, validateModelLabels } from "../src/modelClasses.js";

test("locks the game to the four elemental classes", () => {
  assert.deepEqual(MODEL_CLASSES, ["Ice", "Fire", "Thunder", "Stone"]);
});

test("accepts class names regardless of case and surrounding spaces", () => {
  assert.equal(canonicalClass(" thunder "), "Thunder");
  assert.deepEqual(validateModelLabels(["stone", "ICE", "Fire", "Thunder"]), ["Stone", "Ice", "Fire", "Thunder"]);
});

test("rejects missing, duplicate, or unknown model classes", () => {
  assert.throws(() => validateModelLabels(["Ice", "Fire", "Thunder"]), /must be exactly/);
  assert.throws(() => validateModelLabels(["Ice", "Fire", "Thunder", "Thunder"]), /must be exactly/);
  assert.throws(() => validateModelLabels(["Ice", "Fire", "Thunder", "Wind"]), /must be exactly/);
});

test("allows only the standard Audio background and unknown helper classes", () => {
  assert.equal(isAudioAuxiliaryClass("_background_noise_"), true);
  assert.equal(isAudioAuxiliaryClass("Background Noise"), true);
  assert.deepEqual(validateModelLabels(["_background_noise_", "Ice", "Fire", "Thunder", "Stone"], { allowAudioAuxiliary: true }), ["Ice", "Fire", "Thunder", "Stone"]);
  assert.throws(() => validateModelLabels(["Ice", "Fire", "Thunder", "Stone", "Wind"], { allowAudioAuxiliary: true }), /must be exactly/);
});

test("creates a complete classifier probability map", () => {
  assert.deepEqual(emptyProbabilityMap(), { Ice: 0, Fire: 0, Thunder: 0, Stone: 0 });
});

test("randomizes a required class without repeating the previous pose", () => {
  assert.equal(randomModelClass(null, () => 0), "Ice");
  assert.equal(randomModelClass("Ice", () => 0), "Fire");
  assert.equal(randomModelClass("Thunder", () => 0.99), "Stone");
});

test("casts only the required class at 95 to 100 percent confidence", () => {
  assert.equal(canCastDetectedClass("Ice", "Ice", 94), false);
  assert.equal(canCastDetectedClass("Ice", "Ice", 95), true);
  assert.equal(canCastDetectedClass("ice", "Ice", 100), true);
  assert.equal(canCastDetectedClass("Ice", "Fire", 99), false);
  assert.equal(canCastDetectedClass("Ice", "Ice", 101), false);
});
