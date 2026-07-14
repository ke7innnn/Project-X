import re

with open('app/smart-planner/page.tsx', 'r') as f:
    content = f.read()

# Replace handleGenerate with generateFloorPlanImage
content = content.replace('onClick={() => handleGenerate()}', 'onClick={() => generateFloorPlanImage(roomSchedule)}')
content = content.replace('onClick={() => handleGenerate(true)}', 'onClick={() => generateFloorPlanImage(roomSchedule, true)}')
content = content.replace('onClick={handleRestartStep1}', 'onClick={handleRestartStep1}')

# Inject handleRestartStep1 if it doesn't exist
if 'const handleRestartStep1' not in content:
    content = content.replace(
        '  const generateFloorPlanImage = async (schedule: RoomSchedule, resumeStep2 = false) => {',
        '''  const handleRestartStep1 = () => {
    setDebugStep1OutputUrl('');
    setDebugStep1BaseImage('');
    setDebugStep1MaskImage('');
    setDebugStep2TraceImage('');
    setDebugStep15Schematic('');
    setDebugStep35Prompt('');
    setDebugStep4OutputUrl('');
    generateFloorPlanImage(roomSchedule);
  };

  const generateFloorPlanImage = async (schedule: RoomSchedule, resumeStep2 = false) => {'''
    )

with open('app/smart-planner/page.tsx', 'w') as f:
    f.write(content)
