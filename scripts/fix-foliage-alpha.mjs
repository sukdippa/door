// Convert foliage cutout materials from alphaMode BLEND -> MASK.
//
// Grass/leaf/flower cards exported as BLEND don't write depth and get sorted
// per-object by centroid, so a plane behind can draw over one in front. MASK
// (alpha clip) writes depth and discards per-pixel below the cutoff, giving
// correct ordering in every viewer.
//
// Runs as a post-step of `npm run optimize:glb`, so it operates on the
// draco-compressed output — hence the draco encoder/decoder registration.
//
// Heuristic: only BLEND materials that have a base-color texture are treated as
// cutout cards. A textureless tinted-glass material (if you ever add one) stays
// BLEND. If you intentionally add a *textured* transparent material, exclude it
// by name below.

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const FILE = process.argv[2] ?? "public/door2.glb";
const CUTOFF = 0.5;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});

const doc = await io.read(FILE);

const converted = [];
for (const material of doc.getRoot().listMaterials()) {
  if (material.getAlphaMode() === "BLEND" && material.getBaseColorTexture()) {
    material.setAlphaMode("MASK");
    material.setAlphaCutoff(CUTOFF);
    converted.push(material.getName() || "(unnamed)");
  }
}

if (converted.length === 0) {
  console.log("fix-foliage-alpha: no BLEND cutout materials found — nothing to do.");
} else {
  await io.write(FILE, doc);
  console.log(
    `fix-foliage-alpha: BLEND -> MASK (cutoff ${CUTOFF}) on ${converted.length} material(s): ${converted.join(", ")}`
  );
}
