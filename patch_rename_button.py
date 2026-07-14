import re

with open('app/smart-planner/page.tsx', 'r') as f:
    content = f.read()

content = content.replace('Resume from Failure', 'Retry Nano Banana (Step 2)')

with open('app/smart-planner/page.tsx', 'w') as f:
    f.write(content)
