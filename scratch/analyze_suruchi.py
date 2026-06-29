import json

with open("scratch/projects_data.json", "r") as f:
    data = json.load(f)

for d in data:
    state = d.get("state", {})
    if state.get("projectName") == "SURUCHI":
        print("FOUND SURUCHI")
        print("Session ID:", d['session_id'])
        history = state.get("conversationHistory", [])
        
        print("\n--- History Types ---")
        for i, msg in enumerate(history):
            role = msg.get("role")
            ctype = msg.get("customType", "none")
            text = msg.get("parts", [{}])[0].get("text", "")[:50].replace("\n", " ")
            print(f"[{i}] {role} ({ctype}): {text}")
        
        break
