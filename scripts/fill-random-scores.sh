#!/usr/bin/env bash
# Fill random scores for all matches on the control page.
# Loops: find first "Enter Scores" -> click -> fill random -> Commit -> back to Schedule.

set -e
BASE_URL="${BASE_URL:-http://192.168.100.18:8080}"
EVENT_ID="${EVENT_ID:-1234}"
CONTROL_URL="$BASE_URL/event/$EVENT_ID/control/"

# Get first "Enter Scores" ref from snapshot
get_first_enter_scores_ref() {
  agent-browser snapshot -i 2>&1 | grep 'Enter Scores' | head -1 | sed -n 's/.*\[ref=\([^]]*\)].*/\1/p'
}

# Get Schedule tab ref from snapshot (for returning after commit)
get_schedule_tab_ref() {
  agent-browser snapshot -i 2>&1 | grep 'tab "Schedule"' | head -1 | sed -n 's/.*\[ref=\([^]]*\)].*/\1/p'
}

# Get Save Edits and Commit button refs (exact match to avoid "Commit & Post Last Match")
get_save_commit_refs() {
  local snap
  snap=$(agent-browser snapshot -i 2>&1)
  echo "$snap" | grep 'button "Save Edits"' | sed -n 's/.*\[ref=\([^]]*\)].*/\1/p'
  echo "$snap" | grep 'button "Commit" \[' | sed -n 's/.*\[ref=\([^]]*\)].*/\1/p'
}

# Fill all spinbuttons with random values; refs from current Score Edit page snapshot
fill_one_match_scores() {
  local snap
  snap=$(agent-browser snapshot -i 2>&1)
  local ref
  while IFS= read -r line; do
    ref=$(echo "$line" | sed -n 's/.*\[ref=\([^]]*\)].*/\1/p')
    [[ -z "$ref" ]] && continue
    local label
    label=$(echo "$line" | sed -n 's/.*spinbutton "\([^"]*\)".*/\1/p')
    local val
    if [[ "$label" == "MINOR" || "$label" == "MAJOR" ]]; then
      val=$((RANDOM % 4))
    else
      val=$((RANDOM % 16))
    fi
    agent-browser fill "@$ref" "$val"
  done < <(echo "$snap" | grep 'spinbutton')
}

echo "Navigating to $CONTROL_URL ..."
agent-browser open "$CONTROL_URL"
agent-browser wait 1500

# Ensure we're on Schedule tab
schedule_ref=$(get_schedule_tab_ref)
[[ -n "$schedule_ref" ]] && agent-browser click "@$schedule_ref" 2>/dev/null || true
agent-browser wait 500

match_num=0
while true; do
  ref=$(get_first_enter_scores_ref)
  [[ -z "$ref" ]] && break
  match_num=$((match_num + 1))
  echo "Match $match_num: Enter Scores @$ref"
  agent-browser click "@$ref"
  agent-browser wait 1200
  fill_one_match_scores
  # Get Save Edits and Commit refs from current page (Score Edit view)
  save_commit=($(get_save_commit_refs))
  [[ -n "${save_commit[0]}" ]] && agent-browser click "@${save_commit[0]}"  # Save Edits
  agent-browser wait 200
  [[ -n "${save_commit[1]}" ]] && agent-browser click "@${save_commit[1]}"  # Commit
  agent-browser wait 800
  # Return to Schedule tab - get ref from fresh snapshot
  schedule_ref=$(get_schedule_tab_ref)
  if [[ -n "$schedule_ref" ]]; then
    agent-browser click "@$schedule_ref"
  else
    echo "Warning: Schedule tab not found, retrying..."
    agent-browser wait 500
    schedule_ref=$(get_schedule_tab_ref)
    [[ -n "$schedule_ref" ]] && agent-browser click "@$schedule_ref"
  fi
  agent-browser wait 500
done

echo "Done: filled random scores for $match_num matches."
