#!/usr/bin/env bash
# Publish helm and open the catalog PR. Run from the repo root on a machine
# where `gh auth status` is logged in as P0GL0L. Idempotent where it can be.
set -euo pipefail
OWNER=P0GL0L; REPO=hermes-helm
gh repo view "$OWNER/$REPO" >/dev/null 2>&1 || gh repo create "$OWNER/$REPO" --public \
  --description "helm — a quieter Hermes Desktop: themes, a crew view, rendered customizable robots" --source . --remote origin
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
git push -u origin HEAD:main
SHA=$(git rev-parse HEAD); echo "pinned sha: $SHA"
WORK=$(mktemp -d); gh repo fork NousResearch/hermes-agent --clone=false >/dev/null 2>&1 || true
git clone --depth 1 --filter=blob:none --sparse "https://github.com/$OWNER/hermes-agent.git" "$WORK/ha"
cd "$WORK/ha" && git sparse-checkout set plugin-catalog
git remote add upstream https://github.com/NousResearch/hermes-agent.git && git fetch --depth 1 upstream main && git checkout -B add-helm upstream/main
sed "s/__SHA__/$SHA/g" "$OLDPWD/catalog/helm.yaml.tmpl" > plugin-catalog/helm.yaml
git add plugin-catalog/helm.yaml && git commit -m "plugin-catalog: add helm 0.3.0"
git push -u origin add-helm
gh pr create --repo NousResearch/hermes-agent --head "$OWNER:add-helm" --title "plugin-catalog: add helm (desktop themes + crew view)" --body-file "$OLDPWD/catalog/PR.md"
