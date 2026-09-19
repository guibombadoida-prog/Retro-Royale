#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://openapi.tripo3d.ai/v3";
const MODEL_VERSION = "v3.1-20260211";
const POLL_INTERVAL_MS = 2000;
const MIN_REQUEST_INTERVAL_MS = 1000;
const OUTPUT_ROOT = path.resolve(process.cwd(), "assets", "models");

/*
 * Add more entries here as the project grows.
 * imageUrl is optional. When present, image-to-model is used instead of text-to-model.
 */
const ASSETS = [
  {
    name: "retro-knight",
    prompt: "stylized retro-futuristic arena fighter, humanoid biped, game-ready, clean silhouette, blue neon accents, detailed but optimized 3D game asset"
  }
];

const ANIMATIONS = [
  { api: "preset:biped:idle", filename: "idle" },
  { api: "preset:biped:walk", filename: "walk" },
  { api: "preset:biped:run", filename: "run" },
  { api: "preset:biped:slash", filename: "attack" },
  { api: "preset:biped:hurt", filename: "hurt" }
];

let lastRequestAt = 0;

await loadLocalEnv();

const API_KEY = process.env.TRIPO_API_KEY;
if (!API_KEY) {
  console.error("TRIPO_API_KEY is required. Set it in your environment or local .env file.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimit() {
  const elapsed = Date.now() - lastRequestAt;
  const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function apiRequest(method, endpoint, body) {
  await rateLimit();

  const response = await fetch(API_BASE + endpoint, {
    method,
    headers: {
      "Authorization": "Bearer " + API_KEY,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Tripo returned a non-JSON response (HTTP " + response.status + ").");
  }

  if (!response.ok || data.code !== 0) {
    const message = data.message || ("HTTP " + response.status);
    const suggestion = data.suggestion ? " | " + data.suggestion : "";
    throw new Error("Tripo API error: " + message + suggestion);
  }

  return data.data ?? data;
}

async function pollTask(taskId, label) {
  let lastProgress = -1;

  while (true) {
    const result = await apiRequest("GET", "/tasks/" + encodeURIComponent(taskId));
    const progress = Number(result.progress ?? -1);

    if (progress >= 0 && progress !== lastProgress) {
      console.log("[" + label + "] progresso: " + progress + "%");
      lastProgress = progress;
    }

    if (result.status === "success") {
      return result;
    }

    if (result.status === "failed" || result.status === "cancelled") {
      throw new Error("[" + label + "] task terminou com status: " + result.status);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

async function createModel(asset) {
  const endpoint = asset.imageUrl ? "/generation/image-to-model" : "/generation/text-to-model";
  const body = asset.imageUrl
    ? {
        input: asset.imageUrl,
        model: MODEL_VERSION,
        texture: true,
        pbr: true
      }
    : {
        prompt: asset.prompt,
        model: MODEL_VERSION,
        texture: true,
        pbr: true,
        texture_quality: "detailed"
      };

  const result = await apiRequest("POST", endpoint, body);
  console.log("[" + asset.name + "] task de geração criada: " + result.task_id);
  return result.task_id;
}

async function runAsset(asset) {
  console.log("\n=== Gerando " + asset.name + " ===");

  const modelTaskId = await createModel(asset);
  const modelResult = await pollTask(modelTaskId, asset.name + " / modelo");

  const modelUrl = modelResult.output?.model_url;
  if (!modelUrl) {
    throw new Error("[" + asset.name + "] output.model_url não encontrado.");
  }

  const rigCheckCreated = await apiRequest("POST", "/animations/rig-check", {
    input: modelTaskId
  });
  console.log("[" + asset.name + "] rig-check criado: " + rigCheckCreated.task_id);

  const rigCheckResult = await pollTask(rigCheckCreated.task_id, asset.name + " / rig-check");
  if (!rigCheckResult.output?.riggable) {
    throw new Error("[" + asset.name + "] modelo não é riggável.");
  }

  const rigType = rigCheckResult.output.rig_type;
  console.log("[" + asset.name + "] rig recomendado: " + rigType);

  const rigCreated = await apiRequest("POST", "/animations/rig", {
    input: modelTaskId,
    rig_type: rigType,
    spec: "tripo",
    out_format: "glb",
    model: rigType === "biped" ? "v1.0-20240301" : "v2.5-20260210"
  });
  console.log("[" + asset.name + "] rig task criada: " + rigCreated.task_id);

  const rigResult = await pollTask(rigCreated.task_id, asset.name + " / rig");
  const rigTaskId = rigResult.task_id || rigCreated.task_id;

  const retargetCreated = await apiRequest("POST", "/animations/retarget", {
    input: rigTaskId,
    animations: ANIMATIONS.map((animation) => animation.api),
    out_format: "glb",
    bake_animation: true,
    export_with_geometry: true,
    animate_in_place: false
  });
  console.log("[" + asset.name + "] retarget task criada: " + retargetCreated.task_id);

  const retargetResult = await pollTask(retargetCreated.task_id, asset.name + " / retarget");
  const output = retargetResult.output ?? {};
  const modelUrls = Array.isArray(output.model_urls)
    ? output.model_urls
    : output.model_url
      ? [output.model_url]
      : [];

  if (!modelUrls.length) {
    throw new Error("[" + asset.name + "] nenhum model_url/model_urls retornado.");
  }

  const destination = path.join(OUTPUT_ROOT, asset.name);
  await fs.mkdir(destination, { recursive: true });

  const mainModelPath = path.join(destination, asset.name + ".glb");
  await downloadFile(modelUrl, mainModelPath);
  console.log("[" + asset.name + "] download do modelo concluído: " + mainModelPath);

  for (let index = 0; index < modelUrls.length; index += 1) {
    const safeName = ANIMATIONS[index]?.filename ?? ("animation-" + (index + 1));
    const animationPath = path.join(destination, safeName + ".glb");
    await downloadFile(modelUrls[index], animationPath);
    console.log("[" + asset.name + "] animação concluída: " + safeName);
  }
}

async function downloadFile(url, destination) {
  await rateLimit();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Falha ao baixar asset (HTTP " + response.status + ").");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
}

async function loadLocalEnv() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const raw = await fs.readFile(envPath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const index = trimmed.indexOf("=");
      if (index === -1) continue;

      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

for (const asset of ASSETS) {
  await runAsset(asset);
}

console.log("\nPipeline concluído. Assets salvos em " + OUTPUT_ROOT);
