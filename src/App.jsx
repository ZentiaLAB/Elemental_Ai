import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaBolt, FaCamera, FaFire, FaGem, FaHeart, FaMagic, FaMicrophone, FaPlus, FaPlug, FaSkull, FaSnowflake, FaTimes } from "react-icons/fa";
import { MIN_CAST_CONFIDENCE, MODEL_CLASSES, canCastDetectedClass, canonicalClass, emptyProbabilityMap, randomModelClass, validateModelLabels } from "./modelClasses.js";

const SPELLS = {
  Ice: { effect: "FROST LANCE", color: "#36bfff", image: "/assets/generated/spell-ice.png", Icon: FaSnowflake },
  Fire: { effect: "PHOENIX BURST", color: "#ff5b28", image: "/assets/generated/spell-fire.png", Icon: FaFire },
  Thunder: { effect: "VOLT CHAIN", color: "#ffe146", image: "/assets/generated/spell-thunder.png", Icon: FaBolt },
  Stone: { effect: "TERRA FIST", color: "#c98a39", image: "/assets/generated/spell-stone.png", Icon: FaGem },
};

const ENEMIES = [
  { name: "EMBER IMP", maxHp: 1200, scene: "/assets/generated/arena-ember-imp.png" },
  { name: "FROST WRAITH", maxHp: 1800, scene: "/assets/generated/arena-frost-wraith.png" },
  { name: "GRANITE GOLEM", maxHp: 6000, scene: "/assets/generated/arena-granite-golem.png" },
  { name: "STORM HARPY", maxHp: 2600, scene: "/assets/generated/arena-storm-harpy.png" },
];

const CAST_COOLDOWN_MS = 900;
const MODEL_RUNTIMES = {
  "@teachablemachine/pose": { type: "pose", global: "tmPose", script: "https://cdn.jsdelivr.net/npm/@teachablemachine/pose@0.8.6/dist/teachablemachine-pose.min.js" },
  "@teachablemachine/image": { type: "image", global: "tmImage", script: "https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.4/dist/teachablemachine-image.min.js" },
  "@teachablemachine/audio": { type: "audio", global: "speechCommands", script: "https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.0/dist/speech-commands.min.js" },
};
const INITIAL_ENEMY_INDEX = Math.floor(Math.random() * ENEMIES.length);
const INITIAL_REQUIRED_SPELL = randomModelClass();

function randomEnemyIndex(currentIndex) {
  const choices = ENEMIES.map((_, index) => index).filter((index) => index !== currentIndex);
  return choices[Math.floor(Math.random() * choices.length)];
}

