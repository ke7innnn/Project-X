import json

with open("scratch/projects_data.json", "r") as f:
    data = json.load(f)

print(f"Found {len(data)} latest projects.")

for d in data:
    state = d.get("state", {})
    history = state.get("conversationHistory", [])
    print(f"ID: {d['session_id'][:8]} | Updated: {d['updated_at']} | Phase: {state.get('phase', 'N/A')} | Msg Count: {len(history)} | Name: {state.get('projectName', '')} | Place: {state.get('placeName', '')}")
