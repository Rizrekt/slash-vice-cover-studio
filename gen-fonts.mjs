import { readFileSync, writeFileSync } from "node:fs";
const fonts = {
  Anton: "app/assets/fonts/Anton-Regular.ttf",
  ArchivoBlack: "app/assets/fonts/ArchivoBlack-Regular.ttf",
  KaushanScript: "app/assets/fonts/KaushanScript-Regular.ttf",
};
const out = ["// Generated in-session by gen-fonts.mjs — do not hand-edit.", "export const FONTS = {"];
for (const [name, p] of Object.entries(fonts)) {
  out.push(`  ${name}: "${readFileSync(p).toString("base64")}",`);
}
out.push("};");
writeFileSync("app/src/fonts.js", out.join("\n") + "\n");
console.log("fonts.js written");