function normalizeModelUrl(value) {
  const normalized = value.trim();
  if (!normalized) throw new Error("Paste your Teachable Machine model URL first.");
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("The model URL must use HTTPS.");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function loadRuntime({ global, script }) {
  if (window[global]) return Promise.resolve(window[global]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-tm-runtime="${global}"]`);
    const runtimeScript = existing || document.createElement("script");
    const finish = () => window[global] ? resolve(window[global]) : reject(new Error(`${global} loaded without exposing its runtime.`));
    runtimeScript.addEventListener("load", finish, { once: true });
    runtimeScript.addEventListener("error", () => reject(new Error(`Could not load ${global}. Check your internet connection.`)), { once: true });
    if (!existing) {
      runtimeScript.src = script;
      runtimeScript.dataset.tmRuntime = global;
      document.head.appendChild(runtimeScript);
    }
  });
}

function getModelLabels(metadata) {
  if (Array.isArray(metadata.labels)) return metadata.labels;
  if (Array.isArray(metadata.wordLabels)) return metadata.wordLabels;
  if (Array.isArray(metadata.words)) return metadata.words;
  return [];
}

function getRuntimeConfig(metadata) {
  const packageName = String(metadata.packageName || "").toLowerCase();
  if (MODEL_RUNTIMES[metadata.packageName]) return MODEL_RUNTIMES[metadata.packageName];
  if (packageName.includes("speech-commands") || packageName.includes("teachablemachine/audio")) {
    return MODEL_RUNTIMES["@teachablemachine/audio"];
  }
  if (Array.isArray(metadata.wordLabels) || Array.isArray(metadata.words)) {
    return MODEL_RUNTIMES["@teachablemachine/audio"];
  }
  return null;
}

function SpellIcon({ name }) {
  const Icon = SPELLS[name].Icon;
  return <Icon aria-hidden="true" />;
}

export function App() {
  const [enemyIndex, setEnemyIndex] = useState(INITIAL_ENEMY_INDEX);
  const [enemyHp, setEnemyHp] = useState(ENEMIES[INITIAL_ENEMY_INDEX].maxHp);
  const [requiredSpell, setRequiredSpell] = useState(INITIAL_REQUIRED_SPELL);
  const [score, setScore] = useState(0);
  const [monstersDefeated, setMonstersDefeated] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [detected, setDetected] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [probabilities, setProbabilities] = useState(() => emptyProbabilityMap());
  const [modelOpen, setModelOpen] = useState(false);
  const [modelUrl, setModelUrl] = useState("");
  const [connectionState, setConnectionState] = useState("closed");
  const [inputMode, setInputMode] = useState("pose");
  const [visionReady, setVisionReady] = useState(false);
  const [message, setMessage] = useState("Open the camera and connect a model to cast spells");
  const [castState, setCastState] = useState("idle");
  const [attackId, setAttackId] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const enemy = ENEMIES[enemyIndex];
  const webcamRef = useRef(null);
  const videoRef = useRef(null);
  const rawStreamRef = useRef(null);
  const canvasRef = useRef(null);
  const predictionFrame = useRef(0);
  const modelRef = useRef(null);
  const modelTypeRef = useRef(null);
  const lastCastRef = useRef(Number.NEGATIVE_INFINITY);
  const defeatedRef = useRef(false);
  const requiredSpellRef = useRef(INITIAL_REQUIRED_SPELL);
  const castSpellRef = useRef(null);
  requiredSpellRef.current = requiredSpell;

  const castSpell = useCallback((spellName, source, modelConfidence) => {
    if (source !== "model" || !canCastDetectedClass(spellName, requiredSpell, modelConfidence)) return;
    const now = performance.now();
    if (now - lastCastRef.current < CAST_COOLDOWN_MS) return;
    lastCastRef.current = now;
    setAttackId((value) => value + 1);
    setScore((value) => value + 250);
    setCastState("hit");
    setMessage(`${SPELLS[spellName].effect} — super effective!`);
    window.setTimeout(() => {
      setCastState("idle");
      setRequiredSpell((current) => {
        const nextSpell = randomModelClass(current);
        setMessage(`Next pose — ${nextSpell.toUpperCase()}`);
        return nextSpell;
      });
    }, 820);
    setEnemyHp((currentHp) => {
      if (defeatedRef.current || currentHp === 0) return currentHp;
      const nextHp = Math.max(0, currentHp - 680);
      if (nextHp === 0) {
        defeatedRef.current = true;
        window.setTimeout(() => {
          const nextIndex = randomEnemyIndex(enemyIndex);
          setEnemyIndex(nextIndex);
          setEnemyHp(ENEMIES[nextIndex].maxHp);
          setMonstersDefeated((value) => value + 1);
          setMessage(`${ENEMIES[nextIndex].name} entered the arena`);
          defeatedRef.current = false;
        }, 820);
      }
      return nextHp;
    });
  }, [requiredSpell, enemyIndex]);
  castSpellRef.current = castSpell;

  useEffect(() => {
    if (hearts > 0) return;
    setMessage("Training reset — watch the weakness icon and try again");
    const timer = window.setTimeout(() => { setHearts(3); setEnemyHp(enemy.maxHp); setScore(0); }, 1300);
    return () => window.clearTimeout(timer);
  }, [hearts, enemy.maxHp]);

  useEffect(() => () => {
    cancelAnimationFrame(predictionFrame.current);
    modelRef.current?.stopListening?.();
    webcamRef.current?.stop?.();
    rawStreamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  const stopRawCamera = () => {
    rawStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    rawStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCameraPreview = async () => {
    setIsLoading(true);
    setMessage("Requesting webcam permission…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support webcam access.");
      webcamRef.current?.stop?.();
      webcamRef.current = null;
      cancelAnimationFrame(predictionFrame.current);
      stopRawCamera();
      let requestExpired = false;
      const cameraRequest = navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then((stream) => {
        if (requestExpired) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error("Camera request expired.");
        }
        return stream;
      });
      let permissionTimer;
      const permissionTimeout = new Promise((_, reject) => {
        permissionTimer = window.setTimeout(() => {
          requestExpired = true;
          reject(new Error("Camera permission is still waiting. Choose Allow in the browser, then press START CAMERA again."));
        }, 15000);
      });
      const stream = await Promise.race([cameraRequest, permissionTimeout]);
      window.clearTimeout(permissionTimer);
      rawStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setConnectionState("camera");
      setModelOpen(false);
      setMessage("Camera connected — add a model when you are ready for AI spells");
    } catch (error) {
      setConnectionState("error");
      setMessage(`Camera unavailable: ${error.message || error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runPredictionLoop = useCallback(async () => {
    if (!modelRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      predictionFrame.current = requestAnimationFrame(runPredictionLoop);
      return;
    }
    const context = canvasRef.current.getContext("2d");
    try {
      let pose = null;
      let results;
      if (modelTypeRef.current === "pose") {
        const poseResult = await modelRef.current.estimatePose(video);
        pose = poseResult.pose;
        results = await modelRef.current.predict(poseResult.posenetOutput);
      } else {
        results = await modelRef.current.predict(video, false);
      }
      context.clearRect(0, 0, 420, 300);
      context.drawImage(video, 0, 0, 420, 300);
      if (pose && window.tmPose) {
        window.tmPose.drawKeypoints(pose.keypoints, 0.55, context, 4, "#43f4ff", "#43f4ff");
        window.tmPose.drawSkeleton(pose.keypoints, 0.55, context, "#43f4ff");
      }
      setVisionReady(true);
      const mapped = results.map((item) => ({ name: canonicalClass(item.className), probability: item.probability })).filter((item) => item.name);
      const nextProbabilities = emptyProbabilityMap();
      mapped.forEach((item) => { nextProbabilities[item.name] = Math.round(item.probability * 100); });
      setProbabilities(nextProbabilities);
      const top = mapped.sort((a, b) => b.probability - a.probability)[0];
      if (top) {
        const nextConfidence = Math.round(top.probability * 100);
        setDetected(top.name);
        setConfidence(nextConfidence);
        if (canCastDetectedClass(top.name, requiredSpellRef.current, nextConfidence)) {
          castSpellRef.current?.(top.name, "model", nextConfidence);
        }
      }
    } catch (error) {
      setMessage(`Camera paused: ${error.message || error}`);
    }
    predictionFrame.current = requestAnimationFrame(runPredictionLoop);
  }, []);

  const handleAudioPrediction = useCallback((recognizer, labels, result) => {
    if (modelRef.current !== recognizer) return;
    const scores = Array.from(result.scores || []);
    const nextProbabilities = emptyProbabilityMap();
    const ranked = labels.map((label, index) => ({ name: canonicalClass(label), probability: Number(scores[index] || 0) }));
    ranked.forEach((item) => {
      if (item.name) nextProbabilities[item.name] = Math.round(item.probability * 100);
    });
    setProbabilities(nextProbabilities);
    const top = ranked.sort((a, b) => b.probability - a.probability)[0];
    if (!top?.name) {
      setDetected(null);
      setConfidence(0);
      return;
    }
    const nextConfidence = Math.round(top.probability * 100);
    setDetected(top.name);
    setConfidence(nextConfidence);
    if (canCastDetectedClass(top.name, requiredSpellRef.current, nextConfidence)) {
      castSpellRef.current?.(top.name, "model", nextConfidence);
    }
  }, []);

  const connectModel = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage("Reading Teachable Machine model…");
    try {
      const baseUrl = normalizeModelUrl(modelUrl);
      const metadataResponse = await fetch(`${baseUrl}metadata.json`);
      if (!metadataResponse.ok) throw new Error("Could not read metadata.json from this model URL.");
      const metadata = await metadataResponse.json();
      const labels = getModelLabels(metadata);
      const runtimeConfig = getRuntimeConfig(metadata);
      if (!runtimeConfig) {
        throw new Error(`Unsupported model type: ${metadata.packageName || "unknown"}. Use a Teachable Machine Pose, Image, or Audio project.`);
      }
      validateModelLabels(labels, { allowAudioAuxiliary: runtimeConfig.type === "audio" });
      setMessage(`Loading ${runtimeConfig.type.toUpperCase()} model…`);
      const runtime = await loadRuntime(runtimeConfig);
      cancelAnimationFrame(predictionFrame.current);
      modelRef.current?.stopListening?.();

      if (runtimeConfig.type === "audio") {
        stopRawCamera();
        const recognizer = runtime.create("BROWSER_FFT", undefined, `${baseUrl}model.json`, `${baseUrl}metadata.json`);
        await recognizer.ensureModelLoaded();
        const audioLabels = recognizer.wordLabels();
        validateModelLabels(audioLabels, { allowAudioAuxiliary: true });
        modelRef.current = recognizer;
        modelTypeRef.current = "audio";
        setInputMode("audio");
        setVisionReady(false);
        setDetected(null);
        setConfidence(0);
        setProbabilities(emptyProbabilityMap());
        setMessage("Requesting microphone permission…");
        await recognizer.listen((result) => handleAudioPrediction(recognizer, audioLabels, result), {
          includeSpectrogram: false,
          probabilityThreshold: 0.01,
          invokeCallbackOnNoiseAndUnknown: true,
          overlapFactor: 0.5,
        });
        setConnectionState("audio");
        setModelOpen(false);
        setMessage("AI Audio connected — microphone listening");
        return;
      }

      const nextModel = await runtime.load(`${baseUrl}model.json`, `${baseUrl}metadata.json`);
      if (!rawStreamRef.current || !videoRef.current?.srcObject) await startCameraPreview();
      if (!rawStreamRef.current || !videoRef.current?.srcObject) throw new Error("Camera permission is required for Pose and Image models.");
      modelRef.current = nextModel;
      modelTypeRef.current = runtimeConfig.type;
      setInputMode(runtimeConfig.type);
      setVisionReady(false);
      setConnectionState("live");
      setModelOpen(false);
      setMessage(`AI Vision connected — ${runtimeConfig.type.toUpperCase()} model ready`);
      predictionFrame.current = requestAnimationFrame(runPredictionLoop);
    } catch (error) {
      setConnectionState("error");
      setMessage(error.message || String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const hpPercent = Math.max(0, Math.round((enemyHp / enemy.maxHp) * 100));
  const spellNames = useMemo(() => MODEL_CLASSES, []);
  const inputLabel = inputMode === "audio" ? "SOUND" : inputMode === "image" ? "IMAGE" : "POSE";
  return (
    <main className={`lab-app cast-${castState}`}>
      <section className="battle-grid">
        <div className="arena">
          <img key={enemy.scene} className="arena-art" src={enemy.scene} alt={`${enemy.name} in the Elemental Lab arena`} />
          <div className="arena-shade" />
          <header className="arena-header">
            <h1>ELEMENTAL LAB</h1>
          </header>
          <div className="player-stats" aria-label={`${hearts} hearts, ${score} score, ${monstersDefeated} monsters defeated`}>
            <div className="hearts">{[0, 1, 2].map((index) => <FaHeart key={index} className={index < hearts ? "alive" : "lost"} />)}</div>
            <div className="score-star"><FaMagic /><strong>{score.toLocaleString()}</strong></div>
            <div className="kill-count" title="Monsters defeated this session"><FaSkull /><strong>{monstersDefeated}</strong><small>KOs</small></div>
          </div>
          <div className="enemy-hud">
            <h2>{enemy.name}</h2>
            <div className="enemy-health"><i style={{ width: `${hpPercent}%` }} /><span>{enemyHp.toLocaleString()} / {enemy.maxHp.toLocaleString()}</span></div>
            <div className="weak-orb" style={{ "--weak-color": SPELLS[requiredSpell].color }}><SpellIcon name={requiredSpell} /><small>{inputLabel}</small></div>
          </div>
          {detected && (
            <div key={attackId} className={`attack-effect attack-${castState} element-${detected.toLowerCase()}`} style={{ "--attack-color": SPELLS[detected].color }} aria-hidden="true">
              <span className="attack-vignette" />
              <span className="attack-sigil sigil-outer" /><span className="attack-sigil sigil-inner" />
              <img className="attack-power-art" src={SPELLS[detected].image} alt="" />
              <strong className="attack-title">{SPELLS[detected].effect}</strong>
              <span className="attack-projectile"><img src={SPELLS[detected].image} alt="" /></span>
              <span className="attack-trail trail-one" />
              <span className="attack-trail trail-two" />
              <span className="attack-burst"><SpellIcon name={detected} /></span>
              <i className="particle particle-one" /><i className="particle particle-two" /><i className="particle particle-three" /><i className="particle particle-four" />
            </div>
          )}
          <div className="mission-prompt">
            <strong>MATCH THE {inputLabel}</strong>
            <div className="matchup"><span>{enemy.name}</span><b>→</b><span style={{ color: SPELLS[requiredSpell].color }}><SpellIcon name={requiredSpell} />{requiredSpell.toUpperCase()}</span></div>
          </div>
          <div className="battle-message" aria-live="polite">{message}</div>
          <div className="impact-flash" />
        </div>

        <aside className="ai-panel">
          <header><span className="header-line" /><h2>AI SENSOR</h2><span className="header-line" /></header>
          <div className={`camera-feed ${connectionState} ${visionReady ? "vision-ready" : ""}`}>
            <video ref={videoRef} autoPlay muted playsInline aria-label="Live webcam preview" />
            <canvas ref={canvasRef} width="420" height="300" />
            {connectionState === "audio" && <div className="audio-listening"><FaMicrophone /><strong>MICROPHONE LIVE</strong><span>Listening for Ice · Fire · Thunder · Stone</span></div>}
            {connectionState !== "camera" && connectionState !== "live" && connectionState !== "audio" && (
              <button className="camera-plus" onClick={startCameraPreview} disabled={isLoading} aria-label="Open camera">
                <FaPlus /><span>{isLoading ? "OPENING CAMERA" : "OPEN CAMERA"}</span>
              </button>
            )}
            <button className="model-button" onClick={() => setModelOpen(true)} disabled={isLoading}><FaPlug /> {connectionState === "live" ? "VISION LIVE" : connectionState === "audio" ? "AUDIO LIVE" : "ADD AI MODEL"}</button>
          </div>
          <div className="recognition">
            <span>DETECTED CLASS</span>
            <div><strong style={{ color: detected ? SPELLS[detected].color : "#7893a6" }}>{detected ? detected.toUpperCase() : "WAITING"}</strong><b>{confidence}%</b></div>
            <small>CONFIDENCE · CAST AT {MIN_CAST_CONFIDENCE}%+</small>
            <div className="confidence-track"><i style={{ width: `${confidence}%`, background: detected ? SPELLS[detected].color : "#31516a" }} /></div>
          </div>
          <div className="probabilities">
            {spellNames.map((name) => (
              <div key={name} className={`probability-row ${detected === name ? "active" : ""}`} style={{ "--spell-color": SPELLS[name].color }}>
                <SpellIcon name={name} /><strong>{name.toUpperCase()}</strong><span>{probabilities[name]}%</span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="spell-rail" aria-label="Elemental spell status">
        {spellNames.map((name, index) => (
          <article key={name} className={`spell-card ${detected === name ? "detected" : ""} ${requiredSpell === name ? "required" : ""}`} style={{ "--spell-color": SPELLS[name].color }}>
            <img src={SPELLS[name].image} alt="" />
            <span className="spell-overlay" />
            <span className="spell-number">0{index + 1}</span>
            <span className="spell-name"><SpellIcon name={name} /><b>{name.toUpperCase()}</b></span>
            <strong className="effect-name">{SPELLS[name].effect}</strong>
            {requiredSpell === name && <em>CAST THIS</em>}
          </article>
        ))}
      </section>

      {modelOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModelOpen(false)}>
          <section className="model-modal" role="dialog" aria-modal="true" aria-labelledby="model-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setModelOpen(false)} aria-label="Close"><FaTimes /></button>
            <span className="modal-kicker">TEACHABLE MACHINE</span>
            <h2 id="model-title">CONNECT AI MODEL</h2>
            <p>Use a Pose, Image, or Audio Project with the four gameplay classes: <b>Ice</b>, <b>Fire</b>, <b>Thunder</b>, and <b>Stone</b>. Audio may also include its automatic Background Noise class.</p>
            <div className="supported-classes" aria-label="Supported model classes">
              {MODEL_CLASSES.map((name) => <span key={name} style={{ "--spell-color": SPELLS[name].color }}><SpellIcon name={name} />{name}</span>)}
            </div>
            <form onSubmit={connectModel}>
              <label htmlFor="model-url">Model URL</label>
              <input id="model-url" type="url" value={modelUrl} onChange={(event) => setModelUrl(event.target.value)} placeholder="https://teachablemachine.withgoogle.com/models/…/" autoFocus />
              <button type="submit" disabled={isLoading}><FaPlug /> {isLoading ? "CONNECTING…" : "CONNECT MODEL"}</button>
            </form>
            <button className="camera-only-button" onClick={startCameraPreview} disabled={isLoading}><FaPlus /> OPEN CAMERA WITHOUT MODEL</button>
            {connectionState === "error" && <div className="model-error">{message}</div>}
          </section>
        </div>
      )}
    </main>
  );
}
