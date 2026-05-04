#!/bin/bash

# Configuration
REMOTE="origin"
DRY_RUN=false
TYPE="tags"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -t|--type)
            TYPE="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Validate type
if [[ "$TYPE" != "tags" && "$TYPE" != "releases" ]]; then
    echo "Error: Invalid type '$TYPE'. Must be 'tags' or 'releases'."
    echo "Usage: $0 [--type tags|releases] [--dry-run]"
    exit 1
fi

# Dependency check
if ! command -v fzf &> /dev/null; then
    echo "Error: 'fzf' is not installed."
    exit 1
fi

if [[ "$TYPE" == "releases" ]] && ! command -v gh &> /dev/null; then
    echo "Error: 'gh' (GitHub CLI) is not installed. Required for deleting releases."
    exit 1
fi

# Step 1: Refresh data
if [[ "$TYPE" == "tags" ]]; then
    echo "Fetching tags from $REMOTE..."
    git fetch --tags --prune
else
    echo "Fetching releases from GitHub..."
fi

# Step 2: Fuzzy selection
if [[ "$TYPE" == "tags" ]]; then
    selected_items=$(git tag -l | fzf -m \
        --header "Select tags to DELETE (Tab to mark multiple, Enter to confirm)" \
        --preview "git show --summary {}" \
        --preview-window=right:50%)
else
    selected_items=$(gh release list --json tagName,name --jq '.[].tagName' | fzf -m \
        --header "Select releases to DELETE (Tab to mark multiple, Enter to confirm)" \
        --preview "gh release view {}" \
        --preview-window=right:50%)
fi

if [[ -z "$selected_items" ]]; then
    echo "No $TYPE selected. Aborting."
    exit 0
fi

# Step 3: Execution/Dry Run
if [ "$DRY_RUN" = true ]; then
    echo -e "\n--- DRY RUN MODE: No changes will be made ---\n"
    for item in $selected_items; do
        if [[ "$TYPE" == "tags" ]]; then
            echo "[DRY-RUN] git tag -d $item"
            echo "[DRY-RUN] git push $REMOTE --delete $item"
        else
            echo "[DRY-RUN] gh release delete $item --yes"
        fi
    done
    echo -e "\nDry run finished."
else
    # Confirmation for actual deletion
    echo -e "\nSelected $TYPE for deletion:"
    echo "$selected_items"
    printf "\nAre you sure you want to delete these $TYPE? (y/N): "
    read -r confirm

    if [[ "$confirm" =~ ^[yY]$ ]]; then
        for item in $selected_items; do
            echo "Deleting: $item"
            if [[ "$TYPE" == "tags" ]]; then
                git tag -d "$item"
                git push "$REMOTE" --delete "$item"
            else
                gh release delete "$item" --yes
            fi
        done
        echo "Cleanup complete."
    else
        echo "Operation cancelled."
    fi
fi