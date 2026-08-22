#!/usr/bin/env node
import { validateModelLabels } from "../src/modelClasses.js";

const baseUrl = process.argv[2] || process.env.VITE_TM_MODEL_URL;
if (!baseUrl) {
  throw new Error("Pass a model URL: npm run verify:model -- https://teachablemachine.withgoogle.com/models/…/");
}
const normalizedUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

const metadataResponse = await fetch(`${normalizedUrl}metadata.json`);
if (!metadataResponse.ok) throw new Error(`metadata.json returned HTTP ${metadataResponse.status}`);
const metadata = await metadataResponse.json();
const metadataLabels = metadata.labels || metadata.wordLabels || metadata.words || [];
const packageName = String(metadata.packageName || "");
const isAudio = packageName.toLowerCase().includes("audio")
  || packageName.toLowerCase().includes("speech-commands")
  || Array.isArray(metadata.wordLabels)
  || Array.isArray(metadata.words);
const labels = validateModelLabels(metadataLabels, { allowAudioAuxiliary: isAudio });

const modelResponse = await fetch(`${normalizedUrl}model.json`);
if (!modelResponse.ok) throw new Error(`model.json returned HTTP ${modelResponse.status}`);
const model = await modelResponse.json();
const weightPaths = model.weightsManifest?.flatMap((group) => group.paths || []) || [];
if (!weightPaths.length) throw new Error("model.json does not contain a weights manifest");

for (const weightPath of weightPaths) {
  const weightUrl = new URL(weightPath, normalizedUrl);
  const weightResponse = await fetch(weightUrl, { method: "HEAD" });
  if (!weightResponse.ok) throw new Error(`${weightPath} returned HTTP ${weightResponse.status}`);
}

console.log(JSON.stringify({
  modelUrl: normalizedUrl,
  modelName: metadata.modelName,
  package: `${metadata.packageName}@${metadata.packageVersion}`,
  labels,
  weights: weightPaths,
  status: "ready",
}, null, 2));
