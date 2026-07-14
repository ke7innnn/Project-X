import re

with open('app/smart-planner/page.tsx', 'r') as f:
    content = f.read()

# 1. Increase debug console height
content = content.replace('h-[320px] shrink-0 border-t', 'h-[400px] shrink-0 border-t')

# 2. Increase pipeline images
content = content.replace('w-32 h-32', 'w-48 h-48')

with open('app/smart-planner/page.tsx', 'w') as f:
    f.write(content)
