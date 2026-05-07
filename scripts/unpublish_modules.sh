#!/bin/bash

# Configuration
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Dependency check
if ! command -v fzf &> /dev/null; then
    echo "Error: 'fzf' is not installed."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "Error: 'npm' is not installed."
    exit 1
fi

# Authentication check
if [ "$DRY_RUN" = false ]; then
    echo "Checking npm authentication..."
    current_user=$(npm whoami 2>/dev/null)
    if [ $? -ne 0 ] || [ -z "$current_user" ]; then
        echo "Error: You are not logged in to npm. Please run 'npm login' first."
        exit 1
    else
        echo "Authenticated as: $current_user"
    fi
fi

# Step 1: Find all modules in the monorepo and choose one
echo "Scanning monorepo packages..."
packages_list=$(node -e "
const fs = require('fs');
const path = require('path');
const dirs = ['apps', 'packages', 'assets', 'plugins'];
const names = new Set();
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(sub => {
    const pkgPath = path.join(dir, sub, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name) names.add(pkg.name);
      } catch (e) {}
    }
  });
});
console.log(Array.from(names).join('\n'));
")

if [ -z "$packages_list" ]; then
    echo "Error: No packages found in the monorepo."
    exit 1
fi

selected_package=$(echo "$packages_list" | fzf \
    --header "Select a module to unpublish (Enter to confirm)" \
    --height 40% \
    --layout=reverse)

if [ -z "$selected_package" ]; then
    echo "No package selected. Aborting."
    exit 0
fi

# Step 2: Fetch and list versions
echo "Fetching published versions of '$selected_package' from npm registry..."
versions_json=$(npm view "$selected_package" versions --json 2>/dev/null)
status=$?

if [ $status -ne 0 ] || [ -z "$versions_json" ]; then
    echo "Error: Could not retrieve versions for package '$selected_package'. Is it published on npm?"
    exit 1
fi

versions=$(echo "$versions_json" | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  console.log(Array.isArray(d) ? d.reverse().join('\n') : d);
} catch (e) {
  process.exit(1);
}
")

if [ -z "$versions" ]; then
    echo "Error: No versions found for '$selected_package'."
    exit 1
fi

selected_versions=$(echo "$versions" | fzf -m \
    --header "Select versions of $selected_package to UNPUBLISH (Tab to mark multiple, Enter to confirm)" \
    --height 50% \
    --layout=reverse)

if [ -z "$selected_versions" ]; then
    echo "No versions selected. Aborting."
    exit 0
fi

# Step 3: Execution/Dry Run
if [ "$DRY_RUN" = true ]; then
    echo -e "\n--- DRY RUN MODE: No changes will be made ---\n"
    for version in $selected_versions; do
        echo "[DRY-RUN] npm unpublish ${selected_package}@${version}"
    done
    echo -e "\nDry run finished."
else
    # Confirmation for actual unpublishing
    echo -e "\nSelected versions of $selected_package for unpublishing:"
    for version in $selected_versions; do
        echo "  - $version"
    done
    printf "\nAre you sure you want to UNPUBLISH these versions? This action is IRREVERSIBLE! (y/N): "
    read -r confirm

    if [[ "$confirm" =~ ^[yY]$ ]]; then
        OTP_CODE=""
        for version in $selected_versions; do
            while true; do
                echo "Unpublishing: ${selected_package}@${version}"
                
                # Build command args
                args=("unpublish" "${selected_package}@${version}")
                if [ -n "$OTP_CODE" ]; then
                    args+=("--otp=$OTP_CODE")
                fi
                
                output=$(npm "${args[@]}" 2>&1)
                status=$?
                
                if [ $status -eq 0 ]; then
                    echo "✅ Successfully unpublished ${selected_package}@${version}"
                    break
                else
                    # Check if error is EOTP
                    if echo "$output" | grep -q "EOTP"; then
                        echo -e "⚠️  This operation requires a One-Time Password (OTP)."
                        printf "Enter OTP code: "
                        read -r OTP_CODE
                        if [ -z "$OTP_CODE" ]; then
                            echo -e "❌ Cancelled OTP input. Skipping ${selected_package}@${version}.\n"
                            break
                        fi
                        # Loop continues and retries the same version with the new OTP_CODE
                    else
                        echo -e "❌ Failed to unpublish ${selected_package}@${version}:\n$output\n"
                        break
                    fi
                fi
            done
        done
        echo "Unpublish process complete."
    else
        echo "Operation cancelled."
    fi
fi
