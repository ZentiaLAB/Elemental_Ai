import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("does not expose demo spell clicks or keyboard shortcuts", () => {
  assert.doesNotMatch(source, /onClick=\{\(\) => castSpell/);
  assert.doesNotMatch(source, /KEY_MAP|addEventListener\(["']keydown/);
  assert.doesNotMatch(source, /Continue in demo mode/);
});

test("guards spell casting behind trusted model output", () => {
  assert.match(source, /source !== "model"/);
  assert.match(source, /canCastDetectedClass\(spellName, requiredSpell, modelConfidence\)/);
});

test("runs continuously and resets local progress on reload", () => {
  assert.doesNotMatch(source, /ROUND|setRound|sessionStorage|localStorage/);
  assert.match(source, /useState\(0\).*monstersDefeated|monstersDefeated.*useState\(0\)/s);
});

test("selects Pose, Image, or Audio inference from model metadata", () => {
  assert.match(source, /"@teachablemachine\/pose"/);
  assert.match(source, /"@teachablemachine\/image"/);
  assert.match(source, /modelTypeRef\.current === "pose"/);
  assert.match(source, /modelRef\.current\.predict\(video, false\)/);
  assert.match(source, /"@teachablemachine\/audio"/);
  assert.match(source, /speechCommands/);
  assert.match(source, /recognizer\.listen/);
  assert.match(source, /getRuntimeConfig\(metadata\)/);
});
