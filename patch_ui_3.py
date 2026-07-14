import re

with open('app/smart-planner/page.tsx', 'r') as f:
    content = f.read()

content = content.replace("setDebugStep35Prompt('');", "")
content = content.replace("setDebugStep4OutputUrl('');", "")
content = content.replace("generateFloorPlanImage(roomSchedule);", "generateFloorPlanImage(roomSchedule!);")
content = content.replace("generateFloorPlanImage(roomSchedule, true)", "generateFloorPlanImage(roomSchedule!, true)")
content = content.replace("onClick={() => generateFloorPlanImage(roomSchedule)}", "onClick={() => generateFloorPlanImage(roomSchedule!)}")

with open('app/smart-planner/page.tsx', 'w') as f:
    f.write(content)
