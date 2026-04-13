#!/bin/bash

# Configuration
REMOTE="origin"
DRY_RUN=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
    esac
done

# Dependency check
if ! command -v fzf &> /dev/null; then
    echo "Error: 'fzf' is not installed."
    exit 1
fi

# Step 1: Refresh tags
echo "Fetching tags from $REMOTE..."
git fetch --tags --prune

# Step 2: Fuzzy selection
selected_tags=$(git tag -l | fzf -m \
    --header "Select tags to DELETE (Tab to mark multiple, Enter to confirm)" \
    --preview "git show --summary {}" \
    --preview-window=right:50%)

if [[ -z "$selected_tags" ]]; then
    echo "No tags selected. Aborting."
    exit 0
fi

# Step 3: Execution/Dry Run
if [ "$DRY_RUN" = true ]; then
    echo -e "\n--- DRY RUN MODE: No changes will be made ---\n"
    for tag in $selected_tags; do
        echo "[DRY-RUN] git tag -d $tag"
        echo "[DRY-RUN] git push $REMOTE --delete $tag"
    done
    echo -e "\nDry run finished."
else
    # Confirmation for actual deletion
    echo -e "\nSelected tags for deletion:"
    echo "$selected_tags"
    printf "\nAre you sure you want to delete these tags? (y/N): "
    read -r confirm

    if [[ "$confirm" =~ ^[yY]$ ]]; then
        for tag in $selected_tags; do
            echo "Deleting: $tag"
            git tag -d "$tag"
            git push "$REMOTE" --delete "$tag"
        done
        echo "Cleanup complete."
    else
        echo "Operation cancelled."
    fi
fi