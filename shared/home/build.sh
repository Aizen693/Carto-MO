#!/usr/bin/env bash
# Recompile la homepage Carto-MO : shared/home/*.jsx (sources) -> *.js (servis).
# A relancer apres CHAQUE edition d'un fichier .jsx de ce dossier.
#
#   Usage : bash shared/home/build.sh
#
# Necessite Node. Aucune dependance a installer dans le repo : @babel/standalone
# est telecharge dans un dossier temporaire puis supprime.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm install --silent @babel/standalone@7.29.0 >/dev/null 2>&1
node -e '
  const Babel = require("@babel/standalone"), fs = require("fs"), p = require("path");
  const dir = process.argv[1];
  for (const n of ["data","starfield","globe","home","panel","platform","app"]) {
    const src = fs.readFileSync(p.join(dir, n + ".jsx"), "utf8");
    const out = Babel.transform(src, { presets: ["react"], sourceType: "script" }).code;
    // IIFE wrap : evite la collision des `const` top-level entre fichiers.
    fs.writeFileSync(p.join(dir, n + ".js"), "(function () {\n" + out + "\n})();\n");
    console.log("  compiled " + n + ".jsx -> " + n + ".js");
  }
' "$DIR"
echo "OK — shared/home/*.js regeneres. Pense au cache-bust ?v= dans index.html."
